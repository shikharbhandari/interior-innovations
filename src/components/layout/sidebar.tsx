import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  LayoutDashboard,
  Users,
  Truck,
  Clipboard,
  HardHat,
  LogOut,
  Menu,
  Download,
  FileText
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";

export function Sidebar() {
  const [location] = useLocation();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        variant: "destructive",
        title: "Error signing out",
        description: error.message
      });
    }
  };

  const links = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/clients", label: "Clients", icon: Users },
    { href: "/vendors", label: "Vendors", icon: Truck },
    { href: "/labors", label: "Labors", icon: HardHat },
    { href: "/contracts", label: "Contracts", icon: FileText },
    { href: "/tasks", label: "Tasks", icon: Clipboard },
    { href: "/exports", label: "Exports", icon: Download },
  ];

  const SidebarContent = () => (
    <div className="flex h-full flex-col bg-gradient-to-b from-primary/5 to-primary/10">
      <div className="flex h-16 items-center border-b bg-white/50 px-6">
        <h2 className="text-xl font-semibold text-primary">Interior Innovations</h2>
      </div>
      <ScrollArea className="flex-1 py-4">
        <div className="space-y-2 px-3">
          {links.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}>
              <Button
                variant={location === href ? "secondary" : "ghost"}
                className={cn(
                  "w-full justify-start gap-3 text-base font-medium",
                  location === href ?
                    "bg-brand hover:bg-brand-dark text-white" :
                    "text-gray-600 hover:bg-brand/10 hover:text-brand-dark"
                )}
                onClick={() => setIsOpen(false)}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Button>
            </Link>
          ))}
        </div>
      </ScrollArea>
      <div className="border-t bg-white/50 p-4">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-base font-medium text-red-600 hover:bg-red-50 hover:text-red-700"
          onClick={handleSignOut}
        >
          <LogOut className="h-5 w-5" />
          Sign Out
        </Button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <>
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="fixed top-4 left-4 lg:hidden z-50 bg-white shadow-md hover:bg-brand/5"
            >
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-72">
            <SidebarContent />
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-72 lg:flex-col border-r">
      <SidebarContent />
    </div>
  );
}