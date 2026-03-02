-- ============================================================================
-- Financial Ledger Migration
-- Run this in your Supabase SQL editor
--
-- What this does:
--   1. Creates client_line_items table (vendor/labour/fee entries per client)
--   2. Creates line_item_payments table (payments against each line item)
--   3. Migrates existing contracts → client_line_items (marked as legacy)
--   4. Migrates existing contract payments → line_item_payments
--   5. Migrates client.contract_amount → fee line items (Designer Fee)
--   6. Sets up RLS policies
-- ============================================================================

-- ============================================================================
-- STEP 1: Create client_line_items table
-- ============================================================================

CREATE TABLE IF NOT EXISTS client_line_items (
  id SERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- type: 'vendor' | 'labor' | 'fee'
  type TEXT NOT NULL DEFAULT 'vendor',

  -- name: free-text display name; used when vendor/labour is not linked to an existing record
  -- If vendor_id/labor_id is set, the linked record's name takes precedence in the UI
  name TEXT,

  vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
  labor_id INTEGER REFERENCES labors(id) ON DELETE SET NULL,
  description TEXT,

  -- BM: what we charge the client for this work / fee amount
  billing_amount DECIMAL(12, 2),

  -- AM: what we actually pay the vendor/labour (null for fee type)
  actual_amount DECIMAL(12, 2),

  -- Only used for legacy records migrated from contracts (where BM/AM are unknown)
  commission_amount DECIMAL(12, 2),

  -- true = migrated from old contracts system; BM/AM may be null
  is_legacy BOOLEAN NOT NULL DEFAULT FALSE,

  -- Temporary reference to original contract (used for payment migration below)
  legacy_contract_id INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES user_profiles(id),
  updated_by UUID REFERENCES user_profiles(id),

  CONSTRAINT chk_vendor_or_labor CHECK (
    NOT (vendor_id IS NOT NULL AND labor_id IS NOT NULL)
  ),
  CONSTRAINT chk_type CHECK (
    type IN ('vendor', 'labor', 'fee')
  )
);

CREATE INDEX IF NOT EXISTS idx_client_line_items_client_id ON client_line_items(client_id);
CREATE INDEX IF NOT EXISTS idx_client_line_items_organization_id ON client_line_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_client_line_items_vendor_id ON client_line_items(vendor_id);
CREATE INDEX IF NOT EXISTS idx_client_line_items_labor_id ON client_line_items(labor_id);

-- ============================================================================
-- STEP 2: Create line_item_payments table
-- All line item types (vendor, labor, fee) use this for payment tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS line_item_payments (
  id SERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  line_item_id INTEGER NOT NULL REFERENCES client_line_items(id) ON DELETE CASCADE,
  amount DECIMAL(12, 2) NOT NULL,
  date DATE NOT NULL,
  description TEXT,

  -- is_proxy: marks a proxy payment that settles the BM - AM commission gap
  -- Only relevant for vendor/labor line items
  is_proxy BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES user_profiles(id),
  updated_by UUID REFERENCES user_profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_line_item_payments_line_item_id ON line_item_payments(line_item_id);
CREATE INDEX IF NOT EXISTS idx_line_item_payments_organization_id ON line_item_payments(organization_id);

-- ============================================================================
-- STEP 3: Migrate existing contracts → client_line_items (legacy records)
-- Sets type based on whether vendor_id or labor_id is set
-- ============================================================================

INSERT INTO client_line_items (
  organization_id,
  client_id,
  type,
  vendor_id,
  labor_id,
  description,
  commission_amount,
  is_legacy,
  legacy_contract_id,
  created_at,
  created_by
)
SELECT
  c.organization_id,
  c.client_id,
  CASE
    WHEN c.vendor_id IS NOT NULL THEN 'vendor'
    ELSE 'labor'
  END,
  c.vendor_id,
  c.labor_id,
  c.title || CASE
    WHEN c.description IS NOT NULL AND c.description != '' THEN ': ' || c.description
    ELSE ''
  END,
  c.commission_amount,
  true,
  c.id,
  c.created_at,
  c.created_by
FROM contracts c;

-- ============================================================================
-- STEP 4: Migrate existing contract payments → line_item_payments
-- Only migrates vendor/labour payments (not client payments)
-- ============================================================================

INSERT INTO line_item_payments (
  organization_id,
  line_item_id,
  amount,
  date,
  description,
  is_proxy,
  created_at,
  created_by
)
SELECT
  p.organization_id,
  cli.id,
  p.amount,
  p.date::date,
  p.description,
  false,
  p.created_at,
  p.created_by
FROM payments p
JOIN client_line_items cli ON cli.legacy_contract_id = p.contract_id
WHERE p.type != 'client'
  AND p.contract_id IS NOT NULL;

-- ============================================================================
-- STEP 5: Migrate client.contract_amount → Designer Fee line items
-- Creates a fee-type line item for each client that has a contract_amount set
-- ============================================================================

INSERT INTO client_line_items (
  organization_id,
  client_id,
  type,
  description,
  billing_amount,
  is_legacy,
  created_at
)
SELECT
  c.organization_id,
  c.id,
  'fee',
  'Designer Fee',
  c.contract_amount,
  false,
  c.created_at
FROM clients c
WHERE c.contract_amount IS NOT NULL
  AND c.contract_amount > 0;

-- ============================================================================
-- STEP 5b: Migrate existing client payments → line_item_payments against Designer Fee
-- Client payments are now tracked as payments against the Designer Fee line item,
-- not as a separate entity. Only migrates for clients that have a Designer Fee.
-- ============================================================================

INSERT INTO line_item_payments (
  organization_id,
  line_item_id,
  amount,
  date,
  description,
  is_proxy,
  created_at,
  created_by
)
SELECT
  p.organization_id,
  cli.id,
  p.amount,
  p.date::date,
  p.description,
  false,
  p.created_at,
  p.created_by
FROM payments p
JOIN client_line_items cli
  ON cli.client_id = p.client_id
  AND cli.type = 'fee'
  AND cli.description = 'Designer Fee'
WHERE p.type = 'client'
  AND p.client_id IS NOT NULL;

-- ============================================================================
-- STEP 6: Enable Row Level Security
-- ============================================================================

ALTER TABLE client_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_item_payments ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- STEP 7: RLS Policies for client_line_items
-- ============================================================================

CREATE POLICY "Members can view client line items in their org"
  ON client_line_items FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Members can insert client line items in their org"
  ON client_line_items FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
        AND role IN ('admin', 'manager', 'user')
    )
  );

CREATE POLICY "Members can update client line items in their org"
  ON client_line_items FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
        AND role IN ('admin', 'manager', 'user')
    )
  );

CREATE POLICY "Admins and managers can delete client line items"
  ON client_line_items FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
        AND role IN ('admin', 'manager')
    )
  );

-- ============================================================================
-- STEP 8: RLS Policies for line_item_payments
-- ============================================================================

CREATE POLICY "Members can view line item payments in their org"
  ON line_item_payments FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Members can insert line item payments in their org"
  ON line_item_payments FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
        AND role IN ('admin', 'manager', 'user')
    )
  );

CREATE POLICY "Members can update line item payments in their org"
  ON line_item_payments FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
        AND role IN ('admin', 'manager', 'user')
    )
  );

CREATE POLICY "Admins and managers can delete line item payments"
  ON line_item_payments FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
        AND role IN ('admin', 'manager')
    )
  );

-- ============================================================================
-- VERIFICATION QUERIES (uncomment to run after migration)
-- ============================================================================

-- Check migrated line items
-- SELECT type, is_legacy, COUNT(*) FROM client_line_items GROUP BY type, is_legacy;

-- Check designer fee items created
-- SELECT c.name, cli.description, cli.billing_amount
-- FROM client_line_items cli JOIN clients c ON c.id = cli.client_id
-- WHERE cli.type = 'fee' AND cli.description = 'Designer Fee';

-- Check migrated payments
-- SELECT COUNT(*) as migrated FROM line_item_payments;
-- SELECT COUNT(*) as original FROM payments WHERE type != 'client' AND contract_id IS NOT NULL;
