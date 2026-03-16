'use strict';
require('dotenv').config();

try { require('dns').setDefaultResultOrder('ipv4first'); } catch {}

const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

// ─── Конфигурация ─────────────────────────────────────────────────────────────
function cleanEnv(s) {
    return (s || '').trim().replace(/^['"`]+|['"`]+$/g, '').replace(/^\(+|\)+$/g, '');
}
function getJwtRole(token) {
    try {
        const parts = String(token || '').split('.');
        if (parts.length < 2) return null;
        let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const pad = payload.length % 4;
        if (pad) payload += '='.repeat(4 - pad);
        const json = Buffer.from(payload, 'base64').toString('utf8');
        const data = JSON.parse(json);
        return typeof data?.role === 'string' ? data.role : null;
    } catch {
        return null;
    }
}
const BOT_TOKEN = cleanEnv(process.env.BOT_TOKEN);
const SUPABASE_URL = cleanEnv(process.env.SUPABASE_URL);
const SUPABASE_KEY = cleanEnv(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_SECRET ||
    process.env.SUPABASE_SERVICE_KEY
);
const SUPABASE_ROLE = getJwtRole(SUPABASE_KEY);
const ADMIN_IDS = cleanEnv(process.env.ADMIN_CHAT_IDS || '')
    .split(',')
    .map(s => cleanEnv(s))
    .filter(Boolean);
const PROXY_URL = cleanEnv(process.env.HTTPS_PROXY || process.env.HTTP_PROXY);
const SOCKS_URL = cleanEnv(process.env.SOCKS_PROXY);
const TELEGRAM_DIRECT = (() => {
    const v = cleanEnv(process.env.TELEGRAM_DIRECT);
    return v === '1' || v.toLowerCase() === 'true';
})();

if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN не задан в .env');
    process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_KEY || SUPABASE_URL.includes('your-project')) {
    console.warn(`⚠️  Supabase не настроен — сообщения не будут сохраняться в БД (URL: ${SUPABASE_URL ? 'OK' : 'MISSING'}, KEY: ${SUPABASE_KEY ? 'OK' : 'MISSING'})`);
} else {
    console.log(`✅ Supabase подключен (URL: ${SUPABASE_URL})`);
    if (SUPABASE_ROLE && SUPABASE_ROLE !== 'service_role') {
        console.warn(`⚠️ Supabase ключ с ролью "${SUPABASE_ROLE}". Для бота обычно нужен "service_role".`);
    }
}

let proxyAgent = null;
if (TELEGRAM_DIRECT) {
    try {
        process.env.HTTPS_PROXY = '';
        process.env.HTTP_PROXY = '';
        process.env.ALL_PROXY = '';
        process.env.NO_PROXY = 'api.telegram.org';
        console.log('🔓 direct mode: proxies disabled');
    } catch {}
} else if (PROXY_URL) {
    try {
        const { HttpsProxyAgent } = require('https-proxy-agent');
        proxyAgent = new HttpsProxyAgent(PROXY_URL);
        const masked = PROXY_URL.replace(/:\/\/[^@]*@/, '://***@');
        console.log('🌐 http(s) proxy enabled:', masked);
    } catch (e) {
        console.warn('⚠️ https-proxy-agent не установлен — PROXY_URL будет проигнорирован');
    }
} else if (SOCKS_URL) {
    try {
        const { SocksProxyAgent } = require('socks-proxy-agent');
        proxyAgent = new SocksProxyAgent(SOCKS_URL);
        console.log('🧦 socks proxy enabled:', SOCKS_URL);
    } catch (e) {
        console.warn('⚠️ socks-proxy-agent не установлен — SOCKS_URL будет проигнорирован');
    }
}
const bot = new Telegraf(BOT_TOKEN, proxyAgent ? { telegram: { agent: proxyAgent } } : undefined);
const supabase = (SUPABASE_URL && SUPABASE_KEY && !SUPABASE_URL.includes('your-project'))
    ? createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;

if (cleanEnv(process.env.LOG_UPDATES) === '1') {
    bot.use(async (ctx, next) => {
        try {
            const t = ctx.updateType;
            const m = ctx.message?.text || ctx.callbackQuery?.data || '';
            console.log('update:', t, m);
        } catch {}
        return next();
    });
}
bot.catch((err, ctx) => {
    console.error('telegram error:', err?.description || err?.message || String(err));
});

process.on('unhandledRejection', (e) => {
    console.error('unhandledRejection:', e?.message || String(e));
});
process.on('uncaughtException', (e) => {
    console.error('uncaughtException:', e?.message || String(e));
});
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

    // Сценарий 2: Начало чата по заказу → /start chat_ORDERIDWITHOUTHYPHENS_ROLE
    if (param.startsWith('chat_')) {
        console.log("RECEIVED START PARAM:", param);
        const match = param.match(/^chat_([a-fA-F0-9]{32})_(c|e)$/);
        if (!match) return ctx.reply('⚠️ Неверный формат ссылки.');

        const orderIdHex = match[1];
        const roleStr = match[2];

        // Restore UUID format: 8-4-4-4-12
        const orderId = `${orderIdHex.slice(0, 8)}-${orderIdHex.slice(8, 12)}-${orderIdHex.slice(12, 16)}-${orderIdHex.slice(16, 20)}-${orderIdHex.slice(20)}`;

        if (!supabase) return ctx.reply('⚠️ Ошибка базы данных.');
        if (SUPABASE_ROLE && SUPABASE_ROLE !== 'service_role') {
            return ctx.reply('⚠️ Бот подключён к Supabase ключом без прав (не "service_role"). Замените SUPABASE_SERVICE_ROLE_KEY в bot/.env на service_role key из Supabase.');
        }

        // Fetch Order
        const fetchOrder = async (idValue) => supabase.from('orders').select('*').eq('id', idValue).maybeSingle();

        let order = null;
        let error = null;
        ({ data: order, error } = await fetchOrder(orderId));
        if (!order && !error) {
            const second = await fetchOrder(orderIdHex);
            order = second.data;
            error = second.error;
        }
        if (error || !order) {
            if (error) {
                console.error('order fetch error:', orderId, error.message);
                return ctx.reply('⚠️ Не удалось получить заказ из базы данных.');
            }
            console.warn('order not found:', orderId, orderIdHex);
            return ctx.reply(`⚠️ Заказ не найден.\nID: ${orderId}`);
        }

        let senderId = null;
        let receiverId = null;

        if (roleStr === 'c') {
            senderId = order.customer_id;
            receiverId = order.executor_id;
        } else if (roleStr === 'e') {
            senderId = order.executor_id;
            receiverId = order.customer_id;
        }

        if (!senderId || !receiverId) return ctx.reply('⚠️ Не удалось определить участников заказа.');

        chatSessions.set(`session_${telegramChatId}`, { orderId, senderId, receiverId, telegramChatId });
        return ctx.reply('💬 Напишите ваше сообщение.\nОно будет проверено модератором, после чего появится прямо в окне заказа в приложении БезБарьеров.');
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
            try {
                await supabase.from('order_messages').insert({
                    order_id: finalMsg.orderId,
                    sender_id: finalMsg.senderId,
                    receiver_id: finalMsg.receiverId,
                    text: finalMsg.text,
                    is_approved: true
                });
            } catch (err) {
                console.error('Ошибка сохранения ответа:', err.message);
            }
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
        return ctx.reply('ℹ️ Чтобы начать чат по заказу, нажмите кнопку Start вверху чата (после открытия бота по ссылке из приложения), затем отправьте сообщение.');
    }

    const { orderId, senderId, receiverId } = session;

    // Ищем профили отправителя и получателя (чтобы взять имена)
    let senderProfile = null;
    let receiverProfile = null;
    if (supabase) {
        const [sp, rp] = await Promise.all([
            supabase.from('profiles').select('*').eq('id', senderId).maybeSingle(),
            supabase.from('profiles').select('*').eq('id', receiverId).maybeSingle()
        ]);
        senderProfile = sp.data;
        receiverProfile = rp.data;
    }

    const senderName = senderProfile?.name || ctx.from.first_name || 'Пользователь';
    const receiverName = receiverProfile?.name || 'Получатель';

    const msgKey = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    pendingMessages.set(msgKey, {
        senderId,
        receiverId,
        orderId,
        senderName,
        receiverName,
        text,
        senderTgChatId: chatId,
        receiverTgChatId: receiverProfile?.telegram_chat_id || null
    });

    await ctx.reply('⌛ Сообщение отправлено на проверку. После одобрения оно будет доставлено в приложение.');

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

    await Promise.allSettled(
        ADMIN_IDS.map((adminId) =>
            bot.telegram.sendMessage(adminId, adminText, keyboard).catch(e => {
                console.error(`Не удалось доставить Админу ${adminId}: ${e.message}`);
            })
        )
    );

    chatSessions.delete(`session_${chatId}`);
});

bot.command('ping', async (ctx) => {
    await ctx.reply('pong');
});

bot.command('id', async (ctx) => {
    await ctx.reply(String(ctx.chat.id));
});

bot.command('checkorder', async (ctx) => {
    const text = String(ctx.message?.text || '');
    const arg = text.split(' ').slice(1).join(' ').trim();
    if (!arg) {
        return ctx.reply('Использование: /checkorder <uuid или 32-символьный hex>');
    }
    if (!supabase) return ctx.reply('⚠️ Ошибка базы данных.');

    const hex = arg.replace(/[^a-fA-F0-9]/g, '');
    const uuid = /^[a-fA-F0-9]{32}$/.test(hex)
        ? `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
        : arg;

    const first = await supabase.from('orders').select('id,status,customer_id,executor_id').eq('id', uuid).maybeSingle();
    const second = (!first.data && !first.error) ? await supabase.from('orders').select('id,status,customer_id,executor_id').eq('id', hex).maybeSingle() : null;
    const data = first.data || second?.data || null;
    const error = first.error || second?.error || null;

    if (error) {
        console.error('checkorder error:', uuid, error.message);
        return ctx.reply('⚠️ Ошибка проверки заказа в базе данных.');
    }
    if (!data) {
        return ctx.reply(`❌ Заказ не найден.\nID: ${uuid}`);
    }
    return ctx.reply(`✅ Заказ найден.\nID: ${data.id}\nСтатус: ${data.status}`);
});

// ─── Кнопка: Одобрить ─────────────────────────────────────────────────────────
bot.action(/^approve_(.+)$/, async (ctx) => {
    const msgKey = ctx.match[1];
    const msg = pendingMessages.get(msgKey);
    if (!msg) return ctx.answerCbQuery('❌ Уже обработано');

    if (supabase) {
        try {
            await supabase.from('order_messages').insert({
                order_id: msg.orderId, sender_id: msg.senderId,
                receiver_id: msg.receiverId, text: msg.text, is_approved: true
            });
        } catch (err) {
            console.error('Ошибка сохранения после одобрения:', err.message);
        }
    }
    await Promise.allSettled([
        msg.receiverTgChatId
            ? bot.telegram.sendMessage(msg.receiverTgChatId, `📨 Сообщение от ${msg.senderName}:\n\n${msg.text}`).catch(() => { })
            : Promise.resolve(),
        msg.senderTgChatId
            ? bot.telegram.sendMessage(msg.senderTgChatId, '✅ Ваше сообщение одобрено и доставлено.').catch(() => { })
            : Promise.resolve()
    ]);
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
async function startBot() {
    try {
        try { await bot.telegram.deleteWebhook({ drop_pending_updates: true }); } catch (e) {}
        await bot.launch();
        try {
            const me = await bot.telegram.getMe();
            console.log(`🤖 БезБарьеров бот запущен! (@${me?.username || 'unknown'})`);
        } catch {
            console.log('🤖 БезБарьеров бот запущен! (имя бота недоступно)');
        }
        if (ADMIN_IDS.length) {
            console.log(`📬 Сообщения на проверку → ${ADMIN_IDS.join(', ')}`);
        } else {
            console.warn('⚠️  ADMIN_CHAT_IDS не задан — некому будет пересылать сообщения!');
        }
    } catch (e) {
        console.error('❌ Ошибка запуска бота:', e.message);
        const isNetwork = /ECONNRESET|ETIMEDOUT|ENETUNREACH|socket hang up|fetch failed/i.test(e?.message || '');
        const delayMs = 10000;
        console.log(`⏳ Повторный запуск через ${Math.round(delayMs / 1000)}с${isNetwork ? ' (сетевая ошибка)' : ''}`);
        setTimeout(startBot, delayMs);
    }
}
startBot();

if (cleanEnv(process.env.HEALTH_CHECK) === '1') {
    setInterval(async () => {
        try {
            await bot.telegram.getMe();
            console.log('🟢 health: telegram ok');
        } catch (e) {
            console.log('🔴 health: telegram error:', e?.message || 'unknown');
        }
    }, 60000);
}

process.once('SIGINT', () => { try { bot.stop('SIGINT') } catch (e) { } });
process.once('SIGTERM', () => { try { bot.stop('SIGTERM') } catch (e) { } });
