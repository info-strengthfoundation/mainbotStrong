import { Markup } from 'telegraf'
import fetch from "node-fetch"
import 'dotenv/config'

export default function (bot, mainMenu, userState) {

    const BASE = process.env.AIRTABLE_BOOKS_BASE
    const TABLE = process.env.AIRTABLE_BOOKS_TABLE
    const VIEW = process.env.AIRTABLE_BOOKS_VIEW

    const headersBooks = {
        "Authorization": `Bearer ${process.env.AIRTABLE_TOKEN}`,
        "Content-Type": "application/json"
    }

    async function loadAllRecords() {
        let url = `https://api.airtable.com/v0/${BASE}/${TABLE}?view=${VIEW}`
        let all = []

        while (url) {
            const res = await fetch(url, { headers: headersBooks })
            const json = await res.json()

            if (json.records) all.push(...json.records)

            url = json.offset
                ? `https://api.airtable.com/v0/${BASE}/${TABLE}?view=${VIEW}&offset=${json.offset}`
                : null
        }

        return all
    }

    const allowedSubtypes = [
        "Дитяча художня література",
        "Доросла художня література",
        "Доросла наукова література",
        "Дитяча наукова література"
    ]

    // ---------- показати категорії ----------
    async function showCategories(ctx) {
        try {
            const records = await loadAllRecords()

            const subtypes = records
                .map(r => r.fields["Підтип"])
                .filter(Boolean)
                .flatMap(v => Array.isArray(v) ? v : [v])
                .map(v => v.trim())
                .filter(v => allowedSubtypes.includes(v))
                .filter((v, i, arr) => arr.indexOf(v) === i)

            const keyboard = Markup.keyboard([
                ...subtypes.map(s => [s]),
                ["↩️ Повернутися назад"]
            ]).resize()

            await ctx.reply("Оберіть категорію:", keyboard)

        } catch (err) {
            console.error(err)
            ctx.reply("❌ Не вдалося отримати категорії.")
        }
    }

    // ---------- показати книги ----------
    async function showBooksForSubtype(ctx, subtype) {
        const userId = ctx.from.id

        userState[userId] = {
            ...userState[userId],
            type: "books",           // позначаємо, що користувач зараз у блоці книжок
            currentSubtype: subtype,
            currentBook: null,
            bookRecordId: null,
            bookStock: null
        }

        await ctx.reply(`Шукаю книжки у категорії: *${subtype}*⏳`, { parse_mode: "Markdown" })

        try {
            const records = await loadAllRecords()

            const books = records.filter(rec => {
                const arr = Array.isArray(rec.fields["Підтип"])
                    ? rec.fields["Підтип"].map(s => s.trim())
                    : [rec.fields["Підтип"]?.trim()]

                return arr.includes(subtype) && (Number(rec.fields["Залишок"]) || 0) > 0
            })

            const keyboard = Markup.keyboard([
                // ⚠️ ВАЖЛИВО: показуємо назви з префіксом "📘 "
                ...books.map(b => [`📘 ${b.fields["Назва"]}`]),
                ["⬅️ Повернутися до категорій"]
            ]).resize()

            await ctx.reply(
                `📚 Доступні книжки у категорії *${subtype}*:\n\n` +
                `Натисніть на книгу, щоб переглянути її деталі та в подальшому сформувати заявку на замовлення.\n` +
                `Або натисніть кнопку «↩️ Повернутися до категорій», якщо бажаєте обрати іншу категорію.`,
                { parse_mode: "Markdown", reply_markup: keyboard.reply_markup }
            )

        } catch (err) {
            console.error(err)
            ctx.reply("❌ Не вдалося завантажити книжки.")
        }
    }

    // ---------- Головне меню блоку книжок ----------
    bot.hears("🌟 Об'єднані Силою - Забезпечення книжками", ctx => {
        ctx.reply(
            "Оберіть книжку з наявного списку — ми з радістю передамо її вам або вашим рідним.",
            Markup.keyboard([
                ["📚 Подивитися наявні книжки"],
                ["↩️ Повернутися назад"]
            ]).resize()
        )
    })

    bot.hears("📚 Подивитися наявні книжки", async ctx => {
        await ctx.reply("Завантажую список категорій. Зачекайте будь ласка⏳")
        await showCategories(ctx)
    })

    bot.hears(allowedSubtypes, async ctx => {
        const subtype = ctx.message.text.trim()
        await showBooksForSubtype(ctx, subtype)
    })

    bot.hears("⬅️ Повернутися до категорій", async ctx => {
        await ctx.reply("Повертаю вас до списку категорій…")
        await showCategories(ctx)
    })

    bot.hears("⬅️ Повернутися до списку книг", async ctx => {
        const userId = ctx.from.id
        const subtype = userState[userId]?.currentSubtype
        if (!subtype) return

        await ctx.reply("Повертаю вас до списку книг…")
        await showBooksForSubtype(ctx, subtype)
    })

    // ---------- Надіслати заявку ----------
    bot.hears("📨 Надіслати заявку", async ctx => {
        const userId = ctx.from.id
        const state = userState[userId]

        if (!state?.currentBook) {
            return ctx.reply("Будь ласка, спочатку оберіть книгу.")
        }

        state.type = "books"     // щоб bot.js знав, що це заявка на книгу
        state.mode = "contact"

        await ctx.reply(
            "Надішліть ваш контакт:",
            Markup.keyboard([
                [{ request_contact: true, text: "📱 Надіслати контакт" }],
                ["⬅️ Повернутися до списку книг"],
                ["⬅️ Повернутися до категорій"]
            ]).resize()
        )
    })

    // ---------- Деталі книги (ТІЛЬКИ для кнопок з книжками) ----------
    bot.hears(/^📘 /, async ctx => {
        const userId = ctx.from.id
        const state = userState[userId]

        // Якщо користувач не в блоці книг або не обрав підтип — нічого не робимо
        if (!state || state.type !== "books" || !state.currentSubtype) return

        // Забираємо "📘 " спочатку
        const raw = ctx.message.text.trim()
        const title = raw.replace(/^📘\s*/, "").trim()

        try {
            const records = await loadAllRecords()

            const book = records.find(r =>
                r.fields["Назва"]?.trim().toLowerCase() === title.toLowerCase()
            )

            if (!book) {
                console.log("❌ Книга не знайдена:", title)
                return
            }

            const { Назва, "Короткий опис": desc, Залишок: stock, Зображення: imgs } = book.fields
            const image = Array.isArray(imgs) && imgs.length > 0 ? imgs[0].url : null

            state.currentBook = Назва
            state.bookStock = stock || 0
            state.bookRecordId = book.id

            state.bookRequestText =
                `Арт.№${book.fields["Артикул"]} | Книга: ${Назва}. Залишок: ${stock || 0} од.`

            const shortMsg = `📘 *${Назва}*\n📦 Залишок: *${stock || 0}*`
            const longText = desc || ""
            const tooLong = longText.length > 900

            if (image) {
                await ctx.replyWithPhoto(
                    { url: image },
                    {
                        caption: tooLong ? shortMsg : `${shortMsg}\n\n📝 ${longText}`,
                        parse_mode: "Markdown"
                    }
                )

                if (tooLong) await ctx.reply(`📝 ${longText}`)
            } else {
                await ctx.reply(
                    tooLong ? shortMsg : `${shortMsg}\n\n📝 ${longText}`,
                    { parse_mode: "Markdown" }
                )

                if (tooLong) await ctx.reply(`📝 ${longText}`)
            }

            await ctx.reply(
                "Оберіть дію:",
                Markup.keyboard([
                    ["📨 Надіслати заявку"],
                    ["⬅️ Повернутися до списку книг"],
                    ["⬅️ Повернутися до категорій"]
                ]).resize()
            )

        } catch (err) {
            console.error(err)
            ctx.reply("❌ Помилка при отриманні книги.")
        }
    })
}