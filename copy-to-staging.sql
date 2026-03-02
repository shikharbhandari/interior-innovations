-- ============================================================================
-- COPY PRODUCTION DATA TO STAGING
-- ============================================================================
-- Instructions:
-- 1. Run this in PRODUCTION SQL Editor first to see the data
-- 2. Copy the entire output
-- 3. Run it in STAGING SQL Editor to import
-- ============================================================================

-- Disable foreign key checks temporarily
SET session_replication_role = 'replica';

-- ============================================================================
-- STEP 1: Export all clients
-- ============================================================================
SELECT 'Copying ' || COUNT(*) || ' clients...' FROM clients;

SELECT
  'INSERT INTO public.clients (id, name, email, phone, address, contract_amount, notes, status, created_at, updated_at) VALUES (' ||
  id || ', ' ||
  quote_literal(name) || ', ' ||
  quote_literal(email) || ', ' ||
  quote_literal(phone) || ', ' ||
  quote_literal(address) || ', ' ||
  COALESCE(contract_amount::text, 'NULL') || ', ' ||
  COALESCE(quote_literal(notes), 'NULL') || ', ' ||
  quote_literal(status) || ', ' ||
  quote_literal(created_at::text) || ', ' ||
  quote_literal(updated_at::text) ||
  ');'
FROM clients
ORDER BY id;

-- ============================================================================
-- STEP 2: Export all vendors
-- ============================================================================
SELECT 'Copying ' || COUNT(*) || ' vendors...' FROM vendors;

SELECT
  'INSERT INTO public.vendors (id, name, email, phone, category, notes, status, created_at, updated_at) VALUES (' ||
  id || ', ' ||
  quote_literal(name) || ', ' ||
  quote_literal(email) || ', ' ||
  quote_literal(phone) || ', ' ||
  quote_literal(category) || ', ' ||
  COALESCE(quote_literal(notes), 'NULL') || ', ' ||
  quote_literal(status) || ', ' ||
  quote_literal(created_at::text) || ', ' ||
  quote_literal(updated_at::text) ||
  ');'
FROM vendors
ORDER BY id;

-- ============================================================================
-- STEP 3: Export all labors
-- ============================================================================
SELECT 'Copying ' || COUNT(*) || ' labors...' FROM labors;

SELECT
  'INSERT INTO public.labors (id, name, phone, specialization, notes, status, created_at, updated_at) VALUES (' ||
  id || ', ' ||
  quote_literal(name) || ', ' ||
  quote_literal(phone) || ', ' ||
  quote_literal(specialization) || ', ' ||
  COALESCE(quote_literal(notes), 'NULL') || ', ' ||
  quote_literal(status) || ', ' ||
  quote_literal(created_at::text) || ', ' ||
  quote_literal(updated_at::text) ||
  ');'
FROM labors
ORDER BY id;

-- ============================================================================
-- STEP 4: Export all tasks
-- ============================================================================
SELECT 'Copying ' || COUNT(*) || ' tasks...' FROM tasks;

SELECT
  'INSERT INTO public.tasks (id, title, description, status, due_date, client_id, created_at, updated_at) VALUES (' ||
  id || ', ' ||
  quote_literal(title) || ', ' ||
  COALESCE(quote_literal(description), 'NULL') || ', ' ||
  quote_literal(status) || ', ' ||
  quote_literal(due_date::text) || ', ' ||
  COALESCE(client_id::text, 'NULL') || ', ' ||
  quote_literal(created_at::text) || ', ' ||
  quote_literal(updated_at::text) ||
  ');'
FROM tasks
ORDER BY id;

-- ============================================================================
-- STEP 5: Export all contracts
-- ============================================================================
SELECT 'Copying ' || COUNT(*) || ' contracts...' FROM contracts;

SELECT
  'INSERT INTO public.contracts (id, client_id, vendor_id, labor_id, title, description, contract_amount, commission_percentage, commission_amount, status, start_date, end_date, created_at, updated_at) VALUES (' ||
  id || ', ' ||
  client_id || ', ' ||
  COALESCE(vendor_id::text, 'NULL') || ', ' ||
  COALESCE(labor_id::text, 'NULL') || ', ' ||
  quote_literal(title) || ', ' ||
  COALESCE(quote_literal(description), 'NULL') || ', ' ||
  contract_amount || ', ' ||
  commission_percentage || ', ' ||
  commission_amount || ', ' ||
  quote_literal(status) || ', ' ||
  quote_literal(start_date::text) || ', ' ||
  COALESCE(quote_literal(end_date::text), 'NULL') || ', ' ||
  quote_literal(created_at::text) || ', ' ||
  quote_literal(updated_at::text) ||
  ');'
FROM contracts
ORDER BY id;

-- ============================================================================
-- STEP 6: Export all payments
-- ============================================================================
SELECT 'Copying ' || COUNT(*) || ' payments...' FROM payments;

SELECT
  'INSERT INTO public.payments (id, amount, date, type, contract_id, client_id, description, created_at, updated_at) VALUES (' ||
  id || ', ' ||
  amount || ', ' ||
  quote_literal(date::text) || ', ' ||
  quote_literal(type) || ', ' ||
  COALESCE(contract_id::text, 'NULL') || ', ' ||
  COALESCE(client_id::text, 'NULL') || ', ' ||
  COALESCE(quote_literal(description), 'NULL') || ', ' ||
  quote_literal(created_at::text) || ', ' ||
  quote_literal(updated_at::text) ||
  ');'
FROM payments
ORDER BY id;

-- ============================================================================
-- STEP 7: Export all documents
-- ============================================================================
SELECT 'Copying ' || COUNT(*) || ' documents...' FROM documents;

SELECT
  'INSERT INTO public.documents (id, name, category, file_path, uploaded_at, updated_at) VALUES (' ||
  id || ', ' ||
  quote_literal(name) || ', ' ||
  quote_literal(category) || ', ' ||
  quote_literal(file_path) || ', ' ||
  quote_literal(uploaded_at::text) || ', ' ||
  quote_literal(updated_at::text) ||
  ');'
FROM documents
ORDER BY id;

-- ============================================================================
-- STEP 8: Reset sequences to max ID + 1
-- ============================================================================
SELECT 'SELECT setval(''clients_id_seq'', ' || COALESCE(MAX(id), 0) + 1 || ', false);' FROM clients;
SELECT 'SELECT setval(''vendors_id_seq'', ' || COALESCE(MAX(id), 0) + 1 || ', false);' FROM vendors;
SELECT 'SELECT setval(''labors_id_seq'', ' || COALESCE(MAX(id), 0) + 1 || ', false);' FROM labors;
SELECT 'SELECT setval(''tasks_id_seq'', ' || COALESCE(MAX(id), 0) + 1 || ', false);' FROM tasks;
SELECT 'SELECT setval(''contracts_id_seq'', ' || COALESCE(MAX(id), 0) + 1 || ', false);' FROM contracts;
SELECT 'SELECT setval(''payments_id_seq'', ' || COALESCE(MAX(id), 0) + 1 || ', false);' FROM payments;
SELECT 'SELECT setval(''documents_id_seq'', ' || COALESCE(MAX(id), 0) + 1 || ', false);' FROM documents;

-- Re-enable foreign key checks
SELECT 'SET session_replication_role = ''origin'';';

-- ============================================================================
-- Verification queries
-- ============================================================================
SELECT 'SELECT ''Clients: '' || COUNT(*) FROM clients;';
SELECT 'SELECT ''Vendors: '' || COUNT(*) FROM vendors;';
SELECT 'SELECT ''Labors: '' || COUNT(*) FROM labors;';
SELECT 'SELECT ''Tasks: '' || COUNT(*) FROM tasks;';
SELECT 'SELECT ''Contracts: '' || COUNT(*) FROM contracts;';
SELECT 'SELECT ''Payments: '' || COUNT(*) FROM payments;';
SELECT 'SELECT ''Documents: '' || COUNT(*) FROM documents;';

SELECT '✅ Data copy complete! Verify counts above match production.';
