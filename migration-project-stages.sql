-- Migration: Project Stages & Timeline
-- Run this in your Supabase SQL editor

-- ── 1. Org-level stage templates ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS organization_project_stages (
  id SERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  fee_percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#6b7280',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE organization_project_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_manage_org_stages" ON organization_project_stages
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
    OR is_super_admin()
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
    OR is_super_admin()
  );

-- ── 2. Per-project stage instances ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS project_stages (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  fee_percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
  target_date DATE,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE project_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_manage_project_stages" ON project_stages
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
    OR is_super_admin()
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
    OR is_super_admin()
  );

-- ── 3. Add timeline dates to clients ──────────────────────────────────────────

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS estimated_start_date DATE,
  ADD COLUMN IF NOT EXISTS estimated_end_date DATE;
