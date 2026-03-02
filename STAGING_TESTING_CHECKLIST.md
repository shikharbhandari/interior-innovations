# Staging Migration Testing Checklist

## Pre-Migration Checklist

- [ ] Staging Supabase project created
- [ ] Production schema copied to staging
- [ ] Production data copied to staging
- [ ] Verified row counts match between production and staging
- [ ] Saved staging project credentials (URL, anon key, service_role key)

## Migration Test Plan

### Phase 1: Test Multi-User Migration (migration-multi-user.sql)

1. **Before Running Migration**
   - [ ] Take note of current row counts in staging
   - [ ] Verify manisha@designs.com exists in Supabase Auth

2. **Run Migration**
   - [ ] Execute `migration-multi-user.sql` in staging SQL Editor
   - [ ] Check for errors in the output
   - [ ] Verify success messages appear

3. **Verify Database Changes**
   - [ ] New tables created:
     - [ ] `organizations` table exists
     - [ ] `user_profiles` table exists
     - [ ] `organization_members` table exists
     - [ ] `organization_invitations` table exists

   - [ ] Existing tables updated:
     - [ ] `clients` has `organization_id`, `created_by`, `updated_by` columns
     - [ ] `vendors` has `organization_id`, `created_by`, `updated_by` columns
     - [ ] `labors` has `organization_id`, `created_by`, `updated_by` columns
     - [ ] `tasks` has `organization_id`, `created_by`, `updated_by`, `assigned_to` columns
     - [ ] `contracts` has `organization_id`, `created_by`, `updated_by` columns
     - [ ] `payments` has `organization_id`, `created_by`, `updated_by` columns
     - [ ] `documents` has `organization_id`, `created_by`, `updated_by` columns

   - [ ] Data migration successful:
     - [ ] All existing data has organization_id populated
     - [ ] No NULL organization_id values
     - [ ] Row counts unchanged (no data lost)

4. **Test RLS Policies**
   ```sql
   -- Run these queries in staging to test RLS

   -- Should see the migration organization
   SELECT * FROM organizations;

   -- Should see manisha@designs.com
   SELECT * FROM user_profiles;

   -- Should see manisha@designs.com as admin
   SELECT * FROM organization_members;

   -- Should see all clients with organization_id
   SELECT id, name, organization_id FROM clients LIMIT 5;
   ```

### Phase 2: Test Super Admin Migration (migration-super-admin.sql)

1. **Run Migration**
   - [ ] Execute `migration-super-admin.sql` in staging SQL Editor
   - [ ] Check for errors
   - [ ] Verify success messages

2. **Verify Changes**
   - [ ] `user_profiles` has `is_super_admin` column
   - [ ] manisha@designs.com has `is_super_admin = TRUE`
   - [ ] `organization_stats` view exists
   - [ ] `super_admin_logs` table exists

3. **Test Super Admin Functions**
   ```sql
   -- Test is_super_admin() function
   SELECT is_super_admin();  -- Should return TRUE for manisha@designs.com

   -- Test get_all_organizations() function
   SELECT * FROM get_all_organizations();

   -- Test organization_stats view
   SELECT * FROM organization_stats;
   ```

### Phase 3: Test Frontend with Staging

1. **Update Local Environment**

   Create a `.env.staging` file:
   ```
   VITE_SUPABASE_URL=https://your-staging-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-staging-anon-key
   ```

2. **Start Frontend with Staging**
   ```bash
   # Load staging environment
   cp .env.staging .env.local

   # Start dev server
   npm run dev
   ```

3. **Test Authentication**
   - [ ] Can log in as manisha@designs.com
   - [ ] User is loaded correctly
   - [ ] Organization is loaded correctly
   - [ ] isSuperAdmin flag is TRUE

4. **Test Regular Pages**
   - [ ] Dashboard loads without errors
   - [ ] Clients page shows all clients
   - [ ] Can view client details
   - [ ] Vendors page works (once updated)
   - [ ] Labors page works (once updated)
   - [ ] Tasks page works (once updated)
   - [ ] Contracts page works (once updated)
   - [ ] Documents page works (once updated)

5. **Test Organization Settings**
   - [ ] Settings page loads (only for admin)
   - [ ] Can see team members
   - [ ] Can add new members (test with test email)
   - [ ] Can change roles
   - [ ] Can remove members

6. **Test Super Admin Dashboard**
   - [ ] Super Admin link appears in sidebar
   - [ ] Super Admin dashboard loads
   - [ ] Shows correct statistics
   - [ ] Shows all organizations
   - [ ] Can create new organization

7. **Test Permissions**
   - [ ] Create a test user with 'viewer' role
   - [ ] Log in as viewer
   - [ ] Verify cannot create/edit/delete
   - [ ] Create a test user with 'user' role
   - [ ] Verify can create/edit but not delete critical data
   - [ ] Create a test user with 'manager' role
   - [ ] Verify has most permissions

### Phase 4: Test Data Operations

1. **Test Creating Records**
   - [ ] Create a new client - verify organization_id is set
   - [ ] Create a new vendor - verify organization_id is set
   - [ ] Create a new labor - verify organization_id is set
   - [ ] Create a new task - verify organization_id is set
   - [ ] Create a new contract - verify organization_id is set
   - [ ] Create a new payment - verify organization_id is set
   - [ ] Upload a document - verify organization_id is set

2. **Test Updating Records**
   - [ ] Edit a client - verify updated_by is set
   - [ ] Edit a vendor - verify updated_by is set
   - [ ] Edit a task - verify updated_by is set

3. **Test Deleting Records**
   - [ ] As admin: can delete clients
   - [ ] As manager: cannot delete clients
   - [ ] As user: cannot delete clients
   - [ ] As user: can delete own tasks

4. **Test Organization Isolation**
   - [ ] Create second test organization
   - [ ] Create test user in second org
   - [ ] Log in as that user
   - [ ] Verify cannot see first org's data
   - [ ] Create a client in second org
   - [ ] Switch back to first org
   - [ ] Verify cannot see second org's client

### Phase 5: Error Testing

1. **Test Error Handling**
   - [ ] Try to access data without organization (should fail gracefully)
   - [ ] Try to delete as non-admin (should show error)
   - [ ] Try to add member with invalid email (should show error)
   - [ ] Try to create organization as non-super-admin (should fail)

2. **Test Edge Cases**
   - [ ] User with no organizations (should show message)
   - [ ] User in multiple organizations (can switch)
   - [ ] Organization with no members (super admin can see)

## Final Verification

- [ ] All existing data preserved
- [ ] All features working
- [ ] No console errors
- [ ] RLS policies enforcing security
- [ ] Performance acceptable
- [ ] Ready to migrate production

## Issues Found

Document any issues discovered during testing:

1. Issue:
   Status:
   Fix:

2. Issue:
   Status:
   Fix:

## Decision: Proceed to Production?

- [ ] YES - All tests passed, ready for production migration
- [ ] NO - Issues found, need fixes before production

## Production Migration Date

Scheduled for: _________________
Performed by: __________________
Backup taken: __________________
Migration successful: __________
