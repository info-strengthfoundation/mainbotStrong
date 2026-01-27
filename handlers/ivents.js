import { Markup } from "telegraf";
import fetch from "node-fetch";
import "dotenv/config";

export default function (bot, mainMenu, userState) {

    const BASE = process.env.AIRTABLE_IVENTS_BASE;
    const TABLE = process.env.AIRTABLE_IVENTS_TABLE;
    const VIEW = process.env.AIRTABLE_IVENTS_VIEW;

    const headersIvents = {
        "Authorization": `Bearer ${process.env.AIRTABLE_TOKEN}`,
        "Content-Type": "application/json"
    };

    // -------------------------------------------------
    // 🔎 Завантаження запису з іншої таблиці по ID
    // -------------------------------------------------
    async function loadRecordById(recordId, tableName) {
        if (!recordId || !tableName) return null;

        const url = `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(tableName)}/${recordId}`;

        try {
            const res = await fetch(url, { headers: headersIvents });
            const json = await res.json();
            return json.fields ? json : null;
        } catch (err) {
            console.error("❌ loadRecordById error:", err);
            return null;
        }
    }

    // -------------------------------------------------
    // 🧩 Розкриття linked field → повертає текст назви
    // -------------------------------------------------
    async function resolveLinkedField(field, tableName) {
        if (!field) return "Не вказано";

        if (typeof field === "string") return field;

        const id = Array.isArray(field) ? field[0] : field;

        if (!id) return "Не вказано";
        if (!String(id).startsWith("rec")) return id;

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
    // 📌 Завантаження всіх подій
    // -------------------------------------------------
    async function loadAllEvents() {
        let url = `https://api.airtable.com/v0/${BASE}/${TABLE}?view=${VIEW}`;
        let all = [];

        while (url) {
            const res = await fetch(url, { headers: headersIvents });
            const json = await res.json();
            if (json.records) all.push(...json.records);

            url = json.offset
                ? `https://api.airtable.com/v0/${BASE}/${TABLE}?view=${VIEW}&offset=${json.offset}`
                : null;
        }
        console.log("Завантажено подій:", all.length);
        return all;
    }

    // -------------------------------------------------
    // 🎥 Головне меню
    // -------------------------------------------------
    bot.hears("🎫 Квитки у заклади дозвілля", async ctx => {
        userState[ctx.from.id] = { type: "ivents", mode: null };
    
        await ctx.reply(
            "🎭 Благодійний фонд «Сила Для Сильних» разом з партнерами дарує безоплатні квитки на культурні, освітні й розважальні події.\n" +
            "Обирайте — і ми разом cтворимо щасливі спогади.\n\nОберіть дію 👇",
            Markup.keyboard([
                ["🎫 Дивитися доступні події"],
                ["↩️ Повернутися назад"]
            ]).resize()
        );
    });

    // -------------------------------------------------
    // 🎫 Вивід міст
    // -------------------------------------------------
    bot.hears("🎫 Дивитися доступні події", async ctx => {
        const userId = ctx.from.id;

        await ctx.reply("Завантажую події⏳");

        const events = await loadAllEvents();
        const today = new Date();

        const validEvents = events.filter(e => {
            if (!e.fields["Підтип"]?.includes("Квитки на події")) return false;

            const stock = Number(e.fields["Залишок"]) || 0;
            if (stock <= 0) return false;

            const from = e.fields["Актуально з"] ? new Date(e.fields["Актуально з"]) : null;
            const to   = e.fields["Актуально до"] ? new Date(e.fields["Актуально до"]) : null;

            if (to && today > to) return false;
            if (from && today < from) return false;

            return true;
        });

        if (validEvents.length === 0) {
            return ctx.reply("Наразі немає актуальних подій.");
        }

        const cityIds = [
            ...new Set(
                validEvents
                    .map(ev => {
                        const field = ev.fields["Місто"];
                        return Array.isArray(field) ? field[0] : field;
                    })
                    .filter(Boolean)
            )
        ];

        const cities = [];
        for (const id of cityIds) {
            const rec = await loadRecordById(id, "Об'єкти України");
            if (rec?.fields?.["Назва"]) {
                cities.push({ id, name: rec.fields["Назва"] });
            }
        }

        userState[userId] = {
            type: "ivents",
            mode: "choose_city",
            cities,
            validEvents
        };

        await ctx.reply(
            "Оберіть місто 👇\n\n" +
            "ℹ️ *Зверніть увагу:* якщо у списку немає вашого міста, це означає, що наразі немає актуальних подій або квитків у вашому регіоні.",
            Markup.keyboard([
                ...cities.map(c => [c.name]),
                ["↩️ Повернутися назад"]
            ]).resize()
        );
    });

    // -------------------------------------------------
    // 🎫 Логіка вибору міста → події → деталі
    // -------------------------------------------------
    bot.on("text", async (ctx, next) => {
        const userId = ctx.from.id;
        const state = userState[userId];

        if (!state || state.type !== "ivents") return next();

        const text = ctx.message.text.trim();

        if (text === "↩️ Повернутися назад") {
            userState[userId] = {};
            await ctx.reply("Повертаюсь у меню.", mainMenu);
            return;
        }

        // ----- КРОК 1 — місто -----
        if (state.mode === "choose_city") {
            const city = state.cities.find(c => c.name === text);
            if (!city) return next();

            state.selectedCity = city;
            state.mode = "choose_event";

            state.availableEvents = state.validEvents.filter(ev => {
                const id = Array.isArray(ev.fields["Місто"]) ? ev.fields["Місто"][0] : ev.fields["Місто"];
                return id === city.id;
            });

            await ctx.reply(
                `Події у місті *${city.name}*:`,
                {
                    parse_mode: "Markdown",
                    reply_markup: Markup.keyboard([
                        ...state.availableEvents.map(ev => [ev.fields["Назва"]]),
                        ["↩️ Повернутися назад"]
                    ]).resize().reply_markup
                }
            );

            return;
        }

        // ----- КРОК 2 — подія -----
        if (state.mode === "choose_event") {
            const event = state.availableEvents.find(
                ev => ev.fields["Назва"]?.trim().toLowerCase() === text.toLowerCase()
            );
            if (!event) return next();

            state.selectedEvent = event;
            state.selectedEventId = event.id;

            const f = event.fields;

            const msg =
                `🎭 *${f["Назва"]}*\n\n` +
                `📍 *Локація:* ${await resolveLinkedField(f["Місто"], "Об'єкти України")}\n` +
                `📅 *Доступно з:* ${f["Актуально з"] || "—"}\n` +
                `📅 *Доступно до:* ${f["Актуально до"] || "—"}\n` +
                `📌 *У рамках проєкту:* ${await resolveLinkedField(f["У рамках проєкту"], "Проєкти")}\n` +
                `🎁 *Отримано від:* ${await resolveLinkedField(f["Отримано від"], "Партнери")}\n` +
                (f["Короткий опис"] ? `\n📝 ${f["Короткий опис"]}` : "");

            const image = Array.isArray(f["Зображення"]) ? f["Зображення"][0]?.url : null;

            if (image) {
                await ctx.replyWithPhoto({ url: image }, { caption: msg, parse_mode: "Markdown" });
            } else {
                await ctx.reply(msg, { parse_mode: "Markdown" });
            }

            await ctx.reply(
                "Оберіть дію:",
                Markup.keyboard([
                    ["📨 Подати заявку на квитки"],
                    ["🎫 Дивитися доступні події"],
                    ["↩️ Повернутися назад"]
                ]).resize()
            );

            return next(); // 🔥 важливо!
        }

        return next();
    });

    // -------------------------------------------------
    // 📨 Подати заявку на квитки
    // -------------------------------------------------
    bot.hears("📨 Подати заявку на квитки", async ctx => {
        const userId = ctx.from.id;
        const state = userState[userId];

        if (!state?.selectedEventId) {
            return ctx.reply("Будь ласка, спочатку оберіть подію.");
        }

        state.mode = "contact";

        await ctx.reply(
            "Надішліть ваш контакт:",
            Markup.keyboard([
                [{ request_contact: true, text: "📱 Надіслати контакт" }],
                ["↩️ Повернутися назад"]
            ]).resize()
        );
    });
}