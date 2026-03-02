# Quick Reference: Staging Setup & Testing

## 🚀 Quick Steps

### 1. Create Staging Project (5 minutes)

1. Go to https://supabase.com/dashboard
2. Click **"New project"**
3. Name: `Interior Innovations - Staging`
4. Choose same region as production
5. Set strong password
6. Wait for provisioning
7. Save: Project URL & API keys (Settings → API)

---

### 2. Copy Schema to Staging (2 minutes)

1. In **Staging** project, go to SQL Editor
2. Copy entire `/supabase.sql` file from your project
3. Paste into SQL Editor
4. Click **Run**
5. Verify tables created successfully

---

### 3. Copy Data to Staging (5 minutes)

**Option A: Simple Copy (Most Reliable)**

1. Open `/copy-to-staging.sql` file I created
2. In **Production** SQL Editor, paste and run the script
3. Copy the output (all INSERT statements)
4. In **Staging** SQL Editor, paste and run
5. Verify row counts match

**Option B: Using Supabase CLI**

```bash
# Install CLI
npm install -g supabase

# Export from production
supabase db dump --data-only -f production_data.sql --project-ref YOUR_PROD_PROJECT_ID

# Import to staging
supabase db push --project-ref YOUR_STAGING_PROJECT_ID production_data.sql
```

---

### 4. Create Migration User in Staging (2 minutes)

**IMPORTANT**: Before running migrations, you need manisha@designs.com in Staging Auth:

1. In **Staging** project, go to **Authentication** → **Users**
2. Click **"Add user"**
3. Email: `manisha@designs.com`
4. Password: (choose a password)
5. Check **"Auto Confirm User"**
6. Click **"Create user"**

---

### 5. Run Migrations in Staging (5 minutes)

**Migration 1: Multi-User**

1. In **Staging** SQL Editor
2. Open `/migration-multi-user.sql`
3. Paste entire file
4. Click **Run**
5. Verify success message
6. Check new tables exist:
   ```sql
   SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public'
   ORDER BY table_name;
   ```

**Migration 2: Super Admin**

1. In **Staging** SQL Editor
2. Open `/migration-super-admin.sql`
3. Paste entire file
4. Click **Run**
5. Verify super admin created:
   ```sql
   SELECT email, is_super_admin FROM user_profiles;
   ```

---

### 6. Test Frontend with Staging (10 minutes)

**Update Environment:**

1. Create `.env.staging` file:
   ```
   VITE_SUPABASE_URL=https://YOUR-STAGING-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=your-staging-anon-key
   ```

2. Copy to active env:
   ```bash
   cp .env.staging .env.local
   ```

3. Start dev server:
   ```bash
   npm run dev
   ```

**Test Login:**

1. Go to http://localhost:5173
2. Log in as manisha@designs.com
3. Should see:
   - ✅ Dashboard loads
   - ✅ Clients page shows data
   - ✅ "Settings" link in sidebar (you're admin)
   - ✅ "Super Admin" link in sidebar (you're super admin)

**Test Super Admin:**

1. Click "Super Admin" in sidebar
2. Should see:
   - ✅ Platform statistics
   - ✅ Organizations table
   - ✅ "Create Organization" button
3. Try creating a test organization
4. Verify it appears in the list

---

### 7. Verify Everything Works (10 minutes)

**Data Verification:**
```sql
-- In Staging SQL Editor, run:

-- Check organization created
SELECT * FROM organizations;

-- Check you're assigned as admin
SELECT * FROM organization_members;

-- Check all data has organization_id
SELECT
  'clients' as table_name,
  COUNT(*) as total,
  COUNT(organization_id) as with_org_id
FROM clients
UNION ALL
SELECT 'vendors', COUNT(*), COUNT(organization_id) FROM vendors
UNION ALL
SELECT 'labors', COUNT(*), COUNT(organization_id) FROM labors
UNION ALL
SELECT 'tasks', COUNT(*), COUNT(organization_id) FROM tasks
UNION ALL
SELECT 'contracts', COUNT(*), COUNT(organization_id) FROM contracts
UNION ALL
SELECT 'payments', COUNT(*), COUNT(organization_id) FROM payments
UNION ALL
SELECT 'documents', COUNT(*), COUNT(organization_id) FROM documents;

-- total and with_org_id should match for all tables
```

**Frontend Tests:**

- [ ] Can log in
- [ ] Can view all pages (Dashboard, Clients, Vendors, etc.)
- [ ] Can create a new client
- [ ] Can edit a client
- [ ] Can delete a client (as admin)
- [ ] Settings page works
- [ ] Super Admin dashboard works
- [ ] Can create new organization

---

## ✅ Success Criteria

You know staging is ready when:

1. ✅ All production data is in staging
2. ✅ New tables created (organizations, user_profiles, etc.)
3. ✅ All existing records have organization_id
4. ✅ You can log in as manisha@designs.com
5. ✅ You see "Super Admin" link in sidebar
6. ✅ Super Admin dashboard shows statistics
7. ✅ All pages load without errors
8. ✅ Can create/edit/delete records
9. ✅ Permission checks work

---

## ⚠️ Common Issues & Solutions

**Issue: RLS error "row-level security policy"**
- **Cause**: User not assigned to organization
- **Fix**: Check `organization_members` table has entry for user

**Issue: "No organization" message**
- **Cause**: User not in any organization
- **Fix**: Run migration again, or manually add to organization_members

**Issue: Super Admin link not showing**
- **Cause**: is_super_admin flag not set
- **Fix**:
  ```sql
  UPDATE user_profiles SET is_super_admin = TRUE
  WHERE email = 'manisha@designs.com';
  ```

**Issue: Can't see any data**
- **Cause**: organization_id not set on records
- **Fix**: Re-run migration or manually update:
  ```sql
  UPDATE clients SET organization_id = (SELECT id FROM organizations LIMIT 1)
  WHERE organization_id IS NULL;
  ```

**Issue: Cannot create records**
- **Cause**: RLS policies blocking inserts
- **Fix**: Check role is 'admin' or 'user', not 'viewer'

---

## 📊 Quick Verification Queries

Run these in Staging SQL Editor to verify everything:

```sql
-- 1. Check organizations
SELECT * FROM organizations;
-- Should see 1 organization (Interior Innovations)

-- 2. Check your user profile
SELECT * FROM user_profiles WHERE email = 'manisha@designs.com';
-- Should see is_super_admin = TRUE

-- 3. Check your membership
SELECT om.*, o.name, o.slug
FROM organization_members om
JOIN organizations o ON om.organization_id = o.id
WHERE om.user_id = (SELECT id FROM user_profiles WHERE email = 'manisha@designs.com');
-- Should see role = 'admin'

-- 4. Check data migration
SELECT
  'Clients: ' || COUNT(*) as status FROM clients
UNION ALL SELECT 'Vendors: ' || COUNT(*) FROM vendors
UNION ALL SELECT 'Labors: ' || COUNT(*) FROM labors
UNION ALL SELECT 'Tasks: ' || COUNT(*) FROM tasks
UNION ALL SELECT 'Contracts: ' || COUNT(*) FROM contracts
UNION ALL SELECT 'Payments: ' || COUNT(*) FROM payments
UNION ALL SELECT 'Documents: ' || COUNT(*) FROM documents;
-- Counts should match production

-- 5. Check RLS policies
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
-- Should see new organization-scoped policies
```

---

## 🎯 Ready for Production?

Once staging tests pass, you can migrate production with confidence!

**Before migrating production:**

1. [ ] All staging tests passed ✅
2. [ ] Backup taken (see STAGING_TESTING_CHECKLIST.md)
3. [ ] Know how to rollback if needed
4. [ ] Schedule low-traffic time
5. [ ] Have this guide handy

**To migrate production:**

1. Create backup schema in production (from backup guide)
2. Run `migration-multi-user.sql` in production
3. Verify success
4. Run `migration-super-admin.sql` in production
5. Verify super admin access works
6. Deploy updated frontend to production
7. Test thoroughly

**Estimated production migration time:** 10-15 minutes
