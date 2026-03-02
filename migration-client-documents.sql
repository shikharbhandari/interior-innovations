-- Client Documents Migration
-- Adds client_id, file_size, and description columns to the existing documents table.
-- Run this in the Supabase SQL editor.

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS file_size INTEGER,
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Index for fast per-client queries
CREATE INDEX IF NOT EXISTS idx_documents_client_id ON documents(client_id);

-- Existing RLS policies already allow org members to access documents.
-- The client_id filter is enforced at the application query level.
-- No new RLS policies are needed.
