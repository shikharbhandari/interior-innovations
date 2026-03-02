-- ============================================================================
-- PRODUCTION DATABASE BACKUP
-- ============================================================================
-- Run this in your PRODUCTION database BEFORE running any migrations
-- This creates a backup schema with all your current data
-- ============================================================================

-- Create backup schema with timestamp
CREATE SCHEMA IF NOT EXISTS backup_before_migration;

-- ============================================================================
-- Backup all existing tables
-- ============================================================================

-- Backup clients
DROP TABLE IF EXISTS backup_before_migration.clients CASCADE;
CREATE TABLE backup_before_migration.clients AS SELECT * FROM public.clients;

-- Backup vendors
DROP TABLE IF EXISTS backup_before_migration.vendors CASCADE;
CREATE TABLE backup_before_migration.vendors AS SELECT * FROM public.vendors;

-- Backup labors
DROP TABLE IF EXISTS backup_before_migration.labors CASCADE;
CREATE TABLE backup_before_migration.labors AS SELECT * FROM public.labors;

-- Backup tasks
DROP TABLE IF EXISTS backup_before_migration.tasks CASCADE;
CREATE TABLE backup_before_migration.tasks AS SELECT * FROM public.tasks;

-- Backup contracts
DROP TABLE IF EXISTS backup_before_migration.contracts CASCADE;
CREATE TABLE backup_before_migration.contracts AS SELECT * FROM public.contracts;

-- Backup payments
DROP TABLE IF EXISTS backup_before_migration.payments CASCADE;
CREATE TABLE backup_before_migration.payments AS SELECT * FROM public.payments;

-- Backup documents
DROP TABLE IF EXISTS backup_before_migration.documents CASCADE;
CREATE TABLE backup_before_migration.documents AS SELECT * FROM public.documents;

-- ============================================================================
-- Verify backup
-- ============================================================================

SELECT
  'Backup verification - Row counts should match production:' as info;

SELECT
  'clients' as table_name,
  (SELECT COUNT(*) FROM public.clients) as production_count,
  (SELECT COUNT(*) FROM backup_before_migration.clients) as backup_count,
  CASE
    WHEN (SELECT COUNT(*) FROM public.clients) = (SELECT COUNT(*) FROM backup_before_migration.clients)
    THEN '✅ Match'
    ELSE '❌ Mismatch'
  END as status
UNION ALL
SELECT
  'vendors',
  (SELECT COUNT(*) FROM public.vendors),
  (SELECT COUNT(*) FROM backup_before_migration.vendors),
  CASE
    WHEN (SELECT COUNT(*) FROM public.vendors) = (SELECT COUNT(*) FROM backup_before_migration.vendors)
    THEN '✅ Match'
    ELSE '❌ Mismatch'
  END
UNION ALL
SELECT
  'labors',
  (SELECT COUNT(*) FROM public.labors),
  (SELECT COUNT(*) FROM backup_before_migration.labors),
  CASE
    WHEN (SELECT COUNT(*) FROM public.labors) = (SELECT COUNT(*) FROM backup_before_migration.labors)
    THEN '✅ Match'
    ELSE '❌ Mismatch'
  END
UNION ALL
SELECT
  'tasks',
  (SELECT COUNT(*) FROM public.tasks),
  (SELECT COUNT(*) FROM backup_before_migration.tasks),
  CASE
    WHEN (SELECT COUNT(*) FROM public.tasks) = (SELECT COUNT(*) FROM backup_before_migration.tasks)
    THEN '✅ Match'
    ELSE '❌ Mismatch'
  END
UNION ALL
SELECT
  'contracts',
  (SELECT COUNT(*) FROM public.contracts),
  (SELECT COUNT(*) FROM backup_before_migration.contracts),
  CASE
    WHEN (SELECT COUNT(*) FROM public.contracts) = (SELECT COUNT(*) FROM backup_before_migration.contracts)
    THEN '✅ Match'
    ELSE '❌ Mismatch'
  END
UNION ALL
SELECT
  'payments',
  (SELECT COUNT(*) FROM public.payments),
  (SELECT COUNT(*) FROM backup_before_migration.payments),
  CASE
    WHEN (SELECT COUNT(*) FROM public.payments) = (SELECT COUNT(*) FROM backup_before_migration.payments)
    THEN '✅ Match'
    ELSE '❌ Mismatch'
  END
UNION ALL
SELECT
  'documents',
  (SELECT COUNT(*) FROM public.documents),
  (SELECT COUNT(*) FROM backup_before_migration.documents),
  CASE
    WHEN (SELECT COUNT(*) FROM public.documents) = (SELECT COUNT(*) FROM backup_before_migration.documents)
    THEN '✅ Match'
    ELSE '❌ Mismatch'
  END;

-- ============================================================================
-- Backup complete
-- ============================================================================

DO $$
DECLARE
  total_rows INTEGER := 0;
BEGIN
  SELECT
    (SELECT COUNT(*) FROM backup_before_migration.clients) +
    (SELECT COUNT(*) FROM backup_before_migration.vendors) +
    (SELECT COUNT(*) FROM backup_before_migration.labors) +
    (SELECT COUNT(*) FROM backup_before_migration.tasks) +
    (SELECT COUNT(*) FROM backup_before_migration.contracts) +
    (SELECT COUNT(*) FROM backup_before_migration.payments) +
    (SELECT COUNT(*) FROM backup_before_migration.documents)
  INTO total_rows;

  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'BACKUP CREATED SUCCESSFULLY';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Backup schema: backup_before_migration';
  RAISE NOTICE 'Total rows backed up: %', total_rows;
  RAISE NOTICE '';
  RAISE NOTICE 'Backed up tables:';
  RAISE NOTICE '  - clients: % rows', (SELECT COUNT(*) FROM backup_before_migration.clients);
  RAISE NOTICE '  - vendors: % rows', (SELECT COUNT(*) FROM backup_before_migration.vendors);
  RAISE NOTICE '  - labors: % rows', (SELECT COUNT(*) FROM backup_before_migration.labors);
  RAISE NOTICE '  - tasks: % rows', (SELECT COUNT(*) FROM backup_before_migration.tasks);
  RAISE NOTICE '  - contracts: % rows', (SELECT COUNT(*) FROM backup_before_migration.contracts);
  RAISE NOTICE '  - payments: % rows', (SELECT COUNT(*) FROM backup_before_migration.payments);
  RAISE NOTICE '  - documents: % rows', (SELECT COUNT(*) FROM backup_before_migration.documents);
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'You can now safely run the migration.';
  RAISE NOTICE '';
END $$;

-- ============================================================================
-- TO RESTORE FROM BACKUP (if needed):
-- ============================================================================
-- Run these commands in order:

-- 1. Stop the application to prevent writes

-- 2. Truncate current tables (WARNING: This deletes current data!)
-- TRUNCATE public.clients, public.vendors, public.labors, public.tasks,
--          public.contracts, public.payments, public.documents CASCADE;

-- 3. Restore from backup
-- INSERT INTO public.clients SELECT * FROM backup_before_migration.clients;
-- INSERT INTO public.vendors SELECT * FROM backup_before_migration.vendors;
-- INSERT INTO public.labors SELECT * FROM backup_before_migration.labors;
-- INSERT INTO public.tasks SELECT * FROM backup_before_migration.tasks;
-- INSERT INTO public.contracts SELECT * FROM backup_before_migration.contracts;
-- INSERT INTO public.payments SELECT * FROM backup_before_migration.payments;
-- INSERT INTO public.documents SELECT * FROM backup_before_migration.documents;

-- 4. Restart the application

-- ============================================================================
-- TO DELETE BACKUP (after successful migration):
-- ============================================================================
-- DROP SCHEMA backup_before_migration CASCADE;

-- ============================================================================
