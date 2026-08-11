# Деплой Telegram ботов (магазин + VIP) на Vercel — razvivashka

## Архитектура
- **База данных**: Supabase
- **Фронтенд / SSR**: React + TanStack Start + Nitro
- **Shop bot**: webhook `/api/public/telegram/webhook`
- **VIP bot**: webhook `/api/public/telegram/webhook-vip`
- **VIP cron**: HTTP `GET /api/public/vip/cron` (на Hobby/Free Vercel — **внешний** cron; внутри также чинит webhooks)
- **Webhook heal**: `GET /api/public/telegram/ensure-webhook?secret=…`

Live: `https://razvivashka.vercel.app`

---

## 1. Переменные окружения (Vercel → Settings → Environment Variables)

### Обязательные

```
SUPABASE_URL=https://<project-id>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role>
SUPABASE_PUBLISHABLE_KEY=<anon/publishable>
VITE_SUPABASE_URL=https://<project-id>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon/publishable>

TELEGRAM_BOT_TOKEN=<shop bot token>
VIP_BOT_TOKEN=<vip bot token>
VIP_BOT_USERNAME=<username_без_@>

ADMIN_USERNAME=<strong-login>
ADMIN_PASSWORD=<strong-password>
SESSION_SECRET=<random-32-plus-chars>
```

### Рекомендуемые

```
PUBLIC_APP_URL=https://razvivashka.vercel.app
TELEGRAM_WEBHOOK_SECRET=<random-secret-for-shop-webhook>
VIP_TELEGRAM_WEBHOOK_SECRET=<random-secret-for-vip-webhook>
CRON_SECRET=<random-secret-for-vip-cron>
```

`CRON_SECRET` нужен для VIP cron (reminders / kick) и автопочинки webhook. cron-job.org передаёт `?secret=` или `Authorization: Bearer`.

После изменения env — **Redeploy**.

---

## 2. Webhooks

```bash
# Shop
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://razvivashka.vercel.app/api/public/telegram/webhook","secret_token":"<TELEGRAM_WEBHOOK_SECRET>"}'

# VIP
curl -X POST "https://api.telegram.org/bot<VIP_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://razvivashka.vercel.app/api/public/telegram/webhook-vip","secret_token":"<VIP_TELEGRAM_WEBHOOK_SECRET>"}'
```

Или после деплоя (нужен `.env.local` с токенами):

```bash
node scripts/set-webhooks.mjs
```

если скрипт есть; иначе дерните ensure:

```
https://razvivashka.vercel.app/api/public/telegram/ensure-webhook?secret=$CRON_SECRET
```

Пока secret в env не задан — webhook принимается (с warn в лог). После добавления секрета — Redeploy + ensure/setWebhook.

---

## 3. VIP cron (внешний)

1. [cron-job.org](https://cron-job.org) (или аналог)
2. URL: `https://razvivashka.vercel.app/api/public/vip/cron?secret=ВАШ_CRON_SECRET`
3. Schedule: каждый час или каждые 5–15 мин
4. Method: GET

Локально:

```bash
node scripts/run-vip-cron.mjs
# или
node scripts/run-vip-cron.mjs --url https://razvivashka.vercel.app
```

Ответ включает `webhooks` (автопочинка shop+VIP) и `vipCron` (warn/kick).

Только хуки:

```
https://razvivashka.vercel.app/api/public/telegram/ensure-webhook?secret=$CRON_SECRET
```

---

## 4. SQL

Если VIP-колонки ещё не добавляли — в Supabase SQL Editor:

1. `PATCH-VIP-SUBSCRIPTIONS.sql` — `started_at`, `imported`, `admin_note`, таблица `vip_member_profiles`
2. `PATCH-BLOCKED-USERS.sql` — чёрный список (`blocked_users`)
3. `PATCH-FILE-URL.sql` — колонки файлов товаров (если не сохраняются продукты)
4. `PATCH-USER-KEY.sql` — колонка `user_key` на `bot_users`/`cart_items`/`orders`. **Обязательно**, без неё бот падает на любом `/start` (`Cannot read properties of null (reading 'state')`).
5. `PATCH-PAYMENT-PROOFS-MIME.sql` — снимает MIME-ограничение с бакета `payment-proofs`. **Обязательно**, иначе чек, присланный документом (не сжатым фото), не сохраняется без единой ошибки в логах.

Полная схема: `COMPLETE-SETUP.sql`.

---

## 5. Настройки в админке `/admin/vip/settings`

- `vip_group_id` — ID VIP-группы (бот — админ с правом ban users)
- `admin_chat_id` / `owner_chat_id` — куда приходят чеки
- инструкции оплаты, welcome, тест-режим

В `/admin/vip/subscribers`: ручное добавление по ID (кнопка «Проверить в Telegram»), фильтр «Активные» после сохранения.

**Исключить** на странице подписчиков кикает из группы и закрывает подписку.

---

## 6. VIP smoke checklist

1. Новый: `/start` → вход → чек → confirm → одноразовая ссылка
2. В группе: продление → срок стекается, **без** новой ссылки
3. Вне группы после кика: продление → одноразовая ссылка
4. `pending_payment` + «Продлить» → «ждёте подтверждения»
5. Админ **Исключить** → кик + expired + сообщение в боте
6. Cron / ensure-webhook → URL хуков на месте

---

## Обновления

`git push` → Vercel деплоит. Без `PUBLIC_APP_URL` self-heal может ошибочно брать preview URL.
