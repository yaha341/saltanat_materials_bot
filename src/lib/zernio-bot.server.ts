import {
  sendZernioInboxMessage,
  replyToInstagramComment,
  sendInstagramPrivateReply,
} from "./zernio.server";
import { convertAmount } from "./currency.server";

async function db() {
  const { supabaseAdmin } = await import("@/integrations-supabase/client.server");
  return supabaseAdmin;
}

function appUrl(): string {
  return (
    process.env.PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "https://saltanat-materials-bot-7yy5.vercel.app"
  ).replace(/\/$/, "");
}

/**
 * Создать или обновить пользователя Instagram в базе данных.
 */
export async function upsertZernioUser(
  userKey: string,
  conversationId?: string,
  accountId?: string,
  username?: string,
  firstName?: string,
  metadata?: Record<string, any>,
) {
  const s = await db();
  const { data: existing } = await s
    .from("bot_users")
    .select("*")
    .eq("user_key", userKey)
    .maybeSingle();

  if (existing) {
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (conversationId) updates.zernio_conversation_id = conversationId;
    if (accountId) updates.zernio_account_id = accountId;
    if (username) updates.username = username;
    if (firstName) updates.first_name = firstName;
    if (metadata) {
      updates.metadata = { ...(existing.metadata || {}), ...metadata };
    }

    await s.from("bot_users").update(updates).eq("user_key", userKey);
    return { ...existing, ...updates };
  }

  const newUser = {
    user_key: userKey,
    platform: "instagram",
    zernio_conversation_id: conversationId,
    zernio_account_id: accountId,
    username: username || null,
    first_name: firstName || "Инста-гость",
    state: {},
    metadata: metadata || {},
  };

  const { data: inserted, error } = await s.from("bot_users").insert(newUser).select().single();
  if (error) {
    console.error("[zernio-bot] error upserting user:", error);
    return newUser;
  }
  return inserted;
}

/**
 * Обработать входящее личное сообщение (DM) из Instagram Direct.
 * Соответствует спецификации Zernio Webhooks: payload.message, payload.conversation, payload.account
 */
export async function handleZernioMessage(payload: any) {
  const msgObj = payload.message || {};
  const convObj = payload.conversation || {};
  const accObj = payload.account || {};

  const conversationId = msgObj.conversationId || convObj.id;
  const accountId = accObj.accountId || accObj.id || msgObj.accountId;
  const senderObj = msgObj.sender || {};
  const senderId = senderObj.id || senderObj.username || convObj.participantId || "unknown";
  const senderUsername = senderObj.username || convObj.participantUsername || "";
  const senderName = senderObj.name || convObj.participantName || senderUsername || "друг";
  const userKey = `ig_${senderId}`;
  const text = (msgObj.text || "").trim();

  if (!conversationId || !accountId) {
    console.warn("[zernio-bot] message.received missing conversationId or accountId:", payload);
    return;
  }

  // Логируем сообщение
  console.log(`[zernio-bot] DM from ${userKey} (${senderUsername}): "${text}"`);

  // Создаем или обновляем пользователя
  const user = await upsertZernioUser(userKey, conversationId, accountId, senderUsername, senderName);

  const lower = text.toLowerCase();
  
  // Извлекаем данные о нажатых кнопках (Postback)
  const metadata = payload.message?.metadata || {};
  const isPostback = metadata.interactiveType === "postback";
  const postbackPayload = metadata.interactiveId || "";

  // 1. Обработка выбора клиента (Электронный / Готовый вид)
  if (postbackPayload === "SELECT_ELECTRONIC" || lower.includes("электрон")) {
    const msg = `Вы выбрали **Электронный вид** 📧\n\nМы отправим вам ссылку на скачивание сразу после подтверждения оплаты.`;
    await sendZernioInboxMessage(conversationId, accountId, msg);
    return;
  }

  if (postbackPayload === "SELECT_READY" || lower.includes("готов")) {
    const msg = `Вы выбрали **Готовый вид** 📦\n\nНаш менеджер свяжется с вами для уточнения адреса доставки в ближайшее время.`;
    await sendZernioInboxMessage(conversationId, accountId, msg);
    return;
  }

  // 2. Обработка стандартных команд
  if (lower === "/start" || lower.includes("старт") || lower.includes("меню") || lower.includes("каталог")) {
    const welcome = `Здравствуйте, ${senderName}! 👋\n\nЯ помогу вам с выбором материалов. Воспользуйтесь кнопками под нашими постами или напишите ваш вопрос сюда.`;
    await sendZernioInboxMessage(conversationId, accountId, welcome);
    return;
  }

  // 3. Дефолтный ответ (если это не кнопка и не команда)
  if (text && !isPostback) {
    const replyText = `Спасибо за сообщение, ${senderName}! Мы скоро ответим вам лично. 📩`;
    await sendZernioInboxMessage(conversationId, accountId, replyText);
  }
}

/**
 * Обработать входящий комментарий под постом/Reels в Instagram.
 * Соответствует спецификации Zernio Webhooks: payload.comment, payload.post, payload.account
 *
 * ВАЖНО: Zernio's native Comment-to-DM automations будут автоматически обрабатывать
 * совпадение ключевых слов и отправку DM / Public Replies.
 * Здесь мы просто логируем событие для наших записей.
 */
export async function handleZernioComment(payload: any) {
  const commentObj = payload.comment || {};
  const commentText = (commentObj.text || commentObj.content || "").trim();
  const commentId = commentObj.id;
  
  // Zernio's native Comment-to-DM automations will automatically handle
  // matching keywords and sending DMs / Public Replies.
  // Here we just log the event for our records.
  
  console.log(`[zernio-bot] Received comment (handled by Zernio Automations): "${commentText}" (ID: ${commentId})`);
}
