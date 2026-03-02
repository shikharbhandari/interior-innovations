-- Migration: Designer Fees & Payments
-- Run this in your Supabase SQL editor

-- ── 1. designer_fees table ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS designer_fees (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  description TEXT NOT NULL DEFAULT 'Designer Fee',
  billing_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  is_legacy BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE designer_fees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_manage_designer_fees" ON designer_fees
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- ── 2. designer_fee_payments table ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS designer_fee_payments (
  id SERIAL PRIMARY KEY,
  designer_fee_id INTEGER NOT NULL REFERENCES designer_fees(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  date DATE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE designer_fee_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_manage_designer_fee_payments" ON designer_fee_payments
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- ── 3. Migrate existing "Designer Fee" line items ─────────────────────────────

-- Step A: Copy matching line items into designer_fees
INSERT INTO designer_fees (client_id, organization_id, description, billing_amount, is_legacy, created_at, created_by)
SELECT client_id, organization_id, description, billing_amount, is_legacy, created_at, created_by
FROM client_line_items
WHERE type = 'fee'
  AND LOWER(description) LIKE '%designer fee%';

-- Step B: Copy their payments into designer_fee_payments
INSERT INTO designer_fee_payments (designer_fee_id, organization_id, amount, date, description, created_at, created_by)
SELECT
  df.id,
  lip.organization_id,
  lip.amount,
  lip.date::DATE,
  lip.description,
  lip.created_at,
  lip.created_by
FROM line_item_payments lip
JOIN client_line_items cli ON lip.line_item_id = cli.id
JOIN designer_fees df
  ON df.client_id = cli.client_id
  AND df.organization_id = cli.organization_id
  AND LOWER(df.description) LIKE '%designer fee%'
WHERE cli.type = 'fee'
  AND LOWER(cli.description) LIKE '%designer fee%';

-- Step C: Delete migrated line_item_payments
DELETE FROM line_item_payments
WHERE line_item_id IN (
  SELECT id FROM client_line_items
  WHERE type = 'fee' AND LOWER(description) LIKE '%designer fee%'
);

-- Step D: Delete migrated line items
DELETE FROM client_line_items
WHERE type = 'fee'
  AND LOWER(description) LIKE '%designer fee%';
