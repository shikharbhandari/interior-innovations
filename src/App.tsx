import { Switch, Route, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth";
import Dashboard from "@/pages/dashboard";
import Clients from "@/pages/clients";
import Vendors from "@/pages/vendors";
import Tasks from "@/pages/tasks";
import { Sidebar } from "@/components/layout/sidebar";
import { Navbar } from "@/components/layout/navbar";
import { useEffect } from "react";
import ClientDetails from "@/pages/client-details";
import ClientFinancials from "@/pages/client-financials";
import ClientDocuments from "@/pages/client-documents";
import VendorDetails from "@/pages/vendor-details";
import LaborDetails from "@/pages/labor-details";
import Labors from "@/pages/labors";
import Exports from "@/pages/exports";
import Contracts from "@/pages/contracts";
import ContractDetails from "@/pages/contract-details";
import Documents from "@/pages/documents";
import OrganizationSettings from "@/pages/organization-settings";
import SuperAdminDashboard from "@/pages/super-admin-dashboard";
import Leads from "@/pages/leads";
import LeadDetails from "@/pages/lead-details";

function PrivateRoute({ component: Component }: { component: React.ComponentType }) {
  const [, setLocation] = useLocation();
  const { user, currentOrganization, loading, isSuperAdmin } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      setLocation('/auth');
    }
  }, [user, loading, setLocation]);

  useEffect(() => {
    // Redirect super admins with no organization to super admin dashboard
    if (!loading && user && isSuperAdmin && !currentOrganization) {
      setLocation('/super-admin');
    }
  }, [user, loading, isSuperAdmin, currentOrganization, setLocation]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-white to-primary/5">
        <div className="text-lg font-medium text-primary/80">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  // Show error if user has no organization (unless they're a super admin)
  if (!currentOrganization && !isSuperAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-white to-primary/5">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">No Organization</h2>
          <p className="text-gray-600 mb-4">You are not a member of any organization.</p>
          <p className="text-sm text-gray-500">Please contact your administrator.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white to-primary/5">
      <Sidebar />
      <Navbar />
      <main className="lg:pl-72 pt-16">
        <div className="mx-auto max-w-7xl p-4 lg:p-8">
          <Component />
        </div>
      </main>
    </div>
  );
}

// Special route for super admin that doesn't require organization membership
function SuperAdminRoute({ component: Component }: { component: React.ComponentType }) {
  const [, setLocation] = useLocation();
  const { user, isSuperAdmin, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      setLocation('/auth');
    }
  }, [user, loading, setLocation]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-white to-primary/5">
        <div className="text-lg font-medium text-primary/80">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-white to-primary/5">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Access Denied</h2>
          <p className="text-gray-600 mb-4">You don't have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white to-primary/5">
      <Sidebar />
      <Navbar />
      <main className="lg:pl-72 pt-16">
        <div className="mx-auto max-w-7xl p-4 lg:p-8">
          <Component />
        </div>
      </main>
    </div>
  );
}

function Router() {
  const [, setLocation] = useLocation();

  // Redirect to /auth on initial load if at root
  useEffect(() => {
    if (window.location.pathname === '/') {
      setLocation('/auth');
    }
  }, [setLocation]);

  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      <Route path="/dashboard" component={() => <PrivateRoute component={Dashboard} />} />
      <Route path="/clients" component={() => <PrivateRoute component={Clients} />} />
      <Route path="/clients/:id/financials" component={() => <PrivateRoute component={ClientFinancials} />} />
      <Route path="/clients/:id/documents" component={() => <PrivateRoute component={ClientDocuments} />} />
      <Route path="/clients/:id" component={() => <PrivateRoute component={ClientDetails} />} />
      <Route path="/leads" component={() => <PrivateRoute component={Leads} />} />
      <Route path="/leads/:id" component={() => <PrivateRoute component={LeadDetails} />} />
      <Route path="/vendors" component={() => <PrivateRoute component={Vendors} />} />
      <Route path="/vendors/:id" component={() => <PrivateRoute component={VendorDetails} />} />
      <Route path="/labors" component={() => <PrivateRoute component={Labors} />} />
      <Route path="/labors/:id" component={() => <PrivateRoute component={LaborDetails} />} />
      <Route path="/tasks" component={() => <PrivateRoute component={Tasks} />} />
      <Route path="/exports" component={() => <PrivateRoute component={Exports} />} />
      <Route path="/contracts" component={() => <PrivateRoute component={Contracts} />} />
      <Route path="/contracts/:id" component={() => <PrivateRoute component={ContractDetails} />} />
      <Route path="/documents" component={() => <PrivateRoute component={Documents} />} />
      <Route path="/settings" component={() => <PrivateRoute component={OrganizationSettings} />} />
      <Route path="/settings/organization/:orgId" component={() => <SuperAdminRoute component={OrganizationSettings} />} />
      <Route path="/super-admin" component={() => <SuperAdminRoute component={SuperAdminDashboard} />} />
      <Route path="/" component={AuthPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;