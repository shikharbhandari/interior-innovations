-- ============================================================================
-- SUPER ADMIN / SAAS OWNER MIGRATION
-- ============================================================================
-- This adds super admin capabilities for SaaS owners who need to manage
-- multiple customer organizations.
--
-- Run this AFTER the main multi-user migration.
-- ============================================================================

-- ============================================================================
-- STEP 1: Add Super Admin Flag to User Profiles
-- ============================================================================

-- Add is_super_admin column to user_profiles
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT FALSE;

-- Create index for quick super admin checks
CREATE INDEX IF NOT EXISTS idx_user_profiles_super_admin
ON public.user_profiles(is_super_admin)
WHERE is_super_admin = TRUE;

-- ============================================================================
-- STEP 2: Make manisha@designs.com a Super Admin
-- ============================================================================

-- Set the super admin flag for the platform owner
UPDATE public.user_profiles
SET is_super_admin = TRUE
WHERE email = 'manisha@designs.com';

-- Verify
DO $$
DECLARE
  super_admin_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO super_admin_count
  FROM public.user_profiles
  WHERE is_super_admin = TRUE;

  RAISE NOTICE 'Super Admins: %', super_admin_count;
END $$;

-- ============================================================================
-- STEP 3: Create Super Admin Helper Functions
-- ============================================================================

-- Function to check if user is super admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles
    WHERE id = auth.uid()
      AND is_super_admin = TRUE
  );
$$;

-- Function to get all organizations (super admin only)
CREATE OR REPLACE FUNCTION public.get_all_organizations()
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  status TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  member_count BIGINT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  -- Only super admins can see all organizations
  SELECT
    o.id,
    o.name,
    o.slug,
    o.status,
    o.created_at,
    COUNT(om.id) as member_count
  FROM public.organizations o
  LEFT JOIN public.organization_members om ON o.id = om.organization_id AND om.status = 'active'
  WHERE is_super_admin() = TRUE
  GROUP BY o.id, o.name, o.slug, o.status, o.created_at
  ORDER BY o.created_at DESC;
$$;

-- ============================================================================
-- STEP 4: Update RLS Policies for Super Admin Access
-- ============================================================================

-- Super admins can view ALL organizations
DROP POLICY IF EXISTS "Users can view their organizations" ON public.organizations;
CREATE POLICY "Users can view their organizations"
  ON public.organizations FOR SELECT
  USING (
    id IN (SELECT get_user_organizations())
    OR is_super_admin()
  );

-- Super admins can create organizations
CREATE POLICY "Super admins can create organizations"
  ON public.organizations FOR INSERT
  WITH CHECK (is_super_admin());

-- Super admins can update any organization
DROP POLICY IF EXISTS "Admins can update organizations" ON public.organizations;
CREATE POLICY "Admins can update organizations"
  ON public.organizations FOR UPDATE
  USING (
    user_has_role(id, 'admin')
    OR is_super_admin()
  );

-- Super admins can delete organizations
CREATE POLICY "Super admins can delete organizations"
  ON public.organizations FOR DELETE
  USING (is_super_admin());

-- Super admins can view all organization members
DROP POLICY IF EXISTS "Users can view org members" ON public.organization_members;
CREATE POLICY "Users can view org members"
  ON public.organization_members FOR SELECT
  USING (
    organization_id IN (SELECT get_user_organizations())
    OR is_super_admin()
  );

-- Super admins can add members to any organization
DROP POLICY IF EXISTS "Admins can add members" ON public.organization_members;
CREATE POLICY "Admins can add members"
  ON public.organization_members FOR INSERT
  WITH CHECK (
    user_has_role(organization_id, 'admin')
    OR is_super_admin()
  );

-- Super admins can view all user profiles
DROP POLICY IF EXISTS "Users can view profiles in their organizations" ON public.user_profiles;
CREATE POLICY "Users can view profiles in their organizations"
  ON public.user_profiles FOR SELECT
  USING (
    id IN (
      SELECT om.user_id
      FROM public.organization_members om
      WHERE om.organization_id IN (SELECT get_user_organizations())
        AND om.status = 'active'
    )
    OR is_super_admin()
  );

-- Super admins can update any user profile
CREATE POLICY "Super admins can update any profile"
  ON public.user_profiles FOR UPDATE
  USING (is_super_admin());

-- ============================================================================
-- STEP 5: Create Organization Statistics View
-- ============================================================================

CREATE OR REPLACE VIEW public.organization_stats AS
SELECT
  o.id,
  o.name,
  o.slug,
  o.status,
  o.created_at,
  COUNT(DISTINCT om.user_id) FILTER (WHERE om.status = 'active') as active_members,
  COUNT(DISTINCT c.id) as total_clients,
  COUNT(DISTINCT v.id) as total_vendors,
  COUNT(DISTINCT l.id) as total_labors,
  COUNT(DISTINCT co.id) as total_contracts,
  COUNT(DISTINCT t.id) as total_tasks,
  (
    SELECT email FROM public.user_profiles up
    JOIN public.organization_members om2 ON up.id = om2.user_id
    WHERE om2.organization_id = o.id
      AND om2.role = 'admin'
      AND om2.status = 'active'
    LIMIT 1
  ) as admin_email
FROM public.organizations o
LEFT JOIN public.organization_members om ON o.id = om.organization_id
LEFT JOIN public.clients c ON o.id = c.organization_id
LEFT JOIN public.vendors v ON o.id = v.organization_id
LEFT JOIN public.labors l ON o.id = l.organization_id
LEFT JOIN public.contracts co ON o.id = co.organization_id
LEFT JOIN public.tasks t ON o.id = t.organization_id
GROUP BY o.id, o.name, o.slug, o.status, o.created_at;

-- Grant access to authenticated users (RLS will filter)
GRANT SELECT ON public.organization_stats TO authenticated;

-- ============================================================================
-- STEP 6: Create Super Admin Activity Log
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.super_admin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  super_admin_id UUID NOT NULL REFERENCES public.user_profiles(id),
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL, -- 'organization', 'user', 'member'
  resource_id TEXT,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Index for querying logs
CREATE INDEX IF NOT EXISTS idx_super_admin_logs_admin ON public.super_admin_logs(super_admin_id);
CREATE INDEX IF NOT EXISTS idx_super_admin_logs_created ON public.super_admin_logs(created_at DESC);

-- RLS for super admin logs (only super admins can view)
ALTER TABLE public.super_admin_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view logs"
  ON public.super_admin_logs FOR SELECT
  USING (is_super_admin());

CREATE POLICY "Super admins can create logs"
  ON public.super_admin_logs FOR INSERT
  WITH CHECK (is_super_admin());

-- ============================================================================
-- STEP 7: Verification Queries
-- ============================================================================

DO $$
DECLARE
  super_admin_email TEXT;
  org_count INTEGER;
BEGIN
  -- Get super admin email
  SELECT email INTO super_admin_email
  FROM public.user_profiles
  WHERE is_super_admin = TRUE
  LIMIT 1;

  -- Get organization count
  SELECT COUNT(*) INTO org_count FROM public.organizations;

  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'SUPER ADMIN MIGRATION COMPLETE';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Super Admin: %', super_admin_email;
  RAISE NOTICE 'Total Organizations: %', org_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Next Steps:';
  RAISE NOTICE '1. Log in as %', super_admin_email;
  RAISE NOTICE '2. Access Super Admin Dashboard at /super-admin';
  RAISE NOTICE '3. Start creating organizations for customers';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
END $$;

-- ============================================================================
-- MIGRATION COMPLETE!
-- ============================================================================
-- You can now:
-- 1. Create new organizations for customers
-- 2. View all organizations and their stats
-- 3. Manage users across all organizations
-- 4. Access any organization's data
-- 5. View activity logs
-- ============================================================================
