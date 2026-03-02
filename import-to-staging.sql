-- ============================================================================
-- IMPORT DATA TO STAGING (Run in STAGING after exporting from production)
-- ============================================================================
-- Method: Use Supabase Table Editor to import CSVs
-- This is the EASIEST and most reliable method
-- ============================================================================

-- OR if you have raw data, you can insert manually below:

-- ============================================================================
-- Example: Manual INSERT (if you have just a few rows)
-- ============================================================================

-- Clients example:
-- INSERT INTO clients (id, name, email, phone, address, contract_amount, notes, status, created_at, updated_at)
-- VALUES
--   (1, 'Client Name', 'email@example.com', '1234567890', 'Address', 10000.00, 'Notes', 'active', NOW(), NOW());

-- Vendors example:
-- INSERT INTO vendors (id, name, email, phone, category, notes, status, created_at, updated_at)
-- VALUES
--   (1, 'Vendor Name', 'email@example.com', '1234567890', 'Category', 'Notes', 'active', NOW(), NOW());

-- Labors example:
-- INSERT INTO labors (id, name, phone, specialization, notes, status, created_at, updated_at)
-- VALUES
--   (1, 'Labor Name', '1234567890', 'Specialization', 'Notes', 'active', NOW(), NOW());

-- Tasks example:
-- INSERT INTO tasks (id, title, description, status, due_date, client_id, created_at, updated_at)
-- VALUES
--   (1, 'Task Title', 'Description', 'Not Started', NOW(), 1, NOW(), NOW());

-- Contracts example:
-- INSERT INTO contracts (id, client_id, vendor_id, labor_id, title, description, contract_amount, commission_percentage, commission_amount, status, start_date, end_date, created_at, updated_at)
-- VALUES
--   (1, 1, 1, NULL, 'Contract Title', 'Description', 10000.00, 10.00, 1000.00, 'active', NOW(), NULL, NOW(), NOW());

-- Payments example:
-- INSERT INTO payments (id, amount, date, type, contract_id, client_id, description, created_at, updated_at)
-- VALUES
--   (1, 1000.00, NOW(), 'client', 1, 1, 'Payment description', NOW(), NOW());

-- Documents example:
-- INSERT INTO documents (id, name, category, file_path, uploaded_at, updated_at)
-- VALUES
--   (1, 'Document Name', 'Category', '/path/to/file', NOW(), NOW());

-- ============================================================================
-- Reset sequences after import
-- ============================================================================
SELECT setval('clients_id_seq', (SELECT MAX(id) FROM clients) + 1, false);
SELECT setval('vendors_id_seq', (SELECT MAX(id) FROM vendors) + 1, false);
SELECT setval('labors_id_seq', (SELECT MAX(id) FROM labors) + 1, false);
SELECT setval('tasks_id_seq', (SELECT MAX(id) FROM tasks) + 1, false);
SELECT setval('contracts_id_seq', (SELECT MAX(id) FROM contracts) + 1, false);
SELECT setval('payments_id_seq', (SELECT MAX(id) FROM payments) + 1, false);
SELECT setval('documents_id_seq', (SELECT MAX(id) FROM documents) + 1, false);

-- ============================================================================
-- Verify import
-- ============================================================================
SELECT
  'Verification' as info,
  'clients: ' || (SELECT COUNT(*) FROM clients) ||
  ', vendors: ' || (SELECT COUNT(*) FROM vendors) ||
  ', labors: ' || (SELECT COUNT(*) FROM labors) ||
  ', tasks: ' || (SELECT COUNT(*) FROM tasks) ||
  ', contracts: ' || (SELECT COUNT(*) FROM contracts) ||
  ', payments: ' || (SELECT COUNT(*) FROM payments) ||
  ', documents: ' || (SELECT COUNT(*) FROM documents) as counts;
