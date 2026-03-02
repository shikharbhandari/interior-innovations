-- ============================================================================
-- MULTI-USER & ROLE-BASED ACCESS CONTROL MIGRATION
-- ============================================================================
-- This script migrates the Interior Innovations Management system from
-- single-user to multi-user with organization-based data sharing.
--
-- Migration User: manisha@designs.com
-- All existing data will be assigned to this user in a new organization.
--
-- IMPORTANT: Backup your database before running this script!
-- ============================================================================

-- ============================================================================
-- STEP 1: Create New Tables for Multi-User Support
-- ============================================================================

-- Organizations table (tenants/companies)
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted'))
);

-- User profiles (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Organization members (junction table linking users to orgs with roles)
CREATE TABLE IF NOT EXISTS public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'user', 'viewer')),
  invited_by UUID REFERENCES public.user_profiles(id),
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended')),
  UNIQUE(organization_id, user_id)
);

-- Invitation tokens for new users
CREATE TABLE IF NOT EXISTS public.organization_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'user', 'viewer')),
  invited_by UUID NOT NULL REFERENCES public.user_profiles(id),
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  accepted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked'))
);

-- ============================================================================
-- STEP 2: Create Database Functions for Permission Checking
-- ============================================================================

-- Function to get current user's organization memberships
CREATE OR REPLACE FUNCTION public.get_user_organizations()
RETURNS SETOF UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT organization_id
  FROM public.organization_members
  WHERE user_id = auth.uid()
    AND status = 'active';
$$;

-- Function to check if user has a specific role in an organization
CREATE OR REPLACE FUNCTION public.user_has_role(
  org_id UUID,
  required_role TEXT
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_id = org_id
      AND user_id = auth.uid()
      AND status = 'active'
      AND (
        -- Admin has all permissions
        role = 'admin' OR
        -- Check specific role hierarchy
        (required_role = 'manager' AND role IN ('admin', 'manager')) OR
        (required_role = 'user' AND role IN ('admin', 'manager', 'user')) OR
        (required_role = 'viewer' AND role IN ('admin', 'manager', 'user', 'viewer'))
      )
  );
$$;

-- Function to get user's role in an organization
CREATE OR REPLACE FUNCTION public.get_user_role(org_id UUID)
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT role
  FROM public.organization_members
  WHERE organization_id = org_id
    AND user_id = auth.uid()
    AND status = 'active'
  LIMIT 1;
$$;

-- Function to check if user is member of organization
CREATE OR REPLACE FUNCTION public.is_organization_member(org_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_id = org_id
      AND user_id = auth.uid()
      AND status = 'active'
  );
$$;

-- Trigger to create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Trigger to update updated_at timestamp on new tables
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_organization_members_updated_at
  BEFORE UPDATE ON public.organization_members
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- STEP 3: Add Organization and Audit Columns to Existing Tables
-- ============================================================================

-- Add organization_id column to all existing tables (nullable initially)
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.labors ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Add audit columns (created_by, updated_by) to all existing tables
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.user_profiles(id);
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.user_profiles(id);

ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.user_profiles(id);
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.user_profiles(id);

ALTER TABLE public.labors ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.user_profiles(id);
ALTER TABLE public.labors ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.user_profiles(id);

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.user_profiles(id);
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.user_profiles(id);
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES public.user_profiles(id);

ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.user_profiles(id);
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.user_profiles(id);

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.user_profiles(id);
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.user_profiles(id);

ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.user_profiles(id);
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.user_profiles(id);

-- ============================================================================
-- STEP 4: Migrate Existing Data to Migration User
-- ============================================================================

DO $$
DECLARE
  migration_user_id UUID;
  migration_org_id UUID;
  migration_email TEXT := 'manisha@designs.com';
BEGIN
  -- Get the migration user ID from auth.users
  SELECT id INTO migration_user_id
  FROM auth.users
  WHERE email = migration_email
  LIMIT 1;

  -- Check if user exists
  IF migration_user_id IS NULL THEN
    RAISE EXCEPTION 'Migration user % not found in auth.users. Please create this user in Supabase Auth first.', migration_email;
  END IF;

  RAISE NOTICE 'Found migration user: % (ID: %)', migration_email, migration_user_id;

  -- Create user profile if it doesn't exist
  INSERT INTO public.user_profiles (id, email, full_name)
  VALUES (migration_user_id, migration_email, 'Manisha')
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email;

  RAISE NOTICE 'User profile created/updated';

  -- Create the migration organization
  INSERT INTO public.organizations (name, slug, status)
  VALUES ('Interior Innovations', 'interior-innovations', 'active')
  RETURNING id INTO migration_org_id;

  RAISE NOTICE 'Created organization: Interior Innovations (ID: %)', migration_org_id;

  -- Add migration user as admin of organization
  INSERT INTO public.organization_members (organization_id, user_id, role, status)
  VALUES (migration_org_id, migration_user_id, 'admin', 'active');

  RAISE NOTICE 'Added % as admin of organization', migration_email;

  -- Migrate existing data to the migration organization
  UPDATE public.clients
  SET organization_id = migration_org_id,
      created_by = migration_user_id
  WHERE organization_id IS NULL;
  RAISE NOTICE 'Migrated % clients', (SELECT COUNT(*) FROM public.clients WHERE organization_id = migration_org_id);

  UPDATE public.vendors
  SET organization_id = migration_org_id,
      created_by = migration_user_id
  WHERE organization_id IS NULL;
  RAISE NOTICE 'Migrated % vendors', (SELECT COUNT(*) FROM public.vendors WHERE organization_id = migration_org_id);

  UPDATE public.labors
  SET organization_id = migration_org_id,
      created_by = migration_user_id
  WHERE organization_id IS NULL;
  RAISE NOTICE 'Migrated % labors', (SELECT COUNT(*) FROM public.labors WHERE organization_id = migration_org_id);

  UPDATE public.tasks
  SET organization_id = migration_org_id,
      created_by = migration_user_id
  WHERE organization_id IS NULL;
  RAISE NOTICE 'Migrated % tasks', (SELECT COUNT(*) FROM public.tasks WHERE organization_id = migration_org_id);

  UPDATE public.contracts
  SET organization_id = migration_org_id,
      created_by = migration_user_id
  WHERE organization_id IS NULL;
  RAISE NOTICE 'Migrated % contracts', (SELECT COUNT(*) FROM public.contracts WHERE organization_id = migration_org_id);

  UPDATE public.payments
  SET organization_id = migration_org_id,
      created_by = migration_user_id
  WHERE organization_id IS NULL;
  RAISE NOTICE 'Migrated % payments', (SELECT COUNT(*) FROM public.payments WHERE organization_id = migration_org_id);

  UPDATE public.documents
  SET organization_id = migration_org_id,
      created_by = migration_user_id
  WHERE organization_id IS NULL;
  RAISE NOTICE 'Migrated % documents', (SELECT COUNT(*) FROM public.documents WHERE organization_id = migration_org_id);

  RAISE NOTICE '✓ Migration completed successfully!';
  RAISE NOTICE 'Organization ID: %', migration_org_id;
  RAISE NOTICE 'Admin User: %', migration_email;
END $$;

-- Make organization_id NOT NULL now that all records have values
ALTER TABLE public.clients ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.vendors ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.labors ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.tasks ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.contracts ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.payments ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.documents ALTER COLUMN organization_id SET NOT NULL;

-- ============================================================================
-- STEP 5: Create Indexes for Performance
-- ============================================================================

-- Indexes for organization_id lookups (critical for query performance)
CREATE INDEX IF NOT EXISTS idx_clients_organization_id ON public.clients(organization_id);
CREATE INDEX IF NOT EXISTS idx_vendors_organization_id ON public.vendors(organization_id);
CREATE INDEX IF NOT EXISTS idx_labors_organization_id ON public.labors(organization_id);
CREATE INDEX IF NOT EXISTS idx_tasks_organization_id ON public.tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_contracts_organization_id ON public.contracts(organization_id);
CREATE INDEX IF NOT EXISTS idx_payments_organization_id ON public.payments(organization_id);
CREATE INDEX IF NOT EXISTS idx_documents_organization_id ON public.documents(organization_id);

-- Indexes for organization_members lookups
CREATE INDEX IF NOT EXISTS idx_organization_members_user_id ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_org_user ON public.organization_members(organization_id, user_id);

-- Indexes for audit trail
CREATE INDEX IF NOT EXISTS idx_clients_created_by ON public.clients(created_by);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON public.tasks(assigned_to);

-- ============================================================================
-- STEP 6: Enable RLS on New Tables
-- ============================================================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- STEP 7: Drop Old Permissive Policies and Create New Organization-Scoped Policies
-- ============================================================================

-- Drop all existing permissive policies
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.clients;
DROP POLICY IF EXISTS "Enable write access for authenticated users" ON public.clients;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON public.clients;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON public.clients;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.vendors;
DROP POLICY IF EXISTS "Enable write access for authenticated users" ON public.vendors;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON public.vendors;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON public.vendors;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.labors;
DROP POLICY IF EXISTS "Enable write access for authenticated users" ON public.labors;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON public.labors;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON public.labors;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.tasks;
DROP POLICY IF EXISTS "Enable write access for authenticated users" ON public.tasks;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON public.tasks;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON public.tasks;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.contracts;
DROP POLICY IF EXISTS "Enable write access for authenticated users" ON public.contracts;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON public.contracts;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON public.contracts;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.payments;
DROP POLICY IF EXISTS "Enable write access for authenticated users" ON public.payments;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON public.payments;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON public.payments;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.documents;
DROP POLICY IF EXISTS "Enable write access for authenticated users" ON public.documents;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON public.documents;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON public.documents;

-- ============================================================================
-- NEW RLS POLICIES: Organizations Table
-- ============================================================================

-- Users can only see organizations they belong to
CREATE POLICY "Users can view their organizations"
  ON public.organizations FOR SELECT
  USING (id IN (SELECT get_user_organizations()));

-- Only admins can update organization settings
CREATE POLICY "Admins can update organizations"
  ON public.organizations FOR UPDATE
  USING (user_has_role(id, 'admin'));

-- ============================================================================
-- NEW RLS POLICIES: User Profiles Table
-- ============================================================================

-- Users can view profiles in their organizations
CREATE POLICY "Users can view profiles in their organizations"
  ON public.user_profiles FOR SELECT
  USING (
    id IN (
      SELECT om.user_id
      FROM public.organization_members om
      WHERE om.organization_id IN (SELECT get_user_organizations())
        AND om.status = 'active'
    )
  );

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.user_profiles FOR UPDATE
  USING (id = auth.uid());

-- ============================================================================
-- NEW RLS POLICIES: Organization Members Table
-- ============================================================================

-- Users can view members of their organizations
CREATE POLICY "Users can view org members"
  ON public.organization_members FOR SELECT
  USING (organization_id IN (SELECT get_user_organizations()));

-- Admins can insert new members
CREATE POLICY "Admins can add members"
  ON public.organization_members FOR INSERT
  WITH CHECK (user_has_role(organization_id, 'admin'));

-- Admins can update member roles
CREATE POLICY "Admins can update members"
  ON public.organization_members FOR UPDATE
  USING (user_has_role(organization_id, 'admin'));

-- Admins can remove members
CREATE POLICY "Admins can remove members"
  ON public.organization_members FOR DELETE
  USING (user_has_role(organization_id, 'admin'));

-- ============================================================================
-- NEW RLS POLICIES: Organization Invitations Table
-- ============================================================================

-- Users can view invitations for their organizations
CREATE POLICY "Members can view invitations"
  ON public.organization_invitations FOR SELECT
  USING (organization_id IN (SELECT get_user_organizations()));

-- Admins and Managers can create invitations
CREATE POLICY "Admins and Managers can create invitations"
  ON public.organization_invitations FOR INSERT
  WITH CHECK (user_has_role(organization_id, 'manager'));

-- Admins and Managers can revoke invitations
CREATE POLICY "Admins and Managers can revoke invitations"
  ON public.organization_invitations FOR UPDATE
  USING (user_has_role(organization_id, 'manager'));

-- ============================================================================
-- NEW RLS POLICIES: Clients Table
-- ============================================================================

-- All members can view clients in their organization
CREATE POLICY "Users can view clients in their organization"
  ON public.clients FOR SELECT
  USING (organization_id IN (SELECT get_user_organizations()));

-- Users and above can create clients
CREATE POLICY "Users can create clients"
  ON public.clients FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT get_user_organizations())
    AND user_has_role(organization_id, 'user')
  );

-- Users and above can update clients
CREATE POLICY "Users can update clients"
  ON public.clients FOR UPDATE
  USING (
    organization_id IN (SELECT get_user_organizations())
    AND user_has_role(organization_id, 'user')
  );

-- Only admins can delete clients
CREATE POLICY "Admins can delete clients"
  ON public.clients FOR DELETE
  USING (
    organization_id IN (SELECT get_user_organizations())
    AND user_has_role(organization_id, 'admin')
  );

-- ============================================================================
-- NEW RLS POLICIES: Vendors Table
-- ============================================================================

CREATE POLICY "Users can view vendors in their organization"
  ON public.vendors FOR SELECT
  USING (organization_id IN (SELECT get_user_organizations()));

CREATE POLICY "Users can create vendors"
  ON public.vendors FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT get_user_organizations())
    AND user_has_role(organization_id, 'user')
  );

CREATE POLICY "Users can update vendors"
  ON public.vendors FOR UPDATE
  USING (
    organization_id IN (SELECT get_user_organizations())
    AND user_has_role(organization_id, 'user')
  );

CREATE POLICY "Admins can delete vendors"
  ON public.vendors FOR DELETE
  USING (
    organization_id IN (SELECT get_user_organizations())
    AND user_has_role(organization_id, 'admin')
  );

-- ============================================================================
-- NEW RLS POLICIES: Labors Table
-- ============================================================================

CREATE POLICY "Users can view labors in their organization"
  ON public.labors FOR SELECT
  USING (organization_id IN (SELECT get_user_organizations()));

CREATE POLICY "Users can create labors"
  ON public.labors FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT get_user_organizations())
    AND user_has_role(organization_id, 'user')
  );

CREATE POLICY "Users can update labors"
  ON public.labors FOR UPDATE
  USING (
    organization_id IN (SELECT get_user_organizations())
    AND user_has_role(organization_id, 'user')
  );

CREATE POLICY "Admins can delete labors"
  ON public.labors FOR DELETE
  USING (
    organization_id IN (SELECT get_user_organizations())
    AND user_has_role(organization_id, 'admin')
  );

-- ============================================================================
-- NEW RLS POLICIES: Tasks Table
-- ============================================================================

CREATE POLICY "Users can view tasks in their organization"
  ON public.tasks FOR SELECT
  USING (organization_id IN (SELECT get_user_organizations()));

CREATE POLICY "Users can create tasks"
  ON public.tasks FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT get_user_organizations())
    AND user_has_role(organization_id, 'user')
  );

CREATE POLICY "Users can update tasks"
  ON public.tasks FOR UPDATE
  USING (
    organization_id IN (SELECT get_user_organizations())
    AND user_has_role(organization_id, 'user')
  );

-- Users can delete their own tasks, Managers and Admins can delete all
CREATE POLICY "Users can delete own tasks, Managers can delete all"
  ON public.tasks FOR DELETE
  USING (
    organization_id IN (SELECT get_user_organizations())
    AND (
      created_by = auth.uid() OR
      user_has_role(organization_id, 'manager')
    )
  );

-- ============================================================================
-- NEW RLS POLICIES: Contracts Table
-- ============================================================================

CREATE POLICY "Users can view contracts in their organization"
  ON public.contracts FOR SELECT
  USING (organization_id IN (SELECT get_user_organizations()));

CREATE POLICY "Users can create contracts"
  ON public.contracts FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT get_user_organizations())
    AND user_has_role(organization_id, 'user')
  );

CREATE POLICY "Users can update contracts"
  ON public.contracts FOR UPDATE
  USING (
    organization_id IN (SELECT get_user_organizations())
    AND user_has_role(organization_id, 'user')
  );

CREATE POLICY "Admins can delete contracts"
  ON public.contracts FOR DELETE
  USING (
    organization_id IN (SELECT get_user_organizations())
    AND user_has_role(organization_id, 'admin')
  );

-- ============================================================================
-- NEW RLS POLICIES: Payments Table
-- ============================================================================

CREATE POLICY "Users can view payments in their organization"
  ON public.payments FOR SELECT
  USING (organization_id IN (SELECT get_user_organizations()));

CREATE POLICY "Users can create payments"
  ON public.payments FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT get_user_organizations())
    AND user_has_role(organization_id, 'user')
  );

CREATE POLICY "Users can update payments"
  ON public.payments FOR UPDATE
  USING (
    organization_id IN (SELECT get_user_organizations())
    AND user_has_role(organization_id, 'user')
  );

CREATE POLICY "Admins can delete payments"
  ON public.payments FOR DELETE
  USING (
    organization_id IN (SELECT get_user_organizations())
    AND user_has_role(organization_id, 'admin')
  );

-- ============================================================================
-- NEW RLS POLICIES: Documents Table
-- ============================================================================

CREATE POLICY "Users can view documents in their organization"
  ON public.documents FOR SELECT
  USING (organization_id IN (SELECT get_user_organizations()));

CREATE POLICY "Users can upload documents"
  ON public.documents FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT get_user_organizations())
    AND user_has_role(organization_id, 'user')
  );

-- Users can update their own documents, Managers and Admins can update all
CREATE POLICY "Users can update own documents, Managers can update all"
  ON public.documents FOR UPDATE
  USING (
    organization_id IN (SELECT get_user_organizations())
    AND (
      created_by = auth.uid() OR
      user_has_role(organization_id, 'manager')
    )
  );

-- Users can delete their own documents, Managers and Admins can delete all
CREATE POLICY "Users can delete own documents, Managers can delete all"
  ON public.documents FOR DELETE
  USING (
    organization_id IN (SELECT get_user_organizations())
    AND (
      created_by = auth.uid() OR
      user_has_role(organization_id, 'manager')
    )
  );

-- ============================================================================
-- STEP 8: Verification Queries
-- ============================================================================

-- Display migration results
DO $$
DECLARE
  org_count INTEGER;
  profile_count INTEGER;
  member_count INTEGER;
  client_count INTEGER;
  vendor_count INTEGER;
  labor_count INTEGER;
  task_count INTEGER;
  contract_count INTEGER;
  payment_count INTEGER;
  document_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO org_count FROM public.organizations;
  SELECT COUNT(*) INTO profile_count FROM public.user_profiles;
  SELECT COUNT(*) INTO member_count FROM public.organization_members;
  SELECT COUNT(*) INTO client_count FROM public.clients WHERE organization_id IS NOT NULL;
  SELECT COUNT(*) INTO vendor_count FROM public.vendors WHERE organization_id IS NOT NULL;
  SELECT COUNT(*) INTO labor_count FROM public.labors WHERE organization_id IS NOT NULL;
  SELECT COUNT(*) INTO task_count FROM public.tasks WHERE organization_id IS NOT NULL;
  SELECT COUNT(*) INTO contract_count FROM public.contracts WHERE organization_id IS NOT NULL;
  SELECT COUNT(*) INTO payment_count FROM public.payments WHERE organization_id IS NOT NULL;
  SELECT COUNT(*) INTO document_count FROM public.documents WHERE organization_id IS NOT NULL;

  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'MIGRATION VERIFICATION RESULTS';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Organizations:        %', org_count;
  RAISE NOTICE 'User Profiles:        %', profile_count;
  RAISE NOTICE 'Organization Members: %', member_count;
  RAISE NOTICE '--------------------------------------------';
  RAISE NOTICE 'Migrated Data:';
  RAISE NOTICE '  Clients:            %', client_count;
  RAISE NOTICE '  Vendors:            %', vendor_count;
  RAISE NOTICE '  Labors:             %', labor_count;
  RAISE NOTICE '  Tasks:              %', task_count;
  RAISE NOTICE '  Contracts:          %', contract_count;
  RAISE NOTICE '  Payments:           %', payment_count;
  RAISE NOTICE '  Documents:          %', document_count;
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
END $$;

-- ============================================================================
-- MIGRATION COMPLETE!
-- ============================================================================
-- Next Steps:
-- 1. Verify migration results above
-- 2. Test login with manisha@designs.com
-- 3. Check that existing data is visible
-- 4. Deploy updated frontend application code
-- 5. Create additional user accounts and test role permissions
-- ============================================================================
