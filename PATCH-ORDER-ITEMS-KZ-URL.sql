-- Missing from COMPLETE-SETUP.sql: bot.server.ts inserts order_items rows with
-- file_path_kz_snapshot, file_name_kz_snapshot, file_url_snapshot, and
-- file_url_kz_snapshot (kz-language file + externally-hosted file support),
-- but the table only has file_path_snapshot / file_name_snapshot. Supabase
-- silently rejects the whole insert (unknown column), the error isn't
-- checked, and every order is placed with zero order_items — so deliverOrder
-- has nothing to iterate and never sends the purchased file.
-- Run in Supabase SQL Editor.

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS file_path_kz_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS file_name_kz_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS file_url_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS file_url_kz_snapshot TEXT;

NOTIFY pgrst, 'reload schema';
