import { Switch, Route, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth";
import Dashboard from "@/pages/dashboard";
import Clients from "@/pages/clients";
import Vendors from "@/pages/vendors";
import Tasks from "@/pages/tasks";
import { Sidebar } from "@/components/layout/sidebar";
import { Navbar } from "@/components/layout/navbar";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import ClientDetails from "@/pages/client-details";
import VendorDetails from "@/pages/vendor-details";
import LaborDetails from "@/pages/labor-details";
import Labors from "@/pages/labors";
import Exports from "@/pages/exports";
import Contracts from "@/pages/contracts";
import ContractDetails from "@/pages/contract-details";
import Documents from "@/pages/documents";

function PrivateRoute({ component: Component }: { component: React.ComponentType }) {
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthenticated(!!session);
      setLoading(false);
      if (!session) {
        setLocation('/auth');
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        setAuthenticated(true);
      } else if (event === 'SIGNED_OUT') {
        setAuthenticated(false);
        setLocation('/auth');
      }
    });

    return () => subscription.unsubscribe();
  }, [setLocation]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-white to-primary/5">
        <div className="text-lg font-medium text-primary/80">Loading...</div>
      </div>
    );
  }

  if (!authenticated) {
    return null;
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
      <Route path="/clients/:id" component={() => <PrivateRoute component={ClientDetails} />} />
      <Route path="/vendors" component={() => <PrivateRoute component={Vendors} />} />
      <Route path="/vendors/:id" component={() => <PrivateRoute component={VendorDetails} />} />
      <Route path="/labors" component={() => <PrivateRoute component={Labors} />} />
      <Route path="/labors/:id" component={() => <PrivateRoute component={LaborDetails} />} />
      <Route path="/tasks" component={() => <PrivateRoute component={Tasks} />} />
      <Route path="/exports" component={() => <PrivateRoute component={Exports} />} />
      <Route path="/contracts" component={() => <PrivateRoute component={Contracts} />} />
      <Route path="/contracts/:id" component={() => <PrivateRoute component={ContractDetails} />} />
      <Route path="/documents" component={() => <PrivateRoute component={Documents} />} />
      <Route path="/" component={AuthPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;