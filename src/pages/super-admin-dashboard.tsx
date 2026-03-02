import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useBrandColor } from "@/hooks/use-brand-color";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, Building2, Users, Briefcase, Truck, HardHat, Settings as SettingsIcon } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";

interface OrganizationStats {
  id: string;
  name: string;
  slug: string;
  status: string;
  created_at: string;
  active_members: number;
  total_clients: number;
  total_vendors: number;
  total_labors: number;
  total_contracts: number;
  total_tasks: number;
  admin_email: string | null;
}

export default function SuperAdminDashboard() {
  const { isSuperAdmin, user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [createOrgOpen, setCreateOrgOpen] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [orgBrandColor, setOrgBrandColor] = useState("#eab308");
  const [orgBrandColor2, setOrgBrandColor2] = useState("#6b7280");
  const [orgBrandColor3, setOrgBrandColor3] = useState("#94a3b8");

  // Get brand color from centralized hook (super admin theme)
  const { brandColor } = useBrandColor();

  // Fetch all organizations with stats
  const { data: organizations, isLoading } = useQuery({
    queryKey: ['super-admin-organizations'],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('organization_stats')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as OrganizationStats[];
    },
    enabled: !!user && isSuperAdmin,
  });

  // Create organization mutation
  const createOrgMutation = useMutation({
    mutationFn: async ({ name, slug, brand_color, brand_color_2, brand_color_3 }: { name: string; slug: string; brand_color: string; brand_color_2: string; brand_color_3: string }) => {
      if (!user) throw new Error('Not authenticated');

      // Create organization
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .insert({
          name: name,
          slug: slug,
          brand_color: brand_color,
          brand_color_2: brand_color_2,
          brand_color_3: brand_color_3,
          status: 'active',
        })
        .select()
        .single();

      if (orgError) throw orgError;
      return org;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-organizations'] });
      setCreateOrgOpen(false);
      setOrgName("");
      setOrgSlug("");
      setOrgBrandColor("#eab308");
      setOrgBrandColor2("#6b7280");
      setOrgBrandColor3("#94a3b8");
      toast({
        title: "Success",
        description: "Organization created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  });

  const handleCreateOrg = () => {
    if (!orgName || !orgSlug) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please fill in all fields",
      });
      return;
    }
    createOrgMutation.mutate({ name: orgName, slug: orgSlug, brand_color: orgBrandColor, brand_color_2: orgBrandColor2, brand_color_3: orgBrandColor3 });
  };

  const handleSlugChange = (name: string) => {
    // Auto-generate slug from name
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    setOrgSlug(slug);
  };

  if (!isSuperAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-gray-600">
              You don't have permission to access the super admin dashboard.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Dezfin</h1>
          <p className="text-sm text-gray-600 mt-1">
            Super Admin Console — manage all organizations and view platform statistics
          </p>
        </div>
        <Dialog open={createOrgOpen} onOpenChange={setCreateOrgOpen}>
          <DialogTrigger asChild>
            <Button
              size="lg"
              style={{ backgroundColor: brandColor, borderColor: brandColor }}
              className="text-white hover:opacity-90"
            >
              <Plus className="h-5 w-5 mr-2" />
              Create Organization
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Organization</DialogTitle>
              <DialogDescription>
                Create a new organization for a customer. You'll need to add an admin user after creation.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Organization Name</Label>
                <Input
                  id="name"
                  placeholder="Acme Interior Design"
                  value={orgName}
                  onChange={(e) => {
                    setOrgName(e.target.value);
                    handleSlugChange(e.target.value);
                  }}
                />
              </div>
              <div>
                <Label htmlFor="slug">Slug (URL identifier)</Label>
                <Input
                  id="slug"
                  placeholder="acme-interior-design"
                  value={orgSlug}
                  onChange={(e) => setOrgSlug(e.target.value)}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Used in URLs and must be unique. Only lowercase letters, numbers, and hyphens.
                </p>
              </div>
              <div>
                <Label htmlFor="brand_color">Brand Color 1 (Primary — buttons, nav)</Label>
                <div className="flex gap-3 items-center">
                  <input
                    id="brand_color"
                    type="color"
                    value={orgBrandColor}
                    onChange={(e) => setOrgBrandColor(e.target.value)}
                    className="h-10 w-20 rounded border border-input cursor-pointer"
                  />
                  <Input
                    type="text"
                    value={orgBrandColor}
                    onChange={(e) => setOrgBrandColor(e.target.value)}
                    placeholder="#eab308"
                    className="flex-1"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="brand_color_2">Brand Color 2 (Charts &amp; accents)</Label>
                <div className="flex gap-3 items-center">
                  <input
                    id="brand_color_2"
                    type="color"
                    value={orgBrandColor2}
                    onChange={(e) => setOrgBrandColor2(e.target.value)}
                    className="h-10 w-20 rounded border border-input cursor-pointer"
                  />
                  <Input
                    type="text"
                    value={orgBrandColor2}
                    onChange={(e) => setOrgBrandColor2(e.target.value)}
                    placeholder="#6b7280"
                    className="flex-1"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="brand_color_3">Brand Color 3 (Charts &amp; stage cards)</Label>
                <div className="flex gap-3 items-center">
                  <input
                    id="brand_color_3"
                    type="color"
                    value={orgBrandColor3}
                    onChange={(e) => setOrgBrandColor3(e.target.value)}
                    className="h-10 w-20 rounded border border-input cursor-pointer"
                  />
                  <Input
                    type="text"
                    value={orgBrandColor3}
                    onChange={(e) => setOrgBrandColor3(e.target.value)}
                    placeholder="#94a3b8"
                    className="flex-1"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Colors 1, 2, and 3 are used across charts and stage cards.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOrgOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateOrg}
                style={{ backgroundColor: brandColor, borderColor: brandColor }}
                className="text-white hover:opacity-90"
                disabled={createOrgMutation.isPending}
              >
                {createOrgMutation.isPending ? "Creating..." : "Create Organization"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Platform Statistics */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Organizations</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{organizations?.length || 0}</div>
            <p className="text-xs text-muted-foreground">
              Active customer organizations
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {organizations?.reduce((sum, org) => sum + (org.active_members || 0), 0) || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Across all organizations
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Organizations Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Organizations</CardTitle>
          <CardDescription>View and manage all customer organizations</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organization</TableHead>
                <TableHead>Admin</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Clients</TableHead>
                <TableHead>Vendors</TableHead>
                <TableHead>Labors</TableHead>
                <TableHead>Contracts</TableHead>
                <TableHead>Tasks</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {organizations?.map((org) => (
                <TableRow key={org.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{org.name}</div>
                      <div className="text-sm text-gray-500">{org.slug}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{org.admin_email || 'No admin'}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Users className="h-3 w-3 text-gray-500" />
                      <span>{org.active_members || 0}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Briefcase className="h-3 w-3 text-gray-500" />
                      <span>{org.total_clients || 0}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Truck className="h-3 w-3 text-gray-500" />
                      <span>{org.total_vendors || 0}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <HardHat className="h-3 w-3 text-gray-500" />
                      <span>{org.total_labors || 0}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span>{org.total_contracts || 0}</span>
                  </TableCell>
                  <TableCell>
                    <span>{org.total_tasks || 0}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={org.status === 'active' ? 'default' : 'secondary'}>
                      {org.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-gray-600">
                      {new Date(org.created_at).toLocaleDateString()}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      style={{ borderColor: brandColor, color: brandColor }}
                      className="hover:opacity-80"
                      onClick={() => setLocation(`/settings/organization/${org.id}`)}
                    >
                      <SettingsIcon className="h-3 w-3 mr-1" />
                      Manage
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
