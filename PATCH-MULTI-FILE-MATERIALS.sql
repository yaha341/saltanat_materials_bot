-- Products currently deliver exactly one file per language (products.file_path /
-- file_path_kz). The client wants to upload a material as multiple photos
-- (e.g. several worksheet pages) instead of a single file. This adds a
-- product_material_files table (same shape as product_images, but per
-- language and used for delivery instead of catalog display), plus JSONB
-- snapshot columns on order_items so an order still has the exact files that
-- were current at purchase time, even if the product is edited later.
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.product_material_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  language TEXT NOT NULL DEFAULT 'ru' CHECK (language IN ('ru', 'kz')),
  file_path TEXT NOT NULL,
  file_name TEXT,
  sort_order INT NOT NULL DEFAULT 0
);
GRANT ALL ON public.product_material_files TO service_role;
ALTER TABLE public.product_material_files ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_product_material_files_product ON public.product_material_files(product_id, language, sort_order);

DROP POLICY IF EXISTS "Service Role All product_material_files" ON public.product_material_files;
CREATE POLICY "Service Role All product_material_files"
ON public.product_material_files FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS material_files_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS material_files_kz_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
