-- Fix product file uploads: clear MIME whitelist on product-files
-- Run in Supabase SQL Editor for razvivashka

UPDATE storage.buckets
SET
  file_size_limit = 52428800,
  allowed_mime_types = NULL
WHERE id = 'product-files';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('product-files', 'product-files', true, 52428800, NULL)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = NULL;
