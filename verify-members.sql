-- Run this in Supabase SQL Editor (STAGING) to check organization members

-- 1. Check if you have any organizations
SELECT 'Organizations:' as info;
SELECT id, name, slug, status FROM organizations;

-- 2. Check your user profile
SELECT 'Your User Profile:' as info;
SELECT id, email, full_name, is_super_admin FROM user_profiles;

-- 3. Check organization members
SELECT 'Organization Members:' as info;
SELECT
  om.id,
  om.organization_id,
  om.user_id,
  om.role,
  om.status,
  om.joined_at,
  up.email,
  up.full_name
FROM organization_members om
LEFT JOIN user_profiles up ON om.user_id = up.id;

-- 4. Check if your user is in organization_members
SELECT 'Your Memberships:' as info;
SELECT
  om.organization_id,
  o.name as org_name,
  om.role,
  om.status
FROM organization_members om
JOIN organizations o ON om.organization_id = o.id
JOIN user_profiles up ON om.user_id = up.id
WHERE up.email = 'manisha@designs.com';
