import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';

// Types
interface Organization {
  id: string;
  name: string;
  slug: string;
  brand_color: string;
  brand_color_2: string;
  brand_color_3: string;
}

interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: 'admin' | 'manager' | 'user' | 'viewer';
  organizations: Organization;
}

interface AuthContextType {
  user: User | null;
  currentOrganization: OrganizationMember | null;
  organizations: OrganizationMember[];
  loading: boolean;
  isSuperAdmin: boolean;
  switchOrganization: (orgMemberId: string) => void;
  hasPermission: (resource: string, action: 'create' | 'read' | 'update' | 'delete') => boolean;
  isAdmin: boolean;
  isManager: boolean;
  isUser: boolean;
  isViewer: boolean;
  refetchOrganizations: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationMember[]>([]);
  const [currentOrganization, setCurrentOrganization] = useState<OrganizationMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Load user's organizations
  const loadOrganizations = async (userId: string) => {
    try {
      // Check if user is super admin
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('is_super_admin')
        .eq('id', userId)
        .single();

      if (!profileError && profile) {
        setIsSuperAdmin(profile.is_super_admin || false);
      }

      const { data, error } = await supabase
        .from('organization_members')
        .select(`
          id,
          organization_id,
          user_id,
          role,
          organizations (
            id,
            name,
            slug,
            brand_color,
            brand_color_2,
            brand_color_3
          )
        `)
        .eq('user_id', userId)
        .eq('status', 'active');

      if (error) throw error;

      const orgs = data as unknown as OrganizationMember[];
      setOrganizations(orgs || []);

      // Set current organization from localStorage or first available
      const savedOrgId = localStorage.getItem('currentOrganizationId');
      const defaultOrg = savedOrgId
        ? orgs?.find(org => org.id === savedOrgId) || orgs?.[0]
        : orgs?.[0];

      setCurrentOrganization(defaultOrg || null);
    } catch (error) {
      console.error('Error loading organizations:', error);
      setOrganizations([]);
      setCurrentOrganization(null);
      setIsSuperAdmin(false);
    } finally {
      setLoading(false);
    }
  };

  // Refetch organizations (useful after joining a new org)
  const refetchOrganizations = async () => {
    if (user) {
      await loadOrganizations(user.id);
    }
  };

  // Initialize auth state
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadOrganizations(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadOrganizations(session.user.id);
      } else {
        setOrganizations([]);
        setCurrentOrganization(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Switch organization
  const switchOrganization = (orgMemberId: string) => {
    const org = organizations.find(o => o.id === orgMemberId);
    if (org) {
      setCurrentOrganization(org);
      localStorage.setItem('currentOrganizationId', orgMemberId);
    }
  };

  // Permission checking based on role
  const hasPermission = (resource: string, action: 'create' | 'read' | 'update' | 'delete'): boolean => {
    if (!currentOrganization) return false;

    const role = currentOrganization.role;

    // Admin has all permissions
    if (role === 'admin') return true;

    // Viewer can only read
    if (role === 'viewer') return action === 'read';

    // User permissions
    if (role === 'user') {
      if (action === 'read' || action === 'create' || action === 'update') return true;
      // Users can delete their own tasks and documents (handled at component level)
      if (action === 'delete' && ['tasks', 'documents'].includes(resource)) return true;
      return false;
    }

    // Manager has most permissions
    if (role === 'manager') {
      // Managers cannot delete clients, contracts, or payments
      if (action === 'delete' && ['clients', 'contracts', 'payments', 'vendors', 'labors'].includes(resource)) {
        return false;
      }
      return true;
    }

    return false;
  };

  // Role helper flags
  const isAdmin = currentOrganization?.role === 'admin';
  const isManager = currentOrganization?.role === 'manager';
  const isUser = currentOrganization?.role === 'user';
  const isViewer = currentOrganization?.role === 'viewer';

  return (
    <AuthContext.Provider
      value={{
        user,
        currentOrganization,
        organizations,
        loading,
        isSuperAdmin,
        switchOrganization,
        hasPermission,
        isAdmin,
        isManager,
        isUser,
        isViewer,
        refetchOrganizations,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
