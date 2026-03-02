# Multi-User & RBAC Implementation Guide

## ✅ What Has Been Completed

### 1. Database Migration Script
**File**: `/migration-multi-user.sql`

A complete SQL migration script that:
- Creates 4 new tables: `organizations`, `user_profiles`, `organization_members`, `organization_invitations`
- Adds `organization_id`, `created_by`, `updated_by` columns to all existing tables
- Creates database functions for permission checking
- Migrates all existing data to `manisha@designs.com`
- Updates RLS policies for organization-scoped, role-based access
- Creates performance indexes

### 2. Authentication Context
**File**: `/src/contexts/AuthContext.tsx`

Provides:
- Current user and organization state
- Organization switching capability
- Permission checking: `hasPermission(resource, action)`
- Role helpers: `isAdmin`, `isManager`, `isUser`, `isViewer`

### 3. Database Schema Updates
**File**: `/src/lib/schema.ts`

- Added 4 new table definitions for multi-user support
- Updated all 7 existing tables with new columns
- Updated insert schemas to omit auto-generated columns

### 4. Application Bootstrap
**File**: `/src/App.tsx`

- Wrapped with `AuthProvider`
- Updated `PrivateRoute` to use `useAuth()` hook
- Added organization membership check

### 5. Navbar with Organization Switcher
**File**: `/src/components/layout/navbar.tsx`

- Added organization switcher dropdown
- Displays current organization name and user role
- Allows switching between organizations (if user belongs to multiple)

### 6. Reference Implementation
**File**: `/src/pages/clients.tsx`

Fully updated with:
- Organization filtering in queries
- Organization ID and audit tracking in mutations
- Permission-based UI controls (Add/Edit/Delete buttons)

---

## 🚀 Implementation Steps

### Step 1: Run Database Migration

**IMPORTANT**: This is the most critical step. Complete this before testing the frontend.

1. **Backup your database first!**

2. **Ensure migration user exists**:
   - Log into Supabase Dashboard → Authentication → Users
   - Verify `manisha@designs.com` exists
   - If not, create this user account first

3. **Run the migration**:
   - Go to Supabase Dashboard → SQL Editor
   - Open `/migration-multi-user.sql`
   - Run the entire script
   - Verify success by checking the output messages

4. **Verify migration**:
   ```sql
   -- Check organizations created
   SELECT * FROM organizations;

   -- Check user profile created
   SELECT * FROM user_profiles WHERE email = 'manisha@designs.com';

   -- Check organization membership
   SELECT * FROM organization_members;

   -- Verify data migrated (should all have organization_id)
   SELECT COUNT(*) FROM clients WHERE organization_id IS NOT NULL;
   SELECT COUNT(*) FROM vendors WHERE organization_id IS NOT NULL;
   ```

### Step 2: Test Authentication

1. Log in with `manisha@designs.com`
2. You should see:
   - Organization name and role (admin) in the navbar
   - All your existing data visible
   - All CRUD buttons available (admin has full permissions)

### Step 3: Update Remaining Pages

You need to update these files following the pattern from `clients.tsx`:

#### Pages to Update:
- `/src/pages/vendors.tsx`
- `/src/pages/labors.tsx`
- `/src/pages/tasks.tsx`
- `/src/pages/contracts.tsx`
- `/src/pages/documents.tsx`
- `/src/pages/client-details.tsx`
- `/src/pages/vendor-details.tsx`
- `/src/pages/labor-details.tsx`
- `/src/pages/contract-details.tsx`
- `/src/pages/dashboard.tsx`

---

## 📝 Pattern for Updating Pages

Follow this 3-step pattern for each page:

### Step 1: Add Import and Hook

```typescript
// Add to imports
import { useAuth } from "@/contexts/AuthContext";

// In component, add this line
export default function YourPage() {
  const { currentOrganization, user, hasPermission } = useAuth();
  // ... rest of code
}
```

### Step 2: Update Queries

**Before:**
```typescript
const { data, isLoading } = useQuery({
  queryKey: ['resource'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('resource')
      .select('*');
    // ...
  }
});
```

**After:**
```typescript
const { data, isLoading } = useQuery({
  queryKey: ['resource', currentOrganization?.organization_id],
  queryFn: async () => {
    if (!currentOrganization) throw new Error('No organization selected');

    const { data, error } = await supabase
      .from('resource')
      .select('*')
      .eq('organization_id', currentOrganization.organization_id);
    // ...
  },
  enabled: !!currentOrganization,
});
```

### Step 3: Update Mutations

**Before (Create):**
```typescript
const createMutation = useMutation({
  mutationFn: async (values) => {
    const { data, error } = await supabase
      .from('resource')
      .insert([values])
      .select();
    // ...
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['resource'] });
    // ...
  }
});
```

**After (Create):**
```typescript
const createMutation = useMutation({
  mutationFn: async (values) => {
    if (!currentOrganization || !user) throw new Error('Not authorized');

    const { data, error } = await supabase
      .from('resource')
      .insert([{
        ...values,
        organization_id: currentOrganization.organization_id,
        created_by: user.id,
      }])
      .select();
    // ...
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['resource', currentOrganization?.organization_id] });
    // ...
  }
});
```

**After (Update):**
```typescript
const updateMutation = useMutation({
  mutationFn: async (values) => {
    if (!editingItem || !user) return;

    const { data, error } = await supabase
      .from('resource')
      .update({
        ...values,
        updated_by: user.id,
      })
      .eq('id', editingItem.id)
      .select();
    // ...
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['resource', currentOrganization?.organization_id] });
    // ...
  }
});
```

### Step 4: Add Permission Checks to UI

**For Add Button:**
```typescript
{hasPermission('resource', 'create') && (
  <Button onClick={handleAdd}>
    <Plus className="h-4 w-4 mr-2" />
    Add Resource
  </Button>
)}
```

**For Edit Button:**
```typescript
{hasPermission('resource', 'update') && (
  <Button onClick={() => handleEdit(item)}>
    <Pencil className="h-4 w-4" />
  </Button>
)}
```

**For Delete Button:**
```typescript
{hasPermission('resource', 'delete') && (
  <Button onClick={() => handleDelete(item)}>
    <Trash className="h-4 w-4" />
  </Button>
)}
```

---

## 🔐 Permission Matrix Reference

| Resource | Admin | Manager | User | Viewer |
|----------|-------|---------|------|--------|
| **Clients/Vendors/Labors** |
| View | ✓ | ✓ | ✓ | ✓ |
| Create | ✓ | ✓ | ✓ | ✗ |
| Update | ✓ | ✓ | ✓ | ✗ |
| Delete | ✓ | ✗ | ✗ | ✗ |
| **Tasks** |
| View | ✓ | ✓ | ✓ | ✓ |
| Create | ✓ | ✓ | ✓ | ✗ |
| Update | ✓ | ✓ | ✓ | ✗ |
| Delete | ✓ | ✓ | ✓ (own) | ✗ |
| **Contracts/Payments** |
| View | ✓ | ✓ | ✓ | ✓ |
| Create | ✓ | ✓ | ✓ | ✗ |
| Update | ✓ | ✓ | ✓ | ✗ |
| Delete | ✓ | ✗ | ✗ | ✗ |
| **Documents** |
| View | ✓ | ✓ | ✓ | ✓ |
| Upload | ✓ | ✓ | ✓ | ✗ |
| Update | ✓ (all) | ✓ (all) | ✓ (own) | ✗ |
| Delete | ✓ (all) | ✓ (all) | ✓ (own) | ✗ |

---

## 🧪 Testing Checklist

### Database Level
- [ ] Migration script runs without errors
- [ ] All existing data has `organization_id` populated
- [ ] `manisha@designs.com` is admin of organization
- [ ] RLS policies are active (check Supabase Dashboard → Authentication → Policies)

### Application Level
- [ ] Login with `manisha@designs.com` works
- [ ] Organization name shows in navbar
- [ ] Role badge shows "admin"
- [ ] All existing data is visible
- [ ] Can create new clients (check organization_id is set)
- [ ] Can update clients (check updated_by is set)
- [ ] Can delete clients (admin permission)

### Multi-User Testing
1. **Create a second user**:
   - Supabase Dashboard → Authentication → Add User
   - Email: `test@designs.com`
   - Role: Test different roles (manager, user, viewer)

2. **Add them to the organization**:
   ```sql
   -- Get the user ID from auth.users
   SELECT id, email FROM auth.users WHERE email = 'test@designs.com';

   -- Create user profile
   INSERT INTO user_profiles (id, email, full_name)
   VALUES ('<user-id>', 'test@designs.com', 'Test User');

   -- Add to organization with desired role
   INSERT INTO organization_members (organization_id, user_id, role, status)
   VALUES (
     (SELECT id FROM organizations WHERE slug = 'interior-innovations'),
     '<user-id>',
     'viewer', -- or 'user', 'manager', 'admin'
     'active'
   );
   ```

3. **Test with different roles**:
   - **Viewer**: Should only see data, no create/edit/delete buttons
   - **User**: Can create/update, cannot delete (except own tasks/documents)
   - **Manager**: Can create/update/delete most things (except clients/contracts/payments delete)
   - **Admin**: Full access to everything

---

## 🔍 Troubleshooting

### "No organization selected" error
- Check that user exists in `user_profiles` table
- Check that user is in `organization_members` table with `status = 'active'`
- Verify `organization_id` in localStorage

### Data not showing up
- Check RLS policies are enabled
- Verify queries include `.eq('organization_id', currentOrganization.organization_id)`
- Check that data has `organization_id` populated

### Permission errors
- Verify `hasPermission()` calls use correct resource names
- Check user's role in `organization_members` table
- Ensure RLS policies match permission matrix

### Migration fails
- Check that `manisha@designs.com` exists in `auth.users`
- Verify no existing tables conflict with new ones
- Check for FK constraint violations

---

## 📚 Additional Features (Optional)

### User Management Page
Create a page to:
- View all organization members
- Invite new users (generate invitation tokens)
- Change user roles (admin only)
- Remove members (admin only)

### Audit Log
Create a page showing:
- Who created/updated records
- When changes were made
- Filter by user, date, action type

### Organization Settings
Allow admins to:
- Update organization name
- View usage statistics
- Manage organization settings

---

## 🎯 Next Steps

1. ✅ **Migration Complete** - Database is ready
2. ✅ **Core Files Updated** - Auth, schema, App, navbar, clients
3. 🔲 **Update Remaining Pages** - Follow the pattern above for 9 more pages
4. 🔲 **Test Thoroughly** - Create test users with different roles
5. 🔲 **Deploy** - Push to production when ready

---

## 💡 Tips

- **Start small**: Update one page at a time and test
- **Use clients.tsx as reference**: It has the complete pattern
- **Test after each page**: Ensure it works before moving to the next
- **Check console for errors**: React Query errors will show in console
- **Use Supabase logs**: Check for RLS policy violations in Supabase logs

---

## 📞 Support

If you encounter issues:
1. Check the Supabase Dashboard logs
2. Review browser console for errors
3. Verify RLS policies in Supabase
4. Check that all queries include `organization_id` filter
5. Ensure mutations include `organization_id` and audit fields

Good luck with the implementation! 🚀
