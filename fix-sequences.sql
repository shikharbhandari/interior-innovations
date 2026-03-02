-- Fix sequence sync issues after data import
-- Run this in STAGING Supabase SQL Editor

-- Check current sequence values and max IDs
SELECT 'payments' as table_name,
       (SELECT MAX(id) FROM payments) as max_id,
       (SELECT last_value FROM payments_id_seq) as sequence_value;

SELECT 'contracts' as table_name,
       (SELECT MAX(id) FROM contracts) as max_id,
       (SELECT last_value FROM contracts_id_seq) as sequence_value;

SELECT 'clients' as table_name,
       (SELECT MAX(id) FROM clients) as max_id,
       (SELECT last_value FROM clients_id_seq) as sequence_value;

-- Reset all sequences to max ID + 1
SELECT setval('payments_id_seq', COALESCE((SELECT MAX(id) FROM payments), 0) + 1, false);
SELECT setval('contracts_id_seq', COALESCE((SELECT MAX(id) FROM contracts), 0) + 1, false);
SELECT setval('clients_id_seq', COALESCE((SELECT MAX(id) FROM clients), 0) + 1, false);
SELECT setval('vendors_id_seq', COALESCE((SELECT MAX(id) FROM vendors), 0) + 1, false);
SELECT setval('labors_id_seq', COALESCE((SELECT MAX(id) FROM labors), 0) + 1, false);
SELECT setval('tasks_id_seq', COALESCE((SELECT MAX(id) FROM tasks), 0) + 1, false);
SELECT setval('documents_id_seq', COALESCE((SELECT MAX(id) FROM documents), 0) + 1, false);

-- Verify the fix
SELECT 'After Reset - payments' as table_name,
       (SELECT MAX(id) FROM payments) as max_id,
       (SELECT last_value FROM payments_id_seq) as sequence_value;
