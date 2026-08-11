-- Missing from COMPLETE-SETUP.sql: bot.server.ts / zernio-bot.server.ts address
-- bot_users / cart_items / orders by a unified "user_key" (e.g. "tg_123456789" for
-- Telegram, "ig_..." for Instagram) so both channels can share one users/cart/orders
-- schema. Without this column, upsertUser()'s `.upsert(..., { onConflict: "user_key" })`
-- errors out (column/constraint doesn't exist), the error is swallowed, and every
-- /start crashes with "Cannot read properties of null (reading 'state')".
-- Run in Supabase SQL Editor.

ALTER TABLE public.bot_users
  ADD COLUMN IF NOT EXISTS user_key TEXT,
  ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'telegram';

UPDATE public.bot_users SET user_key = 'tg_' || telegram_id WHERE user_key IS NULL;
ALTER TABLE public.bot_users ALTER COLUMN user_key SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS bot_users_user_key_idx ON public.bot_users(user_key);

ALTER TABLE public.cart_items ADD COLUMN IF NOT EXISTS user_key TEXT;
UPDATE public.cart_items SET user_key = 'tg_' || telegram_id WHERE user_key IS NULL;
CREATE INDEX IF NOT EXISTS idx_cart_items_user_key ON public.cart_items(user_key);

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS user_key TEXT;
UPDATE public.orders SET user_key = 'tg_' || telegram_id WHERE user_key IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_user_key ON public.orders(user_key);

-- bot.server.ts inserts new cart_items/orders rows with telegram_id only (no user_key) —
-- backfill it automatically so those inserts stay queryable by user_key afterwards.
CREATE OR REPLACE FUNCTION public.fill_user_key_from_telegram_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_key IS NULL AND NEW.telegram_id IS NOT NULL THEN
    NEW.user_key := 'tg_' || NEW.telegram_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_cart_items_fill_user_key ON public.cart_items;
CREATE TRIGGER trg_cart_items_fill_user_key BEFORE INSERT ON public.cart_items
FOR EACH ROW EXECUTE FUNCTION public.fill_user_key_from_telegram_id();

DROP TRIGGER IF EXISTS trg_orders_fill_user_key ON public.orders;
CREATE TRIGGER trg_orders_fill_user_key BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.fill_user_key_from_telegram_id();

NOTIFY pgrst, 'reload schema';
