'use strict';
require('dotenv').config();

const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

// ─── Конфигурация ─────────────────────────────────────────────────────────────
const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_IDS = (process.env.ADMIN_CHAT_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN не задан в .env');
    process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_KEY || SUPABASE_URL.includes('your-project')) {
    console.warn('⚠️  Supabase не настроен — сообщения не будут сохраняться в БД');
}

const bot = new Telegraf(BOT_TOKEN);
const supabase = (SUPABASE_URL && SUPABASE_KEY && !SUPABASE_URL.includes('your-project'))
    ? createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;

// ─── Хранилища сессий ─────────────────────────────────────────────────────────
// Сессии чата: ключ = "session_<telegramChatId>", значение = { orderId, receiverId }
const chatSessions = new Map();
// Сессии редактирования (только для Админа): ключ = adminChatId, значение = msgKey
const editSessions = new Map();
// Ожидающие одобрения сообщения
const pendingMessages = new Map();

// ─── /start ──────────────────────────────────────────────────────────────────
bot.start(async (ctx) => {
    const param = ctx.startPayload || '';
    const telegramChatId = String(ctx.chat.id);

    // Сценарий 1: Привязка аккаунта → /start link_USER_UUID
    if (param.startsWith('link_')) {
        const userId = param.replace('link_', '');
        if (supabase) {
            const { error } = await supabase
                .from('profiles')
                .update({ telegram_chat_id: telegramChatId })
                .eq('id', userId);
            if (!error) {
                return ctx.reply('✅ Telegram подключён к вашему аккаунту БезБарьеров!\nТеперь вы будете получать сообщения через этот чат.');
            }
        }
        return ctx.reply('⚠️ Не удалось привязать аккаунт — попробуйте позже.');
    }

    // Сценарий 2: Начало чата по заказу → /start chat_ORDER_to_RECEIVER
    if (param.startsWith('chat_')) {
        const withoutPrefix = param.replace('chat_', '');
        const toIndex = withoutPrefix.indexOf('_to_');
        if (toIndex === -1) return ctx.reply('⚠️ Неверный формат ссылки.');

        const orderId = withoutPrefix.substring(0, toIndex);
        const receiverId = withoutPrefix.substring(toIndex + 4);

        chatSessions.set(`session_${telegramChatId}`, { orderId, receiverId, telegramChatId });
        return ctx.reply('💬 Напишите ваше сообщение.\nОно будет проверено администратором перед отправкой.');
    }

    // Приветствие по умолчанию
    return ctx.reply(
        '👋 Добро пожаловать в бот БезБарьеров!\n\n' +
        'Я помогаю организовать безопасное общение между заказчиками и помощниками.\n\n' +
        'Для начала работы перейдите в приложение и нажмите кнопку «Написать».'
    );
});

// ─── Единый обработчик text ───────────────────────────────────────────────────
bot.on('text', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const text = ctx.message.text;

    // Игнорируем команды
    if (text.startsWith('/')) return;

    // 1. Если это Админ в режиме редактирования
    const editMsgKey = editSessions.get(chatId);
    if (editMsgKey) {
        const msg = pendingMessages.get(editMsgKey);
        if (!msg) { editSessions.delete(chatId); return; }

        const finalMsg = { ...msg, text };
        if (supabase) {
            await supabase.from('order_messages').insert({
                order_id: finalMsg.orderId,
                sender_id: finalMsg.senderId,
                receiver_id: finalMsg.receiverId,
                text: finalMsg.text,
                is_approved: true
            }).catch(() => { });
        }
        if (finalMsg.receiverTgChatId) {
            await bot.telegram.sendMessage(
                finalMsg.receiverTgChatId,
                `📨 Сообщение от ${finalMsg.senderName}:\n\n${finalMsg.text}`
            ).catch(() => { });
        }
        if (finalMsg.senderTgChatId) {
            await bot.telegram.sendMessage(finalMsg.senderTgChatId, '✅ Ваше сообщение проверено и доставлено.').catch(() => { });
        }
        await ctx.reply(`✅ Исправленное сообщение отправлено (${finalMsg.receiverName}).`);
        editSessions.delete(chatId);
        pendingMessages.delete(editMsgKey);
        return;
    }

    // 2. Обычный пользователь — проверяем активную сессию чата
    const session = chatSessions.get(`session_${chatId}`);
    if (!session) {
        return ctx.reply('ℹ️ Перейдите в приложение и нажмите кнопку «Написать», чтобы отправить сообщение.');
    }

    const { orderId, receiverId } = session;

    // Ищем профили отправителя и получателя
    let senderProfile = null;
    let receiverProfile = null;
    if (supabase) {
        const [sp, rp] = await Promise.all([
            supabase.from('profiles').select('*').eq('telegram_chat_id', chatId).maybeSingle(),
            supabase.from('profiles').select('*').eq('id', receiverId).maybeSingle()
        ]);
        senderProfile = sp.data;
        receiverProfile = rp.data;
    }

    const senderName = senderProfile?.name || ctx.from.first_name || 'Пользователь';
    const receiverName = receiverProfile?.name || 'Получатель';

    const msgKey = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    pendingMessages.set(msgKey, {
        senderId: senderProfile?.id || chatId,
        receiverId,
        orderId,
        senderName,
        receiverName,
        text,
        senderTgChatId: chatId,
        receiverTgChatId: receiverProfile?.telegram_chat_id || null
    });

    await ctx.reply('⌛ Сообщение отправлено на проверку. После одобрения оно будет доставлено.');

    // Отправляем Админам на проверку
    const adminText =
        `📩 Новое сообщение на модерацию\n\n` +
        `👤 От: ${senderName}\n` +
        `👥 Кому: ${receiverName}\n` +
        `🗂 Заказ: ${orderId}\n\n` +
        `💬 Текст:\n${text}`;

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('✅ Одобрить', `approve_${msgKey}`), Markup.button.callback('🚫 Отклонить', `reject_${msgKey}`)],
        [Markup.button.callback('✏️ Изменить текст', `edit_${msgKey}`)]
    ]);

    for (const adminId of ADMIN_IDS) {
        await bot.telegram.sendMessage(adminId, adminText, keyboard).catch(e => {
            console.error(`Не удалось доставить Админу ${adminId}: ${e.message}`);
        });
    }

    chatSessions.delete(`session_${chatId}`);
});

// ─── Кнопка: Одобрить ─────────────────────────────────────────────────────────
bot.action(/^approve_(.+)$/, async (ctx) => {
    const msgKey = ctx.match[1];
    const msg = pendingMessages.get(msgKey);
    if (!msg) return ctx.answerCbQuery('❌ Уже обработано');

    if (supabase) {
        await supabase.from('order_messages').insert({
            order_id: msg.orderId, sender_id: msg.senderId,
            receiver_id: msg.receiverId, text: msg.text, is_approved: true
        }).catch(() => { });
    }
    if (msg.receiverTgChatId) {
        await bot.telegram.sendMessage(msg.receiverTgChatId, `📨 Сообщение от ${msg.senderName}:\n\n${msg.text}`).catch(() => { });
    }
    if (msg.senderTgChatId) {
        await bot.telegram.sendMessage(msg.senderTgChatId, '✅ Ваше сообщение одобрено и доставлено.').catch(() => { });
    }
    await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\n✅ ОДОБРЕНО').catch(() => { });
    await ctx.answerCbQuery('✅ Отправлено!');
    pendingMessages.delete(msgKey);
});

// ─── Кнопка: Отклонить ───────────────────────────────────────────────────────
bot.action(/^reject_(.+)$/, async (ctx) => {
    const msgKey = ctx.match[1];
    const msg = pendingMessages.get(msgKey);
    if (!msg) return ctx.answerCbQuery('❌ Уже обработано');

    if (msg.senderTgChatId) {
        await bot.telegram.sendMessage(msg.senderTgChatId, '🚫 Ваше сообщение отклонено администратором.').catch(() => { });
    }
    await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\n🚫 ОТКЛОНЕНО').catch(() => { });
    await ctx.answerCbQuery('Отклонено');
    pendingMessages.delete(msgKey);
});

// ─── Кнопка: Изменить текст ──────────────────────────────────────────────────
bot.action(/^edit_(.+)$/, async (ctx) => {
    const msgKey = ctx.match[1];
    const msg = pendingMessages.get(msgKey);
    if (!msg) return ctx.answerCbQuery('❌ Уже обработано');

    editSessions.set(String(ctx.chat.id), msgKey);
    await ctx.answerCbQuery('Введите новый текст');
    await ctx.reply(`✏️ Введите исправленный текст (будет отправлен от ${msg.senderName}):`);
    await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\n✏️ Редактируется...').catch(() => { });
});

// ─── Запуск ──────────────────────────────────────────────────────────────────
bot.launch()
    .then(() => {
        console.log('🤖 БезБарьеров бот запущен! (@NoBarriers_BOT)');
        if (ADMIN_IDS.length) {
            console.log(`📬 Сообщения на проверку → ${ADMIN_IDS.join(', ')}`);
        } else {
            console.warn('⚠️  ADMIN_CHAT_IDS не задан — некому будет пересылать сообщения!');
        }
    })
    .catch(e => {
        console.error('❌ Ошибка запуска бота:', e.message);
        process.exit(1);
    });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
