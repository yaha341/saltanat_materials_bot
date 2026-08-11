-- VIP subscriptions columns used by admin manual add + cron warnings
-- Run in Supabase SQL Editor for razvivashka

ALTER TABLE public.vip_subscriptions
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS imported BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_note TEXT;

-- Personal tariff assignment (deep links / admin)
CREATE TABLE IF NOT EXISTS public.vip_member_profiles (
  telegram_id BIGINT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  assigned_tariff_id UUID REFERENCES public.vip_tariffs(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_source TEXT NOT NULL DEFAULT 'deep_link'
    CHECK (assigned_source IN ('deep_link', 'payment', 'admin'))
);

GRANT ALL ON public.vip_member_profiles TO service_role;
ALTER TABLE public.vip_member_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service Role All vip_member_profiles" ON public.vip_member_profiles;
CREATE POLICY "Service Role All vip_member_profiles"
ON public.vip_member_profiles FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
