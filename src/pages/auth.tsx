import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { useLocation } from 'wouter';
import { useEffect } from 'react';

export default function AuthPage() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Check if user is already authenticated
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setLocation('/dashboard');
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        setLocation('/dashboard');
      }
    });

    return () => subscription.unsubscribe();
  }, [setLocation]);

  const SUPER_ADMIN_COLOR = '#001D39';

  return (
    <div className="min-h-screen w-full flex">
      {/* Left Panel - Branding */}
      <div
        className="hidden md:flex md:w-1/2 items-center justify-center p-8"
        style={{ background: `linear-gradient(135deg, ${SUPER_ADMIN_COLOR}0d, ${SUPER_ADMIN_COLOR}33)` }}
      >
        <div className="text-center">
          <h1 className="text-4xl font-light mb-2" style={{ color: SUPER_ADMIN_COLOR }}>Dezfin</h1>
          <p className="text-xl font-light" style={{ color: `${SUPER_ADMIN_COLOR}cc` }}>Less spreadsheets. More square feet.</p>
        </div>
      </div>

      {/* Right Panel - Auth Form */}
      <div className="w-full md:w-1/2 flex items-center justify-center p-8 bg-white">
        <Card className="w-full max-w-md shadow-none border-none">
          <CardContent className="pt-6">
            <div className="mb-8 text-center md:hidden">
              <h1 className="text-2xl font-light mb-1" style={{ color: SUPER_ADMIN_COLOR }}>Dezfin</h1>
              <p className="text-sm font-light" style={{ color: `${SUPER_ADMIN_COLOR}cc` }}>Less spreadsheets. More square feet.</p>
            </div>
            <Auth
              supabaseClient={supabase}
              view="sign_in"
              showLinks={false}
              appearance={{
                theme: ThemeSupa,
                variables: {
                  default: {
                    colors: {
                      brand: SUPER_ADMIN_COLOR,
                      brandAccent: '#002d5a',
                    },
                  },
                },
                className: {
                  container: 'w-full',
                  button: 'w-full px-4 py-2.5 text-white transition-colors',
                  input: 'w-full px-3 py-2 border rounded-md',
                  label: 'text-sm font-medium text-gray-700',
                },
              }}
              providers={[]}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}