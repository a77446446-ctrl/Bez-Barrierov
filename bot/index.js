'use strict';
require('dotenv').config();

const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

// ─── Конфигурация ─────────────────────────────────────────────────────────────
const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ID или Username администраторов (кому форвардятся сообщения на одобрение)
// Можно добавить несколько через запятую: "@admin1,@admin2" или "123456789,987654321"
const ADMIN_IDS = (process.env.ADMIN_CHAT_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

if (!BOT_TOKEN) throw new Error('BOT_TOKEN не zadан в .env');
if (!SUPABASE_URL || !SUPABASE_KEY) console.warn('⚠️  Supabase не настроен — одобрение не будет сохраняться в БД');

const bot = new Telegraf(BOT_TOKEN);
const supabase = SUPABASE_URL && SUPABASE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;

// ─── Хранилище ожидающих одобрения сообщений ──────────────────────────────────
// { messageId: { senderId, receiverId, orderId, senderName, receiverName, text, tgChatId } }
const pendingMessages = new Map();

// ─── Связываем telegram_chat_id с профилями ───────────────────────────────────
// При /start боту пишет пользователь сайта. Мы сохраняем его TG-chat-id в profiles.
// Ссылка на бота имеет вид: t.me/BotName?start=link_USER_UUID
// или для чата по заказу: t.me/BotName?start=chat_ORDER_UUID_to_RECEIVER_UUID

bot.start(async (ctx) => {
    const param = ctx.startPayload; // текст после /start
    const telegramChatId = String(ctx.chat.id);
    const telegramName = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;

    // --- Сценарий 1: Привязка аккаунта ---
    // /start link_USER_UUID
    if (param && param.startsWith('link_')) {
        const userId = param.replace('link_', '');
        if (supabase) {
            // Определяем колонку id в profiles (uuid или text)
            let col = 'id';
            const { data: testRow } = await supabase.from('profiles').select('id,user_id').limit(1);
            if (testRow && testRow[0] && 'user_id' in testRow[0]) col = 'user_id';

            const { error } = await supabase
                .from('profiles')
                .update({ telegram_chat_id: telegramChatId })
                .eq(col, userId);

            if (!error) {
                await ctx.reply(`✅ *Telegram подключён к вашему аккаунту БезБарьеров!*\nТеперь вы будете получать сообщения и уведомления через этот чат.`, { parse_mode: 'Markdown' });
                return;
            }
        }
        await ctx.reply('⚠️ Не удалось привязать аккаунт — попробуйте позже.');
        return;
    }

    // --- Сценарий 2: Начало чата по заказу ---
    // /start chat_ORDER_UUID_to_RECEIVER_UUID
    if (param && param.startsWith('chat_')) {
        const parts = param.replace('chat_', '').split('_to_');
        const orderId = parts[0];
        const receiverId = parts[1];

        // Сохраняем в память, что этот TG-пользователь хочет написать в рамках заказа
        pendingMessages.set(`session_${telegramChatId}`, { orderId, receiverId, telegramChatId });

        await ctx.reply(
            `💬 *Отправка сообщения*\n\nНапишите ваше сообщение для передачи заказчику/помощнику. Оно будет проверено администратором перед отправкой.`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    // --- Приветствие по умолчанию ---
    await ctx.reply(
        `👋 *Добро пожаловать в бот БезБарьеров!*\n\nЯ помогаю организовать безопасное общение между заказчиками и помощниками.\n\nДля начала работы перейдите в приложение и нажмите кнопку «Написать».`,
        { parse_mode: 'Markdown' }
    );
});

// ─── Приём текстовых сообщений от пользователей ──────────────────────────────
bot.on('text', async (ctx) => {
    const telegramChatId = String(ctx.chat.id);
    const text = ctx.message.text;

    // Игнорируем команды
    if (text.startsWith('/')) return;

    // Проверяем, есть ли активная сессия чата
    const session = pendingMessages.get(`session_${telegramChatId}`);
    if (!session) {
        await ctx.reply('ℹ️ Перейдите в приложение и нажмите кнопку «Написать», чтобы отправить сообщение.');
        return;
    }

    const { orderId, receiverId } = session;

    // Находим профиль отправителя по telegram_chat_id
    let senderProfile = null;
    if (supabase) {
        const { data } = await supabase.from('profiles').select('*').eq('telegram_chat_id', telegramChatId).maybeSingle();
        senderProfile = data;
    }

    const senderName = senderProfile?.name || ctx.from.first_name || 'Неизвестный';

    // Находим профиль получателя
    let receiverProfile = null;
    if (supabase) {
        let col = 'id';
        const { data: testRow } = await supabase.from('profiles').select('id,user_id').limit(1);
        if (testRow && testRow[0] && 'user_id' in testRow[0]) col = 'user_id';
        const { data } = await supabase.from('profiles').select('*').eq(col, receiverId).maybeSingle();
        receiverProfile = data;
    }
    const receiverName = receiverProfile?.name || 'Получатель';

    // Генерируем уникальный ID для этого ожидающего сообщения
    const msgKey = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Сохраняем в память
    pendingMessages.set(msgKey, {
        senderId: senderProfile?.id || senderProfile?.user_id || telegramChatId,
        receiverId,
        orderId,
        senderName,
        receiverName,
        text,
        senderTgChatId: telegramChatId,
        receiverTgChatId: receiverProfile?.telegram_chat_id || null
    });

    // Уведомляем отправителя
    await ctx.reply('⌛ Ваше сообщение отправлено на проверку администратором. После одобрения оно будет доставлено.');

    // Форвардим администраторам
    const adminText = `📩 *Новое сообщение на модерацию*

👤 *От:* ${senderName}
👥 *Кому:* ${receiverName}
🗂 *Заказ ID:* \`${orderId}\`

💬 *Текст:*
${text}`;

    const keyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback('✅ Одобрить и отправить', `approve_${msgKey}`),
            Markup.button.callback('🚫 Отклонить', `reject_${msgKey}`)
        ],
        [
            Markup.button.callback('✏️ Изменить текст', `edit_${msgKey}`)
        ]
    ]);

    for (const adminId of ADMIN_IDS) {
        try {
            await bot.telegram.sendMessage(adminId, adminText, {
                parse_mode: 'Markdown',
                ...keyboard
            });
        } catch (e) {
            console.error(`Не удалось отправить сообщение Админу ${adminId}:`, e.message);
        }
    }

    // Очищаем сессию (следующее сообщение потребует нового click "Написать")
    pendingMessages.delete(`session_${telegramChatId}`);
});

// ─── Обработчики кнопок Администратора ────────────────────────────────────────

// Одобрить
bot.action(/^approve_(.+)$/, async (ctx) => {
    const msgKey = ctx.match[1];
    const msg = pendingMessages.get(msgKey);

    if (!msg) {
        await ctx.answerCbQuery('❌ Сообщение не найдено или уже обработано');
        return;
    }

    // 1. Сохраняем в БД как одобренное
    if (supabase) {
        await supabase.from('order_messages').insert({
            order_id: msg.orderId,
            sender_id: msg.senderId,
            receiver_id: msg.receiverId,
            text: msg.text,
            is_approved: true
        });
    }

    // 2. Пересылаем получателю в Telegram (если привязан)
    if (msg.receiverTgChatId) {
        try {
            await bot.telegram.sendMessage(
                msg.receiverTgChatId,
                `📨 *Новое сообщение от ${msg.senderName}:*\n\n${msg.text}\n\n_Ответьте через приложение или откройте бота._`,
                { parse_mode: 'Markdown' }
            );
        } catch (e) {
            console.warn(`Не удалось доставить получателю: ${e.message}`);
        }
    }

    // 3. Уведомляем отправителя
    if (msg.senderTgChatId) {
        try {
            await bot.telegram.sendMessage(msg.senderTgChatId, '✅ Ваше сообщение одобрено и доставлено получателю.');
        } catch (e) { /* ignore */ }
    }

    // 4. Обновляем сообщение в чате Админа
    await ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n✅ *ОДОБРЕНО И ОТПРАВЛЕНО*`, { parse_mode: 'Markdown' });
    await ctx.answerCbQuery('✅ Сообщение отправлено!');
    pendingMessages.delete(msgKey);
});

// Отклонить
bot.action(/^reject_(.+)$/, async (ctx) => {
    const msgKey = ctx.match[1];
    const msg = pendingMessages.get(msgKey);

    if (!msg) {
        await ctx.answerCbQuery('❌ Уже обработано');
        return;
    }

    // Уведомляем отправителя
    if (msg.senderTgChatId) {
        try {
            await bot.telegram.sendMessage(msg.senderTgChatId, '🚫 К сожалению, ваше сообщение было отклонено администратором.');
        } catch (e) { /* ignore */ }
    }

    await ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n🚫 *ОТКЛОНЕНО*`, { parse_mode: 'Markdown' });
    await ctx.answerCbQuery('Сообщение отклонено');
    pendingMessages.delete(msgKey);
});

// Изменить текст — переводим Администратора в режим редактирования
const editSessions = new Map(); // { adminChatId: msgKey }

bot.action(/^edit_(.+)$/, async (ctx) => {
    const msgKey = ctx.match[1];
    const msg = pendingMessages.get(msgKey);

    if (!msg) {
        await ctx.answerCbQuery('❌ Уже обработано');
        return;
    }

    editSessions.set(String(ctx.chat.id), msgKey);
    await ctx.answerCbQuery('Введите новый текст');
    await ctx.reply(`✏️ Введите исправленный текст сообщения. Он будет отправлен от имени ${msg.senderName}:`);
    await ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n✏️ *Администратор вносит правки...*`, { parse_mode: 'Markdown' });
});

// Обрабатываем исправленный текст от Администратора
bot.on('text', async (ctx) => {
    const adminChatId = String(ctx.chat.id);
    const msgKey = editSessions.get(adminChatId);
    if (!msgKey) return; // уже обработан выше в другом хэндлере

    const newText = ctx.message.text;
    if (newText.startsWith('/')) { editSessions.delete(adminChatId); return; }

    const msg = pendingMessages.get(msgKey);
    if (!msg) { editSessions.delete(adminChatId); return; }

    // Сохраняем с исправленным текстом
    const finalMsg = { ...msg, text: newText };

    if (supabase) {
        await supabase.from('order_messages').insert({
            order_id: finalMsg.orderId,
            sender_id: finalMsg.senderId,
            receiver_id: finalMsg.receiverId,
            text: finalMsg.text,
            is_approved: true
        });
    }

    if (finalMsg.receiverTgChatId) {
        try {
            await bot.telegram.sendMessage(
                finalMsg.receiverTgChatId,
                `📨 *Сообщение от ${finalMsg.senderName}:*\n\n${finalMsg.text}`,
                { parse_mode: 'Markdown' }
            );
        } catch (e) { /* ignore */ }
    }

    if (finalMsg.senderTgChatId) {
        try {
            await bot.telegram.sendMessage(finalMsg.senderTgChatId, '✅ Ваше сообщение проверено и доставлено.');
        } catch (e) { /* ignore */ }
    }

    await ctx.reply(`✅ Исправленное сообщение отправлено получателю (${finalMsg.receiverName}).`);
    editSessions.delete(adminChatId);
    pendingMessages.delete(msgKey);
});

// ─── Запуск ────────────────────────────────────────────────────────────────────
bot.launch().then(() => {
    console.log('🤖 БезБарьеров бот запущен!');
    console.log(`📬 Сообщения на проверку будут приходить Админу: ${ADMIN_IDS.join(', ')}`);
}).catch(e => {
    console.error('❌ Ошибка запуска бота:', e.message);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
