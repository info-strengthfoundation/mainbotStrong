// handlers/kids.js
import { Markup } from "telegraf";
import fetch from "node-fetch";
import "dotenv/config";

export default function (bot, mainMenu, userState) {

    const BASE = process.env.AIRTABLE_IVENTS_BASE;
    const TABLE = "Заходи";

    const headers = {
        "Authorization": `Bearer ${process.env.AIRTABLE_TOKEN}`,
        "Content-Type": "application/json"
    };

    // -------------------------------------------------
    // 🔧 Форматування дати
    // -------------------------------------------------
    function formatUADate(isoString) {
        if (!isoString) return "Не вказано";
    
        const date = new Date(isoString);
        if (isNaN(date)) return "Не вказано";
    
        const months = [
            "січня", "лютого", "березня", "квітня", "травня", "червня",
            "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"
        ];
    
        const day = date.getDate();
        const month = months[date.getMonth()];
        const year = date.getFullYear();
    
        let hours = date.getHours();
        let minutes = date.getMinutes();
        if (hours < 10) hours = "0" + hours;
        if (minutes < 10) minutes = "0" + minutes;
    
        return `${day} ${month} ${year} року, ${hours}:${minutes}`;
    }

    // -------------------------------------------------
    // 🔄 Завантаження запису по ID з іншої таблиці
    // -------------------------------------------------
    async function loadRecordById(recordId, tableName) {
        if (!recordId || !tableName) return null;

        const url =
            `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(tableName)}/${recordId}`;

        try {
            const res = await fetch(url, { headers });
            const json = await res.json();
            return json.fields ? json : null;
        } catch (err) {
            console.error("❌ loadRecordById error:", err);
            return null;
        }
    }

    // -------------------------------------------------
    // 🔍 Resolve linked field
    // -------------------------------------------------
    async function resolveLinked(field, tableName) {
        if (!field) return "Не вказано";

        const id = Array.isArray(field) ? field[0] : field;
        if (!id || !id.startsWith("rec")) return field;

        const rec = await loadRecordById(id, tableName);
        if (!rec?.fields) return "Не вказано";

        return (
            rec.fields["Назва"] ||
            rec.fields["Назва об'єкта"] ||
            rec.fields["Ім'я"] ||
            rec.fields["Title"] ||
            "(назва не вказана)"
        );
    }

    // -------------------------------------------------
    // 📥 Завантаження всіх заходів
    // -------------------------------------------------
    async function loadEvents() {
        let url =
            `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLE)}`;

        let all = [];
        while (url) {
            const res = await fetch(url, { headers });
            const json = await res.json();

            if (json.records) all.push(...json.records);

            url = json.offset
                ? `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLE)}?offset=${json.offset}`
                : null;
        }

        return all;
    }

    // Головне меню Kids
    bot.hears("🎠 Заходи для дітей", async (ctx) => {
        userState[ctx.from.id] = { type: "kids", mode: null };
    
        await ctx.reply(
            "Ми дбаємо про те, щоб діти з родин військовополонених і зниклих безвісти мали простір для гри, розвитку й нових вражень. " +
            "Саме тому ми постійно організовуємо різні дитячі заходи.\n\n" +
            "Щоб переглянути актуальні заходи, оберіть дію нижче 👇",
            Markup.keyboard([
                ["🎠 Переглянути заходи"],
                ["↩️ Повернутися назад"]
            ]).resize()
        );
    });
    // Вибір міста

    bot.hears("🎠 Переглянути заходи", async ctx => {
        const userId = ctx.from.id;

        await ctx.reply("Завантажую заходи⏳");

        const events = await loadEvents();
        const now = new Date();

        const kidsEvents = events.filter(ev => {
            if (ev.fields["Тип"]?.trim() !== "Дитячий захід") return false;

            const dateStr = ev.fields["Дата та Час початку"];
            if (!dateStr) return false;

            return new Date(dateStr) >= now;
        });

        if (!kidsEvents.length) {
            return ctx.reply("Наразі немає майбутніх заходів для дітей.");
        }

        const cityIds = [
            ...new Set(
                kidsEvents.map(ev =>
                    Array.isArray(ev.fields["Місто"])
                        ? ev.fields["Місто"][0]
                        : ev.fields["Місто"]
                ).filter(Boolean)
            )
        ];

        let cities = [];
        for (const id of cityIds) {
            const rec = await loadRecordById(id, "Об'єкти України");
            if (rec?.fields?.["Назва"]) cities.push({ id, name: rec.fields["Назва"] });
        }

        userState[userId] = {
            type: "kids",
            mode: "choose_city",
            cities,
            kidsEvents
        };

        await ctx.reply(
            "Оберіть місто 👇\n\n" +
            "ℹ️ *Зверніть увагу:* якщо у списку немає вашого міста — це означає, що наразі немає доступних майбутніх дитячих заходів у вашому регіоні.",
            Markup.keyboard([
                ...cities.map(c => [c.name]),
                ["↩️ Повернутися назад"]
            ]).resize()
        );
    });

    // -------------------------------------------------
    // 🎭 3️⃣ Показ заходів у місті + перегляд заходу
    // -------------------------------------------------
    bot.on("text", async (ctx, next) => {
        const userId = ctx.from.id;
        const state = userState[userId];

        if (!state || state.type !== "kids") return next();

        const text = ctx.message.text.trim();

        // ------------------------------------------
        // 🔙 Повернення
        // ------------------------------------------
        if (text === "↩️ Повернутися назад") {
            userState[userId] = {};
            return ctx.reply("Повертаюсь у меню.", mainMenu);
        }

        if (text === "⬅️ Повернутися до вибору міст") {
            state.mode = "choose_city";
            return ctx.reply(
                "Оберіть місто 👇",
                Markup.keyboard([
                    ...state.cities.map(c => [c.name]),
                    ["↩️ Повернутися назад"]
                ]).resize()
            );
        }

        if (text === "⬅️ Повернутися до заходів") {
            state.mode = "choose_event";
            return ctx.reply(
                `Заходи у місті *${state.selectedCity.name}*:`,
                {
                    parse_mode: "Markdown",
                    reply_markup: Markup.keyboard([
                        ...state.cityEvents.map(ev => [ev.fields["Назва"]]),
                        ["⬅️ Повернутися до вибору міст"],
                        ["↩️ Повернутися назад"]
                    ]).resize().reply_markup
                }
            );
        }

        // ------------------------------------------
        // 🏙 Вибір міста
        // ------------------------------------------
        if (state.mode === "choose_city") {
            const city = state.cities.find(c => c.name === text);
            if (!city) return;

            const now = new Date();

            const events = state.kidsEvents.filter(ev => {
                const cityId = Array.isArray(ev.fields["Місто"])
                    ? ev.fields["Місто"][0]
                    : ev.fields["Місто"];

                const date = ev.fields["Дата та Час початку"];

                return cityId === city.id && new Date(date) >= now;
            });

            state.selectedCity = city;
            state.cityEvents = events;
            state.mode = "choose_event";

            return ctx.reply(
                `Заходи у місті *${city.name}*:`,
                {
                    parse_mode: "Markdown",
                    reply_markup: Markup.keyboard([
                        ...events.map(ev => [ev.fields["Назва"]]),
                        ["⬅️ Повернутися до вибору міст"],
                        ["↩️ Повернутися назад"]
                    ]).resize().reply_markup
                }
            );
        }

        // ------------------------------------------
        // 🎭 Вибір заходу
        // ------------------------------------------
        if (state.mode === "choose_event") {
            const event = state.cityEvents.find(
                ev =>
                    ev.fields["Назва"]?.trim().toLowerCase() ===
                    text.toLowerCase()
            );

            if (!event) return;

            const f = event.fields;

            const city = await resolveLinked(f["Місто"], "Об'єкти України");
            const partners = await resolveLinked(
                f["Партнери заходу"],
                "Партнери"
            );

            const address = f["Адреса"] || "Не вказано";

            const rawDate = f["Дата та Час початку"];
            const formattedDate = formatUADate(rawDate);

            const desc = f["Короткий опис"] || "";
            const image = Array.isArray(f["Зображення"])
                ? f["Зображення"][0]?.url
                : null;

            // 🔥 Зберігаємо ID заходу для заявки
            state.selectedEventId = event.id;

            let msg =
                `🎠 *${f["Назва"]}*\n\n` +
                `📍 *Місто:* ${city}\n` +
                `📌 *Адреса:* ${address}\n` +
                `🤝 *Партнери:* ${partners}\n` +
                `🕒 *Дата та час:* ${formattedDate}\n`;

            if (desc) msg += `\n📝 ${desc}`;

            if (image) {
                await ctx.replyWithPhoto(
                    { url: image },
                    { caption: msg, parse_mode: "Markdown" }
                );
            } else {
                await ctx.reply(msg, { parse_mode: "Markdown" });
            }

            return ctx.reply(
                "Оберіть дію. Якщо бажаєте записатись на подію будь ласка натисніть кнопку «📱 Надіслати контакт»:",
                Markup.keyboard([
                    [{ text: "📱 Надіслати контакт", request_contact: true }],
                    ["⬅️ Повернутися до заходів"],
                    ["⬅️ Повернутися до вибору міст"],
                    ["↩️ Повернутися назад"]
                ]).resize()
            );
        }
    });
}