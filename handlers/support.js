import { Markup } from "telegraf";

export default function supportHandler(bot, mainMenu, userState) {

    // Головне меню підтримки
    bot.hears("❤️ Підтримати фонд", async ctx => {
        await ctx.reply(
            "❤️ Оберіть спосіб підтримки фонду:",
            Markup.keyboard([
                ["✅ Підтримати фінансово", "🇺🇦 Замовити прапор"],
                ["↩️ Повернутися назад"]
            ]).resize()
        );
    });

    // Фінансова підтримка
    bot.hears("✅ Підтримати фінансово", async ctx => {
        await ctx.reply(
            "💰 *Фінансова підтримка*\n\nОбирайте зручний для вас спосіб:",
            {
                parse_mode: "Markdown",
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "💳 Monobank", url: "https://send.monobank.ua/jar/4y5tgMMtvD" }],
                        [{ text: "🏦 Приват24", url: "https://next.privat24.ua/payments/form/%7B%22token%22%3A%22b549284e-8aff-46ad-81a4-b8b01a0212f1%22%7D" }],
                        [{ text: "🌍 PayPal", url: "https://www.paypal.com/donate?business=chakubash.anastasiya@strength.foundation" }]
                    ]
                }
            }
        );
    });

    // Замовити прапор
    bot.hears("🇺🇦 Замовити прапор", async ctx => {
        await ctx.reply(
            "🇺🇦 *Замовити прапор*\n\nПерейдіть за посиланням, щоб замовити прапор:",
            {
                parse_mode: "Markdown",
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "🎁 Замовити через Instagram", url: "https://www.instagram.com/p/DIJSZAHtO-l/" }]
                    ]
                }
            }
        );
    });
}