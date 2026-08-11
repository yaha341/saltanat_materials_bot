-- payment-proofs bucket was created with allowed_mime_types limited to
-- image/jpeg, image/png, image/gif, image/webp (see COMPLETE-SETUP.sql).
-- bot.server.ts explicitly accepts a receipt as EITHER a photo OR a document
-- (e.g. a PDF, or an image sent uncompressed as a file — Telegram often
-- reports those with a generic/absent content-type). Supabase Storage
-- silently rejects any upload whose content-type isn't in the whitelist,
-- and bot.server.ts didn't log that failure, so the buyer/admin just never
-- got a receipt with no error anywhere. Same class of bug already fixed for
-- product-files in PATCH-PRODUCT-FILES-MIME.sql — applying the same fix here.
-- Run in Supabase SQL Editor.

UPDATE storage.buckets
SET allowed_mime_types = NULL
WHERE id = 'payment-proofs';
