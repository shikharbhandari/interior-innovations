import { useEffect, useState } from "react";
import { BellIcon, UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

export function Navbar() {
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserEmail(session?.user?.email ?? null);
    });
  }, []);

  return (
    <div className="fixed top-0 right-0 left-0 lg:left-72 h-16 border-b bg-brand text-white z-30">
      <div className="flex h-full items-center justify-between px-4 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="hidden lg:block">
            <h1 className="text-sm font-light">Interior Innovations</h1>
            <p className="text-xs text-white/80">by Manisha Jain</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="text-white/80 hover:text-white hover:bg-white/10 transition-colors">
            <BellIcon className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2 text-sm">
            <UserCircle className="h-8 w-8 text-white/80" />
            <span className="hidden sm:inline text-white/90 font-medium">
              {userEmail}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}