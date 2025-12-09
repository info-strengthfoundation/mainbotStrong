import { Telegraf, Markup } from 'telegraf'
import psychHandler from './handlers/psych.js'
import legalHandler from './handlers/legal.js'
import storiesHandler from './handlers/stories.js'
import booksHandler from './handlers/books.js'
import iventsHandler from './handlers/ivents.js'
import kidsHandler from './handlers/kids.js'
import lecturesHandler from './handlers/lectures.js'
import supportHandler from './handlers/support.js'
import 'dotenv/config'
import http from "http";


const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.RENDER_EXTERNAL_URL + "/webhook";


const bot = new Telegraf(process.env.TELEGRAM_API)

// стан користувача
const userState = {}

const mainMenu = Markup.keyboard([
    ["✅ Психологічна підтримка", "⚖ Юридична підтримка"],
    ["📚 Проєкт 'Історії Сильних'", "🌟 Об'єднані Силою - Забезпечення книжками"],
    ["🎥 Об'єднані Силою - Забезпечення квитками на події", "🎓 Об'єднані Силою - Онлайн/офлайн лекції"],
    ["🎮 Об'єднані Силою - Заходи для дітей", "❤️ Підтримати фонд"]
]).resize()

bot.start((ctx) => ctx.reply(`
👋 Ласкаво просимо до бота «Сила для Сильних»!
Я зможу допомогти вам:
🧠 Психологічна підтримка  
⚖️ Юридична підтримка  
📚 Книжки  
🎫 Квитки  
🎓 Лекції  
❤️ Підтримати фонд
`, mainMenu))

// Підключення розділів
psychHandler(bot, mainMenu, userState)
legalHandler(bot, mainMenu, userState)
storiesHandler(bot, mainMenu, userState)
booksHandler(bot, mainMenu, userState)
iventsHandler(bot, mainMenu, userState)
kidsHandler(bot, mainMenu, userState)
lecturesHandler(bot, mainMenu, userState)
supportHandler(bot, mainMenu, userState)

// ОБРОБКА КОНТАКТУ
bot.on("contact", async ctx => {
    const userId = ctx.from.id
    const state = userState[userId] || {}

    if (!state.type) {
        return ctx.reply("Будь ласка, спочатку оберіть тип підтримки.", mainMenu)
    }

    // Вибір таблиці Airtable
    let baseId = ""
    let tableId = ""

    if (state.type === "psych") {
        baseId = process.env.AIRTABLE_PSYCH_BASE
        tableId = process.env.AIRTABLE_PSYCH_TABLE
    } else if (state.type === "legal") {
        baseId = process.env.AIRTABLE_LEGAL_BASE
        tableId = process.env.AIRTABLE_LEGAL_TABLE
    } else if (state.type === "story") {
        baseId = process.env.AIRTABLE_STORIES_BASE
        tableId = process.env.AIRTABLE_STORIES_TABLE
    } else if (state.type === "books") {
        baseId = process.env.AIRTABLE_BOOKS_REQUEST_BASE
        tableId = process.env.AIRTABLE_BOOKS_REQUEST_TABLE
    } else if (state.type === "ivents") {
        baseId = process.env.AIRTABLE_IVENTS_REQUEST_BASE
        tableId = process.env.AIRTABLE_IVENTS_REQUEST_TABLE
    } 
    
    //Kids заявки
    else if (state.type === "kids") {
        baseId = process.env.AIRTABLE_KIDS_REQUEST_BASE
        tableId = process.env.AIRTABLE_KIDS_REQUEST_TABLE
    }

    const airtableURL = `https://api.airtable.com/v0/${baseId}/${tableId}`

    // Дані юзера
    const first = ctx.message.contact.first_name || ""
    const last = ctx.message.contact.last_name || ""
    const fullName = `${first} ${last}`.trim()
    const phone = ctx.message.contact.phone_number

    let payload = { fields: {} }

    // психолог / юрист
    if (state.type === "psych" || state.type === "legal") {
        payload.fields = {
            "Ім’я та Прізвище": fullName,
            "Телефон вказаний": phone,
            "Telegram": ctx.from.username || "",
            "Тип сесії": state.type === "psych" ? "Психологічна" : "Юридична",
            "Ресурс": "Telegram Bot",
            "Коментар": state.text || "",
            "Документи": Array.isArray(state.files) ? state.files.map(url => ({ url })) : []
        }
    }

    // історії
    if (state.type === "story") {
        payload.fields = {
            "Ім’я та Прізвище": fullName,
            "Телефон вказаний": phone,
            "Telegram": ctx.from.username || "",
            "Ресурс": "Telegram Bot",
            "Історія": state.text || "",
            "Документи": Array.isArray(state.files) ? state.files.map(url => ({ url })) : []
        }
    }

    // книжки
    if (state.type === "books") {
        payload.fields = {
            "Ім'я": fullName,
            "Телефон вказаний": phone,
            "Telegram": ctx.from.username || "",
            "Позиція запиту": [state.bookRecordId],
            "Ресурс": "Telegram Bot"
        }
    }

    // квитки
    if (state.type === "ivents") {
        payload.fields = {
            "Ім'я": fullName,
            "Телефон вказаний": phone,
            "Telegram": ctx.from.username || "",
            "Позиція запиту": [state.selectedEventId],
            "Ресурс": "Telegram Bot"
        }
    }

    // kids
    if (state.type === "kids") {
        payload.fields = {
            "Ім’я та Прізвище": fullName,
            "Телефон вказаний": phone,   // ✅ ВИПРАВЛЕНО
            "Telegram": ctx.from.username || "",
            "Захід": [state.selectedEventId],   // Linked Record
            "Ресурс": "Telegram Bot"
        }
    }

    // Надсилання в Airtable
    const headers = {
        "Authorization": `Bearer ${process.env.AIRTABLE_TOKEN}`,
        "Content-Type": "application/json"
    }

    try {
        const response = await fetch(airtableURL, {
            method: "POST",
            headers,
            body: JSON.stringify(payload)
        })

        const data = await response.json()
        console.log("Airtable response:", data)
    } catch (err) {
        console.error("Airtable error:", err)
    }

    ctx.reply(
        `Дякуємо! Ваш номер отримано: ${phone}\nОчікуйте на звʼязок 💛`,
        mainMenu
    )

    delete userState[userId]
})

// Збір тексту
bot.on("text", ctx => {
    const id = ctx.from.id
    const state = userState[id]

    if (!state) return
    if (state.mode !== "description") return

    state.text += ctx.message.text + "\n"
    ctx.reply(
        "Повідомлення отримано ✔️\n\n" +
        "📎 Якщо потрібно — додайте документ(-и).\n" +
        "📩 *Коли будете готові, натисніть Enter щоб перейти до етапу відправки заявки на допомогу.*")
})

// Збір документів
bot.on("document", async ctx => {
    const id = ctx.from.id
    const state = userState[id]
    if (!state || state.mode !== "description") return

    const file = ctx.message.document
    if (file.file_size > 50 * 1024 * 1024) {
        return ctx.reply("⚠️ Файл занадто великий. Максимум — 50 МБ.")
    }

    const link = await ctx.telegram.getFileLink(file.file_id)
    state.files.push(link.href)
    ctx.reply("Документ отримано ✔️\n\n" +
    "📱 Будь ласка, натисніть кнопку *«Надіслати контакт»*, щоб завершити створення заявки.")
})

// Фото
bot.on("photo", async ctx => {
    const id = ctx.from.id
    const state = userState[id]
    if (!state || state.mode !== "description") return

    const photo = ctx.message.photo.pop()
    if (photo.file_size > 50 * 1024 * 1024) {
        return ctx.reply("⚠️ Фото занадто велике. Максимум — 50 МБ.")
    }

    const link = await ctx.telegram.getFileLink(photo.file_id)
    state.files.push(link.href)
    ctx.reply("Фото отримано ✔️\n\n" +
    "📱 Будь ласка, натисніть кнопку *«Надіслати контакт»*, щоб завершити створення заявки.")
})

//bot.launch({ dropPendingUpdates: true })

async function start() {
    await bot.telegram.setWebhook(WEBHOOK_URL);
    console.log("Webhook set to:", WEBHOOK_URL);
  
    http
      .createServer((req, res) => {
        if (req.url === "/webhook" && req.method === "POST") {
          bot.webhookCallback("/webhook")(req, res);
        } else {
          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end("Bot is running");
        }
      })
      .listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
      });
  }
  
  start();