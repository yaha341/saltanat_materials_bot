-- Add missing product URL columns (code expects file_url / file_url_kz)
-- Run in Supabase SQL Editor for razvivashka

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS file_url TEXT,
  ADD COLUMN IF NOT EXISTS file_url_kz TEXT,
  ADD COLUMN IF NOT EXISTS file_path_kz TEXT,
  ADD COLUMN IF NOT EXISTS file_name_kz TEXT,
  ADD COLUMN IF NOT EXISTS country_prices JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS category_ids UUID[] DEFAULT '{}';

-- Snapshots on order items (delivery by URL)
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS file_path_kz_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS file_name_kz_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS file_url_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS file_url_kz_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS delivered_language TEXT;

NOTIFY pgrst, 'reload schema';
