-- Чёрный список пользователей Telegram (блокировка доступа к ботам)
CREATE TABLE IF NOT EXISTS public.blocked_users (
  telegram_id BIGINT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  reason TEXT,
  blocked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.blocked_users TO service_role;
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service Role All blocked_users" ON public.blocked_users;
CREATE POLICY "Service Role All blocked_users"
ON public.blocked_users FOR ALL TO service_role USING (true) WITH CHECK (true);
