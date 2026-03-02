import { UserCircle, Building2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useBrandColor } from "@/hooks/use-brand-color";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export function Navbar() {
  const { user, currentOrganization, organizations, switchOrganization, isSuperAdmin } = useAuth();

  // Get brand color from centralized hook
  const { brandColor } = useBrandColor();

  return (
    <div
      className="fixed top-0 right-0 left-0 lg:left-72 h-16 border-b text-white z-30"
      style={{ backgroundColor: brandColor }}
    >
      <div className="flex h-full items-center justify-between px-4 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="hidden lg:block">
            <h1 className="text-sm font-light">
              {currentOrganization?.organizations?.name || 'Dezfin'}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* Organization Switcher */}
          {currentOrganization && organizations.length > 0 && (
            <div className="flex items-center gap-2 bg-white/10 rounded-md px-3 py-1.5">
              <Building2 className="h-4 w-4 text-white/80" />
              {organizations.length > 1 ? (
                <Select
                  value={currentOrganization.id}
                  onValueChange={switchOrganization}
                >
                  <SelectTrigger className="border-none bg-transparent text-white focus:ring-0 focus:ring-offset-0 h-auto p-0 min-w-[200px] hover:bg-white/10">
                    <SelectValue>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{currentOrganization.organizations.name}</span>
                        <Badge variant="secondary" className="text-xs bg-white/20 text-white border-none">
                          {currentOrganization.role}
                        </Badge>
                      </div>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {organizations.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        <div className="flex items-center gap-2">
                          <span>{org.organizations.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {org.role}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">{currentOrganization.organizations.name}</span>
                  <Badge variant="secondary" className="text-xs bg-white/20 text-white border-none">
                    {currentOrganization.role}
                  </Badge>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 text-sm">
            <UserCircle className="h-8 w-8 text-white/80" />
            <span className="hidden sm:inline text-white/90 font-medium">
              {user?.email}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}