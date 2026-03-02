# Production Deployment Guide
## Interior Innovations Management — Supabase Migration Plan

> **STATUS: Pre-flight review only. No changes have been applied.**
> Run the verification queries first to confirm what is already live in production.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      ORGANIZATIONS                              │
│  id (UUID PK) · name · slug · brand_color · status             │
└────────┬────────────────────────────────────────────────────────┘
         │ organization_id (all tenant tables carry this FK)
         │
   ┌─────┴──────────────────────────────────────────────────┐
   │              MULTI-USER / AUTH LAYER                    │
   │                                                         │
   │  user_profiles          organization_members            │
   │  ─────────────          ─────────────────────           │
   │  id (UUID, = auth.uid)  organization_id → orgs          │
   │  email                  user_id → user_profiles         │
   │  full_name              role (owner/admin/member)        │
   │  avatar_url             status (active/inactive)         │
   │                                                         │
   │  organization_invitations                               │
   │  ─────────────────────────                              │
   │  token · email · role · expires_at · status             │
   └─────────────────────────────────────────────────────────┘
         │
   ┌─────┴──────────────────────────────────────────────────┐
   │                   CORE ENTITIES                         │
   │                                                         │
   │  clients ────────────────────────────────────────────   │
   │  id (int) · name · email · phone · address · status     │
   │  contract_amount · notes                                │
   │  estimated_start_date · estimated_end_date  ← new       │
   │                                                         │
   │  vendors                    labors                      │
   │  ─────────                  ──────                      │
   │  id · name · email          id · name · phone           │
   │  phone · category · status  specialization · status     │
   │                                                         │
   │  tasks                      documents                   │
   │  ─────                      ─────────                   │
   │  client_id (FK) · title     client_id (FK) · name       │
   │  status · due_date          category · file_path        │
   │  assigned_to (user FK)                                  │
   └─────────────────────────────────────────────────────────┘
         │
   ┌─────┴──────────────────────────────────────────────────┐
   │                FINANCIAL LAYER                          │
   │                                                         │
   │  contracts                                              │
   │  ─────────                                              │
   │  client_id · vendor_id | labor_id                       │
   │  contract_amount · commission_%  · commission_amount    │
   │  (Legacy data kept for reference)                       │
   │                                                         │
   │  payments  (client receipts & contract payments)        │
   │  ────────                                               │
   │  type: 'client' | 'contract'                            │
   │  client_id · contract_id · amount · date                │
   │                                                         │
   │  client_line_items  (BM billing ledger)                 │
   │  ─────────────────                                      │
   │  client_id · type: 'vendor'|'labor'|'fee'               │
   │  billing_amount (charged to client)                     │
   │  actual_amount  (paid to vendor/labour)                 │
   │  is_legacy · legacy_contract_id                         │
   │       │                                                 │
   │       └──▶ line_item_payments                           │
   │            ────────────────                             │
   │            line_item_id · amount · date                 │
   │            is_proxy                                     │
   │                                                         │
   │  designer_fees  ← new table                             │
   │  ─────────────                                          │
   │  client_id · description · billing_amount               │
   │  is_legacy                                              │
   │       │                                                 │
   │       └──▶ designer_fee_payments  ← new table           │
   │            ──────────────────────                       │
   │            designer_fee_id · amount · date              │
   └─────────────────────────────────────────────────────────┘
         │
   ┌─────┴──────────────────────────────────────────────────┐
   │             PROJECT STAGES LAYER  ← new                 │
   │                                                         │
   │  organization_project_stages  (templates)               │
   │  ────────────────────────────                           │
   │  name · display_order · fee_percentage · color          │
   │                                                         │
   │  project_stages  (per-client instances)                 │
   │  ──────────────                                         │
   │  client_id · name · display_order · fee_percentage      │
   │  target_date · status · is_completed · completed_at     │
   │  status: 'not_started'|'in_progress'|'completed'  ← new │
   └─────────────────────────────────────────────────────────┘
         │
   ┌─────┴──────────────────────────────────────────────────┐
   │                  LEADS LAYER  ← new                     │
   │                                                         │
   │  lead_stages        lead_sources                        │
   │  ───────────        ────────────                        │
   │  name · color       name                                │
   │  sort_order         (per org)                           │
   │  is_won · is_lost                                       │
   │                                                         │
   │  leads                                                  │
   │  ─────                                                  │
   │  name · email · phone · stage_id · source_id            │
   │  assigned_to · estimated_value                          │
   │  converted_client_id (when lead → client)               │
   │       │                                                 │
   │       └──▶ lead_activities                              │
   │            ───────────────                              │
   │            type · summary · notes · logged_at           │
   └─────────────────────────────────────────────────────────┘
```

---

## Financial Calculations Reference

All financial logic is derived from data in Supabase. No server-side calculations.

```
CLIENT FINANCES (Finance Hub / client-financials.tsx)
─────────────────────────────────────────────────────

Total Received      = SUM(payments WHERE client_id = X AND type = 'client')

BM Billed           = SUM(client_line_items.billing_amount WHERE client_id = X
                          AND is_legacy = false)

Designer Fees       = SUM(designer_fees.billing_amount WHERE client_id = X)

Designer Fees Paid  = SUM(designer_fee_payments.amount
                          JOIN designer_fees WHERE client_id = X)

Client Balance      = Total Received - BM Billed - Designer Fees Paid
                      (negative = client still owes money)

─────────────────────────────────────────────────────
CLIENTS LIST TILES (clients.tsx)
─────────────────────────────────────────────────────

Total Receivable    = SUM(BM Billed + Designer Fees) across filtered clients

Total Outstanding   = SUM(MAX(0, totalOwed - totalReceived)) across filtered clients
                      [uses full designer fee billed, not paid — intentional]

─────────────────────────────────────────────────────
PROJECT STAGES (client-details.tsx)
─────────────────────────────────────────────────────

Paid %              = (Designer Fees Paid / Total Designer Fees) × 100

Stage "Covered"     = cumulative fee_percentage up to and including stage ≤ Paid %

Stage Pending Amt   = stage.fee_percentage / 100 × totalDesignerFee
                      (for pending stages; prorated for partial)
```

---

## Migration Files — Run Order & Safety

Run these **in order** in the Supabase SQL editor. Each section has a verification query to confirm whether it has already been applied.

---

### Step 1 — `migration-multi-user.sql`

**Purpose:** Creates org/user tables; migrates all existing data to the default organization.

**Check if already applied:**
```sql
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'organizations'
) AS orgs_table_exists,
(SELECT COUNT(*) FROM organizations) AS org_count;
```
→ If `orgs_table_exists = true` and `org_count > 0`, **SKIP this migration.**

**Risk:** Contains `CREATE TABLE IF NOT EXISTS` for all DDL — safe to run again. However, the INSERT that migrates existing data to a specific email address should only run once.

---

### Step 2 — `migration-project-stages.sql`

**Purpose:** Creates `organization_project_stages` and `project_stages` tables; adds `estimated_start_date` / `estimated_end_date` to `clients`.

**Check if already applied:**
```sql
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables WHERE table_name = 'project_stages'
) AS stages_table_exists,
EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'clients' AND column_name = 'estimated_start_date'
) AS start_date_col_exists;
```
→ If both `true`, **SKIP this migration.**

**Risk:** All DDL uses `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`. Safe to re-run.

---

### Step 3 — `migration-financial-ledger.sql`

**Purpose:** Creates `client_line_items` and `line_item_payments`; migrates data from old `contracts` + `payments` tables; deletes migrated source records.

**Check if already applied:**
```sql
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables WHERE table_name = 'client_line_items'
) AS ledger_exists,
(SELECT COUNT(*) FROM client_line_items) AS line_item_count;
```
→ If `ledger_exists = true` and `line_item_count > 0`, **SKIP this migration.**

**Risk:** ⚠️ Steps C/D delete from `contracts` / `payments`. Not idempotent — re-running will attempt to delete already-deleted records (harmless) but the INSERT steps may create duplicates if the table exists but was partially applied. Verify count before running.

---

### Step 4 — `migration-designer-fees.sql`

**Purpose:** Creates `designer_fees` and `designer_fee_payments` tables; migrates existing "Designer Fee" line items from `client_line_items` into the new tables; deletes migrated source records.

**Check if already applied:**
```sql
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables WHERE table_name = 'designer_fees'
) AS df_table_exists,
(SELECT COUNT(*) FROM designer_fees) AS designer_fee_count,
(SELECT COUNT(*) FROM client_line_items WHERE type = 'fee' AND LOWER(description) LIKE '%designer fee%') AS legacy_fee_count;
```

→ **Interpretation:**
- `df_table_exists = true` AND `designer_fee_count > 0` AND `legacy_fee_count = 0` → **SKIP** (already migrated)
- `df_table_exists = false` → Safe to run full migration
- `df_table_exists = true` AND `designer_fee_count = 0` AND `legacy_fee_count > 0` → Run only Steps A-D (data migration), skip CREATE TABLE

**Risk:** ⚠️ NOT idempotent. Steps A-D insert from `client_line_items` then delete those records. Running twice will create duplicate `designer_fees` rows from any remaining source data.

---

### Step 5 — `migration-stage-status.sql`

**Purpose:** Adds `status TEXT DEFAULT 'not_started'` column to `project_stages`.

**Check if already applied:**
```sql
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'project_stages' AND column_name = 'status'
) AS status_col_exists;
```
→ If `true`, **SKIP this migration.**

**Risk:** `ADD COLUMN IF NOT EXISTS` — completely safe to re-run.

---

### Step 6 — `migration-leads.sql`

**Purpose:** Creates `lead_stages`, `lead_sources`, `leads`, `lead_activities` tables; seeds default stage names per organization.

**Check if already applied:**
```sql
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables WHERE table_name = 'leads'
) AS leads_table_exists,
(SELECT COUNT(*) FROM lead_stages) AS stage_count;
```
→ If `leads_table_exists = true`, **SKIP this migration.**

**Risk:** All DDL uses `CREATE TABLE IF NOT EXISTS`; seed data uses `ON CONFLICT DO NOTHING`. Safe to re-run.

---

### Step 7 — `migration-super-admin.sql`

**Purpose:** Adds `is_super_admin` flag to `user_profiles`; grants it to the owner email.

**Check if already applied:**
```sql
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'user_profiles' AND column_name = 'is_super_admin'
) AS super_admin_col_exists;
```
→ If `true`, **SKIP this migration.**

**Risk:** `ADD COLUMN IF NOT EXISTS` — safe to re-run.

---

### Step 8 — `add-organization-branding.sql`

**Purpose:** Adds `brand_color` to `organizations`.

**Check if already applied:**
```sql
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'organizations' AND column_name = 'brand_color'
) AS brand_color_exists;
```
→ If `true`, **SKIP this migration.**

**Risk:** `ADD COLUMN IF NOT EXISTS` — safe to re-run.

---

### Step 9 — `fix-sequences.sql` (conditional)

**Purpose:** Resets SERIAL sequences to `MAX(id) + 1` so new inserts don't collide.

**When to run:** Only if you imported data externally (e.g., `import-to-staging.sql`). If all data was created through the application, sequences are already correct.

**Check:**
```sql
SELECT
  last_value AS current_seq,
  (SELECT MAX(id) FROM clients) AS max_client_id,
  (SELECT MAX(id) FROM vendors) AS max_vendor_id,
  (SELECT MAX(id) FROM labors) AS max_labor_id
FROM pg_sequences WHERE sequencename = 'clients_id_seq';
```
→ If `current_seq < max_client_id`, run the fix.

---

## Complete Pre-Flight Verification Script

Run this single block before doing anything in production to get a full status report:

```sql
-- ── Pre-flight: Interior Innovations Production Check ──────────────────────

SELECT 'organizations'        AS check_name, EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='organizations') AS exists
UNION ALL
SELECT 'user_profiles',        EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='user_profiles')
UNION ALL
SELECT 'organization_members', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='organization_members')
UNION ALL
SELECT 'client_line_items',    EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='client_line_items')
UNION ALL
SELECT 'line_item_payments',   EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='line_item_payments')
UNION ALL
SELECT 'designer_fees',        EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='designer_fees')
UNION ALL
SELECT 'designer_fee_payments',EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='designer_fee_payments')
UNION ALL
SELECT 'project_stages',       EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='project_stages')
UNION ALL
SELECT 'organization_project_stages', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='organization_project_stages')
UNION ALL
SELECT 'leads',                EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='leads')
UNION ALL
SELECT 'lead_stages',          EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='lead_stages');

-- ── Column checks ──────────────────────────────────────────────────────────

SELECT table_name, column_name,
       CASE WHEN column_name IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END AS status
FROM information_schema.columns
WHERE (table_name = 'clients'        AND column_name IN ('estimated_start_date','estimated_end_date'))
   OR (table_name = 'project_stages' AND column_name = 'status')
   OR (table_name = 'user_profiles'  AND column_name = 'is_super_admin')
   OR (table_name = 'organizations'  AND column_name = 'brand_color')
ORDER BY table_name, column_name;

-- ── Data counts ────────────────────────────────────────────────────────────

SELECT
  (SELECT COUNT(*) FROM organizations)         AS org_count,
  (SELECT COUNT(*) FROM clients)               AS client_count,
  (SELECT COUNT(*) FROM client_line_items)     AS line_item_count,
  (SELECT COUNT(*) FROM designer_fees)         AS designer_fee_count,
  (SELECT COUNT(*) FROM designer_fee_payments) AS df_payment_count,
  (SELECT COUNT(*) FROM project_stages)        AS project_stage_count,
  (SELECT COUNT(*) FROM leads)                 AS lead_count;

-- ── Risk check: are there still Designer Fee line items to migrate? ─────────

SELECT COUNT(*) AS unmigrated_designer_fee_line_items
FROM client_line_items
WHERE type = 'fee' AND LOWER(description) LIKE '%designer fee%';
```

---

## Deployment Sequence

```
1. [ ] Run Pre-Flight Verification Script above
2. [ ] Note which tables/columns already exist
3. [ ] Run only the migrations that are NOT yet applied (use checks above)
4. [ ] Verify row counts after each migration match expectations
5. [ ] Deploy frontend code (git push / Vercel / your host)
6. [ ] Smoke test:
       - Log in → Dashboard loads
       - Open a client → Finance Hub shows Designer Fees section
       - Client Details → Project Timeline stages visible with status dropdown
       - Clients list → Designer Fee / Designer Fee Pending / Client Balance columns visible
       - Leads page → Loads without error
       - Dashboard → Earnings Forecast bar chart visible
```

---

## Known Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| `migration-designer-fees.sql` is not idempotent — re-running Steps A-D duplicates rows | High | Check `designer_fees` count + `legacy_fee_count` before running. If designer fees already exist, skip Steps A-D entirely. |
| `migration-financial-ledger.sql` deletes from `contracts`/`payments` | High | Check `client_line_items` count. If > 0, skip the data migration steps; only run DDL if tables don't exist. |
| `staleTime: Infinity` in `queryClient.ts` — all queries cached indefinitely | Low | Mitigated per-query with `refetchOnMount: 'always'` where needed. Known limitation for the rest of the app. |
| Stage derived dates assume `estimated_start_date`/`estimated_end_date` are set | Low | UI shows "No project dates" gracefully when null. |
| `migration-multi-user.sql` hardcodes owner email | Medium | Only run once. Verify the email in the file matches the actual owner account before running. |

---

## Code Changes Summary (This Release)

| File | Change |
|------|--------|
| `src/pages/client-financials.tsx` | Client Balance formula now uses `totalDesignerFeePaid` (not `totalDesignerFee`) |
| `src/pages/client-details.tsx` | Removed "started" status; added derived stage date ranges + overdue badges; `refetchOnMount: 'always'` on 2 queries |
| `src/pages/clients.tsx` | New columns: Designer Fee / Designer Fee Pending / Client Balance; updated filter logic |
| `src/lib/schema.ts` | Removed `'started'` from `insertProjectStageSchema` enum |
| `src/pages/labors.tsx` | Default status filter changed from `"all"` to `"active"` |
| `src/pages/vendors.tsx` | Default status filter changed from `"all"` to `"active"` |
