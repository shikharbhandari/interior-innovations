-- ============================================================================
-- EXPORT PRODUCTION DATA (Run in PRODUCTION)
-- ============================================================================
-- This will show you all your data in a format you can save
-- Then you'll paste it into staging
-- ============================================================================

-- ============================================================================
-- STEP 1: Check row counts
-- ============================================================================
SELECT
  'Data Summary' as info,
  'clients: ' || (SELECT COUNT(*) FROM clients) ||
  ', vendors: ' || (SELECT COUNT(*) FROM vendors) ||
  ', labors: ' || (SELECT COUNT(*) FROM labors) ||
  ', tasks: ' || (SELECT COUNT(*) FROM tasks) ||
  ', contracts: ' || (SELECT COUNT(*) FROM contracts) ||
  ', payments: ' || (SELECT COUNT(*) FROM payments) ||
  ', documents: ' || (SELECT COUNT(*) FROM documents) as counts;

-- ============================================================================
-- STEP 2: Export Clients
-- ============================================================================
SELECT '-- CLIENTS DATA --' as section;
SELECT * FROM clients ORDER BY id;

-- ============================================================================
-- STEP 3: Export Vendors
-- ============================================================================
SELECT '-- VENDORS DATA --' as section;
SELECT * FROM vendors ORDER BY id;

-- ============================================================================
-- STEP 4: Export Labors
-- ============================================================================
SELECT '-- LABORS DATA --' as section;
SELECT * FROM labors ORDER BY id;

-- ============================================================================
-- STEP 5: Export Tasks
-- ============================================================================
SELECT '-- TASKS DATA --' as section;
SELECT * FROM tasks ORDER BY id;

-- ============================================================================
-- STEP 6: Export Contracts
-- ============================================================================
SELECT '-- CONTRACTS DATA --' as section;
SELECT * FROM contracts ORDER BY id;

-- ============================================================================
-- STEP 7: Export Payments
-- ============================================================================
SELECT '-- PAYMENTS DATA --' as section;
SELECT * FROM payments ORDER BY id;

-- ============================================================================
-- STEP 8: Export Documents
-- ============================================================================
SELECT '-- DOCUMENTS DATA --' as section;
SELECT * FROM documents ORDER BY id;

-- ============================================================================
-- DONE - Save this output
-- ============================================================================
