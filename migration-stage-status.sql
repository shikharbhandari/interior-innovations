-- Migration: Add status column to project_stages
-- Run this in your Supabase SQL editor

ALTER TABLE project_stages
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'not_started';

-- Valid values: 'not_started' | 'started' | 'in_progress' | 'completed'
-- When status = 'completed', is_completed is also set to true by the app layer.
