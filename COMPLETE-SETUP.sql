-- === ПОЛНАЯ НАСТРОЙКА SUPABASE ДЛЯ TELEGRAM БОТА ===
-- Выполните этот скрипт по частям в SQL Editor Supabase
-- https://supabase.com/dashboard/project/nytjbxtbmtadmqentgca/sql

-- ============================================
-- ЧАСТЬ 1: Создание таблиц базы данных
-- ============================================

-- Categories with nesting
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  parent_id UUID REFERENCES public.categories(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- Products
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  category_ids UUID[] DEFAULT '{}',
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  keywords TEXT NOT NULL DEFAULT '',
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'KZT',
  country_prices JSONB DEFAULT '{}',
  file_path TEXT,
  file_name TEXT,
  file_path_kz TEXT,
  file_name_kz TEXT,
  file_url TEXT,
  file_url_kz TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_products_category ON public.products(category_id);
CREATE INDEX idx_products_search ON public.products USING gin (to_tsvector('simple', name || ' ' || coalesce(description,'') || ' ' || coalesce(keywords,'')));

-- Product images
CREATE TABLE public.product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  image_path TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.product_images TO service_role;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_product_images_product ON public.product_images(product_id);

-- Payment methods by country
CREATE TABLE public.payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code TEXT NOT NULL,
  country_name TEXT NOT NULL,
  instructions TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  qr_code_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.payment_methods TO service_role;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

-- Bot users (telegram users)
CREATE TABLE public.bot_users (
  telegram_id BIGINT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  language_code TEXT,
  contact_phone TEXT,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.bot_users TO service_role;
ALTER TABLE public.bot_users ENABLE ROW LEVEL SECURITY;

-- Blocked users (permanent bot blacklist)
CREATE TABLE public.blocked_users (
  telegram_id BIGINT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  reason TEXT,
  blocked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.blocked_users TO service_role;
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

-- Cart items
CREATE TABLE public.cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT NOT NULL REFERENCES public.bot_users(telegram_id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(telegram_id, product_id)
);
GRANT ALL ON public.cart_items TO service_role;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

-- Orders
CREATE TABLE public.orders (
  id BIGSERIAL PRIMARY KEY,
  telegram_id BIGINT NOT NULL REFERENCES public.bot_users(telegram_id),
  username TEXT,
  display_name TEXT,
  contact TEXT,
  country_code TEXT,
  country_name TEXT,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'KZT',
  status TEXT NOT NULL DEFAULT 'awaiting_payment',
  payment_proof_path TEXT,
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_orders_telegram ON public.orders(telegram_id);
CREATE INDEX idx_orders_status ON public.orders(status);

-- Order items
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  name_snapshot TEXT NOT NULL,
  price_snapshot NUMERIC(10,2) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  file_path_snapshot TEXT,
  file_name_snapshot TEXT,
  delivered_language TEXT
);
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_order_items_order ON public.order_items(order_id);
COMMENT ON COLUMN public.order_items.delivered_language IS 'Tracks which language variant was delivered: NULL (not delivered), ru, kz, or both';

-- App settings (kv)
CREATE TABLE public.app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- VIP Tariffs
CREATE TABLE public.vip_tariffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'KZT',
  duration_days INT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.vip_tariffs TO service_role;
ALTER TABLE public.vip_tariffs ENABLE ROW LEVEL SECURITY;

-- VIP Subscriptions
CREATE TABLE public.vip_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT NOT NULL,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  tariff_id UUID NOT NULL REFERENCES public.vip_tariffs(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending_payment',
  payment_proof_path TEXT,
  group_invite_link TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT status_check CHECK (status IN ('pending_payment', 'active', 'expired', 'cancelled'))
);
GRANT ALL ON public.vip_subscriptions TO service_role;
ALTER TABLE public.vip_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_vip_subscriptions_telegram ON public.vip_subscriptions(telegram_id);
CREATE INDEX idx_vip_subscriptions_status ON public.vip_subscriptions(status);
CREATE INDEX idx_vip_subscriptions_expires ON public.vip_subscriptions(expires_at);

-- updated_at trigger (must be defined before any CREATE TRIGGER references it)
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_vip_subscriptions_touch BEFORE UPDATE ON public.vip_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_bot_users_touch BEFORE UPDATE ON public.bot_users
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_orders_touch BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed default payment methods
INSERT INTO public.payment_methods (country_code, country_name, instructions, sort_order) VALUES
('KZ', '🇰🇿 Казахстан', 'Kaspi / Halyk\n\nПереведите сумму на номер: +7 XXX XXX XX XX\nПолучатель: Имя Фамилия\n\nПосле оплаты пришлите скриншот в этот чат.', 1),
('RU', '🇷🇺 Россия', 'Сбербанк / Тинькофф\n\nНомер карты: 0000 0000 0000 0000\nПолучатель: Имя Фамилия\n\nПосле оплаты пришлите скриншот в этот чат.', 2),
('KG', '🇰🇬 Кыргызстан', 'MBank / Optima\n\nНомер: +996 XXX XXX XXX\n\nПосле оплаты пришлите скриншот в этот чат.', 3),
('BY', '🇧🇾 Беларусь', 'Реквизиты:\n\nНомер карты: 0000 0000 0000 0000\n\nПосле оплаты пришлите скриншот в этот чат.', 4),
('OTHER', '🌍 Другая страна', 'Свяжитесь с продавцом для уточнения реквизитов оплаты.', 99);

-- Добавление валюты в payment_methods
ALTER TABLE public.payment_methods ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'KZT';
UPDATE public.payment_methods SET currency = CASE country_code
  WHEN 'KZ' THEN 'KZT'
  WHEN 'RU' THEN 'RUB'
  WHEN 'KG' THEN 'KGS'
  WHEN 'BY' THEN 'BYN'
  ELSE 'USD'
END WHERE currency = 'KZT' OR currency IS NULL;

-- ============================================
-- ЧАСТЬ 2: Создание Storage Buckets
-- ============================================

-- Создание bucket для изображений товаров
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- Создание bucket для файлов товаров
-- allowed_mime_types = NULL: иначе .rar / octet-stream / x-zip отклоняются
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-files',
  'product-files',
  true,
  52428800, -- 50MB limit
  NULL
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = NULL;

-- Создание bucket для скриншотов оплаты
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-proofs',
  'payment-proofs',
  false, -- приватный
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- ============================================
-- ЧАСТЬ 3: RLS Policies для Storage
-- ============================================

-- Политики для product-images (публичный доступ на чтение)
DROP POLICY IF EXISTS "Public Read product-images" ON storage.objects;
CREATE POLICY "Public Read product-images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'product-images');

-- Политики для product-files (публичный доступ на чтение)
DROP POLICY IF EXISTS "Public Read product-files" ON storage.objects;
CREATE POLICY "Public Read product-files"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'product-files');

-- Политики для payment-proofs (только сервисный роль)
DROP POLICY IF EXISTS "Service Role All payment-proofs" ON storage.objects;
CREATE POLICY "Service Role All payment-proofs"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'payment-proofs')
WITH CHECK (bucket_id = 'payment-proofs');

-- ============================================
-- ЧАСТЬ 4: RLS Policies для таблиц
-- ============================================

-- Categories
DROP POLICY IF EXISTS "Service Role All categories" ON public.categories;
CREATE POLICY "Service Role All categories"
ON public.categories FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Products
DROP POLICY IF EXISTS "Service Role All products" ON public.products;
CREATE POLICY "Service Role All products"
ON public.products FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Product images
DROP POLICY IF EXISTS "Service Role All product_images" ON public.product_images;
CREATE POLICY "Service Role All product_images"
ON public.product_images FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Payment methods
DROP POLICY IF EXISTS "Service Role All payment_methods" ON public.payment_methods;
CREATE POLICY "Service Role All payment_methods"
ON public.payment_methods FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Bot users
DROP POLICY IF EXISTS "Service Role All bot_users" ON public.bot_users;
CREATE POLICY "Service Role All bot_users"
ON public.bot_users FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Blocked users
DROP POLICY IF EXISTS "Service Role All blocked_users" ON public.blocked_users;
CREATE POLICY "Service Role All blocked_users"
ON public.blocked_users FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Cart items
DROP POLICY IF EXISTS "Service Role All cart_items" ON public.cart_items;
CREATE POLICY "Service Role All cart_items"
ON public.cart_items FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Orders
DROP POLICY IF EXISTS "Service Role All orders" ON public.orders;
CREATE POLICY "Service Role All orders"
ON public.orders FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Order items
DROP POLICY IF EXISTS "Service Role All order_items" ON public.order_items;
CREATE POLICY "Service Role All order_items"
ON public.order_items FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- App settings
DROP POLICY IF EXISTS "Service Role All app_settings" ON public.app_settings;
CREATE POLICY "Service Role All app_settings"
ON public.app_settings FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- VIP Tariffs RLS Policy
DROP POLICY IF EXISTS "Service Role All vip_tariffs" ON public.vip_tariffs;
CREATE POLICY "Service Role All vip_tariffs"
ON public.vip_tariffs FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- VIP Subscriptions RLS Policy
DROP POLICY IF EXISTS "Service Role All vip_subscriptions" ON public.vip_subscriptions;
CREATE POLICY "Service Role All vip_subscriptions"
ON public.vip_subscriptions FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Full-text search function for products
CREATE OR REPLACE FUNCTION search_products(search_query text)
RETURNS TABLE (
  id uuid,
  category_id uuid,
  category_ids uuid[],
  name text,
  description text,
  keywords text,
  price numeric,
  currency text,
  country_prices jsonb,
  file_path text,
  file_name text,
  file_path_kz text,
  file_name_kz text,
  is_active boolean,
  sort_order int,
  created_at timestamptz,
  product_images jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.category_id,
    p.category_ids,
    p.name,
    p.description,
    p.keywords,
    p.price,
    p.currency,
    p.country_prices,
    p.file_path,
    p.file_name,
    p.file_path_kz,
    p.file_name_kz,
    p.is_active,
    p.sort_order,
    p.created_at,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('image_path', pi.image_path, 'sort_order', pi.sort_order))
       FROM product_images pi
       WHERE pi.product_id = p.id
       ORDER BY pi.sort_order),
      '[]'::jsonb
    ) as product_images
  FROM products p
  WHERE p.is_active = true
    AND to_tsvector('simple', p.name || ' ' || COALESCE(p.description, '') || ' ' || COALESCE(p.keywords, ''))
        @@ to_tsquery('simple', search_query)
  ORDER BY p.name
  LIMIT 30;
END;
$$ LANGUAGE plpgsql STABLE;
