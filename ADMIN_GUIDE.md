# Organization Settings - Admin Guide

## Overview
The Organization Settings page allows administrators to manage team members, assign roles, and control access to the system.

## Accessing Settings
1. Log in as an admin user
2. Look for "Settings" in the sidebar (only visible to admins)
3. Click on Settings to open the organization management page

## Features

### 1. View Team Members
- See all active members of your organization
- View their email, name, role, and join date
- See who the current user is (marked as "You")

### 2. Add New Members
**Important**: Users must create an account first before you can add them.

**Steps to add a member**:
1. Click "Add Member" button
2. Enter their email address (must match their Supabase account email)
3. Select their role:
   - **Viewer**: Read-only access
   - **User**: Can create and edit data
   - **Manager**: Can manage projects and invite others
4. Click "Add Member"

**If you see an error**: "User must sign up first"
- The person needs to create an account first
- Ask them to go to your app and sign up
- Once they have an account, you can add them

### 3. Change User Roles
1. Find the member in the list
2. Click on their role dropdown
3. Select new role:
   - **Admin**: Full access (can manage users, delete anything)
   - **Manager**: Project management (cannot delete critical data)
   - **User**: Standard access (create/edit only)
   - **Viewer**: Read-only
4. Role change is immediate

**Note**: You cannot change your own role.

### 4. Remove Members
1. Find the member to remove
2. Click the red trash icon
3. Confirm removal
4. They immediately lose access to the organization

**Note**: You cannot remove yourself.

## Role Permissions Matrix

| Permission | Admin | Manager | User | Viewer |
|------------|-------|---------|------|--------|
| View all data | ✓ | ✓ | ✓ | ✓ |
| Create clients/vendors/etc | ✓ | ✓ | ✓ | ✗ |
| Edit data | ✓ | ✓ | ✓ | ✗ |
| Delete clients/contracts | ✓ | ✗ | ✗ | ✗ |
| Delete tasks | ✓ | ✓ | ✓ (own) | ✗ |
| Manage team members | ✓ | ✗ | ✗ | ✗ |
| Organization settings | ✓ | ✗ | ✗ | ✗ |

## Adding Your First Team Member

### Method 1: If they already have an account
1. Get their email address
2. Go to Settings → Add Member
3. Enter their email and select role
4. Click Add Member
5. They can now log in and access your organization

### Method 2: If they need to create an account
1. Ask them to:
   - Go to your app URL
   - Click "Sign Up" or register
   - Create an account with their email
2. Once they've signed up:
   - Go to Settings → Add Member
   - Enter their email and select role
   - Click Add Member

## Adding Members Manually via SQL

If you need to add someone directly via the database:

```sql
-- 1. Get their user ID
SELECT id, email FROM auth.users WHERE email = 'newuser@example.com';

-- 2. Get your organization ID
SELECT id, name FROM organizations WHERE slug = 'interior-innovations';

-- 3. Add them to your organization
INSERT INTO organization_members (organization_id, user_id, role, status)
VALUES (
  '<your-organization-id>',
  '<their-user-id>',
  'user', -- or 'admin', 'manager', 'viewer'
  'active'
);
```

## Troubleshooting

### "User must sign up first"
**Problem**: The email you entered doesn't exist in the system.

**Solution**:
- Ask the person to create an account first
- Verify you have the correct email address
- Try again after they've signed up

### Member can't see the organization
**Problem**: Member logs in but sees "No Organization" error.

**Solution**:
- Check if they're properly added in organization_members table
- Verify their status is 'active'
- Make sure they're logging in with the correct email

### Settings page not visible
**Problem**: You don't see Settings in the sidebar.

**Solution**:
- Only admins can see Settings
- Check your role: Go to navbar → look at your badge
- Should say "admin"
- If not, ask another admin to promote you

## Security Best Practices

1. **Start with fewer privileges**: Add users as "Viewer" or "User" first, promote later if needed
2. **Limit admins**: Only make trusted people admins
3. **Regular audits**: Review member list regularly, remove inactive users
4. **Role review**: Periodically check if users still need their current role level

## Common Workflows

### Onboarding a New Team Member
1. Ask for their email
2. Have them create an account
3. Add them as "User" or "Viewer"
4. Test that they can log in
5. Promote to "Manager" if needed

### Offboarding a Team Member
1. Go to Settings
2. Find their row
3. Click trash icon
4. Confirm removal
5. They lose access immediately

### Promoting Someone
1. Find them in member list
2. Change role dropdown
3. New permissions apply immediately

## Future Features (Coming Soon)

- Email invitations (send invite links)
- Bulk user import
- Activity logs (see who did what)
- User groups/departments
- Custom roles with granular permissions

---

## Need Help?

If you encounter issues:
1. Check this guide first
2. Verify user accounts exist in Supabase Dashboard → Authentication
3. Check organization_members table in database
4. Review browser console for error messages
