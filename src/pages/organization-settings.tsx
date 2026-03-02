import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useBrandColor } from "@/hooks/use-brand-color";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash, Shield, Mail, UserCheck, Clock, Pencil, ChevronUp, ChevronDown, Layers } from "lucide-react";
import { useRoute } from "wouter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

interface OrganizationMember {
  id: string;
  user_id: string;
  role: 'admin' | 'manager' | 'user' | 'viewer';
  joined_at: string;
  user_profiles: {
    email: string;
    full_name: string | null;
  };
}

export default function OrganizationSettings() {
  const [, params] = useRoute("/settings/organization/:orgId");
  const { currentOrganization, user, isAdmin, isSuperAdmin, refetchOrganizations } = useAuth();
  const { toast } = useToast();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<'admin' | 'manager' | 'user' | 'viewer'>('user');
  const [memberToRemove, setMemberToRemove] = useState<OrganizationMember | null>(null);
  const [editBrandColor, setEditBrandColor] = useState("#eab308");
  const [editBrandColor2, setEditBrandColor2] = useState("#6b7280");
  const [editBrandColor3, setEditBrandColor3] = useState("#94a3b8");

  // Lead stages state
  const [stageDialogOpen, setStageDialogOpen] = useState(false);
  const [newStageName, setNewStageName] = useState('');
  const [newStageColor, setNewStageColor] = useState('#6b7280');

  // Lead sources state
  const [newSourceName, setNewSourceName] = useState('');

  // Project stages state
  const [projectStageDialogOpen, setProjectStageDialogOpen] = useState(false);
  const [editingProjectStage, setEditingProjectStage] = useState<any | null>(null);
  const [psName, setPsName] = useState('');
  const [psColor, setPsColor] = useState('#6b7280');
  const [psFee, setPsFee] = useState('0');

  // Get brand color from centralized hook
  const { brandColor } = useBrandColor();

  // For super admin accessing via URL param
  const orgId = params?.orgId || currentOrganization?.organization_id;
  const canManage = isAdmin || isSuperAdmin;

  // Fetch organization details
  const { data: orgDetails } = useQuery({
    queryKey: ['organization-details', orgId],
    queryFn: async () => {
      if (!orgId) throw new Error('No organization ID');

      const { data, error } = await supabase
        .from('organizations')
        .select('id, name, slug, brand_color, brand_color_2, brand_color_3')
        .eq('id', orgId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!orgId && canManage,
  });

  // Get the organization name to display
  const displayOrgName = currentOrganization?.organizations.name || orgDetails?.name || 'Organization';

  // Sync brand color state when org data loads
  useEffect(() => {
    const color = orgDetails?.brand_color || currentOrganization?.organizations?.brand_color;
    if (color) setEditBrandColor(color);
    const color2 = orgDetails?.brand_color_2 || currentOrganization?.organizations?.brand_color_2;
    if (color2) setEditBrandColor2(color2);
    const color3 = orgDetails?.brand_color_3 || currentOrganization?.organizations?.brand_color_3;
    if (color3) setEditBrandColor3(color3);
  }, [orgDetails, currentOrganization]);

  // Update brand color mutation (super admin only)
  const updateBrandColorMutation = useMutation({
    mutationFn: async ({ brand_color, brand_color_2, brand_color_3 }: { brand_color: string; brand_color_2: string; brand_color_3: string }) => {
      if (!orgId) throw new Error('No organization ID');
      const { error } = await supabase
        .from('organizations')
        .update({ brand_color, brand_color_2, brand_color_3 })
        .eq('id', orgId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await refetchOrganizations();
      queryClient.invalidateQueries({ queryKey: ['organization-details', orgId] });
      queryClient.invalidateQueries({ queryKey: ['super-admin-organizations'] });
      toast({ title: "Success", description: "Brand color updated successfully" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  // Fetch organization members
  const { data: members, isLoading } = useQuery({
    queryKey: ['organization-members', orgId],
    queryFn: async () => {
      if (!orgId) throw new Error('No organization ID');

      const { data, error } = await supabase
        .from('organization_members')
        .select(`
          id,
          user_id,
          role,
          joined_at,
          user_profiles!organization_members_user_id_fkey (
            email,
            full_name
          )
        `)
        .eq('organization_id', orgId)
        .eq('status', 'active')
        .order('joined_at', { ascending: true });

      if (error) throw error;
      return data as OrganizationMember[];
    },
    enabled: !!orgId && canManage,
  });

  // Invite user mutation (simplified - just adds them directly if they exist)
  const inviteMutation = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: string }) => {
      if (!orgId || !user) throw new Error('Not authorized');

      // Check if user exists in auth.users
      const { data: authUsers, error: authError } = await supabase.rpc('get_user_by_email', { email_param: email });

      // For now, we'll just check if user profile exists
      const { data: existingUser, error: userError } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('email', email)
        .single();

      if (userError && userError.code !== 'PGRST116') {
        throw new Error('Failed to check user');
      }

      if (!existingUser) {
        throw new Error('User must sign up first. Ask them to create an account, then add them here.');
      }

      // Check if already a member
      const { data: existingMember } = await supabase
        .from('organization_members')
        .select('id')
        .eq('organization_id', orgId)
        .eq('user_id', existingUser.id)
        .single();

      if (existingMember) {
        throw new Error('User is already a member of this organization');
      }

      // Add to organization
      const { error: insertError } = await supabase
        .from('organization_members')
        .insert({
          organization_id: orgId,
          user_id: existingUser.id,
          role: role,
          invited_by: user.id,
          status: 'active',
        });

      if (insertError) throw insertError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-members'] });
      queryClient.invalidateQueries({ queryKey: ['super-admin-organizations'] });
      setInviteOpen(false);
      setInviteEmail("");
      setInviteRole('user');
      toast({
        title: "Success",
        description: "User added to organization successfully",
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

  // Change role mutation
  const changeRoleMutation = useMutation({
    mutationFn: async ({ memberId, newRole }: { memberId: string; newRole: string }) => {
      const { error } = await supabase
        .from('organization_members')
        .update({ role: newRole })
        .eq('id', memberId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-members'] });
      toast({
        title: "Success",
        description: "Member role updated successfully",
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

  // Remove member mutation
  const removeMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase
        .from('organization_members')
        .delete()
        .eq('id', memberId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-members'] });
      queryClient.invalidateQueries({ queryKey: ['super-admin-organizations'] });
      setMemberToRemove(null);
      toast({
        title: "Success",
        description: "Member removed from organization",
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

  // Lead stages query
  const { data: stagesData } = useQuery({
    queryKey: ['lead-stages', orgId],
    queryFn: async () => {
      if (!orgId) throw new Error('No organization ID');
      const { data, error } = await supabase
        .from('lead_stages')
        .select('*')
        .eq('organization_id', orgId)
        .order('sort_order');
      if (error) throw error;
      return data;
    },
    enabled: !!orgId && canManage,
  });

  // Lead sources query
  const { data: sourcesData } = useQuery({
    queryKey: ['lead-sources', orgId],
    queryFn: async () => {
      if (!orgId) throw new Error('No organization ID');
      const { data, error } = await supabase
        .from('lead_sources')
        .select('*')
        .eq('organization_id', orgId)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!orgId && canManage,
  });

  const createStageMutation = useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      if (!orgId || !user) throw new Error('Not authorized');
      const maxOrder = stagesData ? Math.max(0, ...stagesData.map((s: any) => s.sort_order)) : 0;
      const { error } = await supabase.from('lead_stages').insert({
        organization_id: orgId,
        name,
        color,
        sort_order: maxOrder + 1,
        created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-stages', orgId] });
      setStageDialogOpen(false);
      setNewStageName('');
      setNewStageColor('#6b7280');
      toast({ title: "Success", description: "Stage added successfully" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  });

  const deleteStageMutation = useMutation({
    mutationFn: async (stageId: string) => {
      const { error } = await supabase.from('lead_stages').delete().eq('id', stageId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-stages', orgId] });
      toast({ title: "Success", description: "Stage deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  });

  const createSourceMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!orgId || !user) throw new Error('Not authorized');
      const { error } = await supabase.from('lead_sources').insert({
        organization_id: orgId,
        name,
        created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-sources', orgId] });
      setNewSourceName('');
      toast({ title: "Success", description: "Source added successfully" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  });

  const deleteSourceMutation = useMutation({
    mutationFn: async (sourceId: string) => {
      const { error } = await supabase.from('lead_sources').delete().eq('id', sourceId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-sources', orgId] });
      toast({ title: "Success", description: "Source deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  });

  // ── Project Stages ───────────────────────────────────────────────────────────

  const { data: orgProjectStages = [] } = useQuery({
    queryKey: ['org-project-stages', orgId],
    queryFn: async () => {
      if (!orgId) throw new Error('No organization ID');
      const { data, error } = await supabase
        .from('organization_project_stages')
        .select('*')
        .eq('organization_id', orgId)
        .order('display_order');
      if (error) throw error;
      return data as any[];
    },
    enabled: !!orgId && canManage,
    refetchOnMount: 'always',
  });

  const totalProjectStageFee = orgProjectStages.reduce((sum: number, s: any) => sum + Number(s.fee_percentage || 0), 0);

  const openProjectStageDialog = (stage?: any) => {
    setEditingProjectStage(stage || null);
    setPsName(stage?.name || '');
    setPsColor(stage?.color || '#6b7280');
    setPsFee(stage ? String(stage.fee_percentage) : '0');
    setProjectStageDialogOpen(true);
  };

  const saveProjectStageMutation = useMutation({
    mutationFn: async () => {
      if (!orgId || !user) throw new Error('Not authorized');
      if (!psName.trim()) throw new Error('Stage name is required');
      const payload = {
        organization_id: orgId,
        name: psName.trim(),
        fee_percentage: Number(psFee) || 0,
        color: psColor,
      };
      if (editingProjectStage) {
        const { error } = await supabase
          .from('organization_project_stages')
          .update({ name: payload.name, fee_percentage: payload.fee_percentage, color: payload.color })
          .eq('id', editingProjectStage.id);
        if (error) throw error;
      } else {
        const maxOrder = orgProjectStages.length > 0
          ? Math.max(...orgProjectStages.map((s: any) => s.display_order))
          : -1;
        const { error } = await supabase
          .from('organization_project_stages')
          .insert({ ...payload, display_order: maxOrder + 1 });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-project-stages', orgId] });
      setProjectStageDialogOpen(false);
      toast({ title: "Success", description: editingProjectStage ? "Stage updated" : "Stage added" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  });

  const deleteProjectStageMutation = useMutation({
    mutationFn: async (stageId: number) => {
      const { error } = await supabase.from('organization_project_stages').delete().eq('id', stageId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-project-stages', orgId] });
      toast({ title: "Success", description: "Stage deleted" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  });

  const reorderProjectStageMutation = useMutation({
    mutationFn: async ({ id, direction }: { id: number; direction: 'up' | 'down' }) => {
      const sorted = [...orgProjectStages].sort((a, b) => a.display_order - b.display_order);
      const idx = sorted.findIndex((s: any) => s.id === id);
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= sorted.length) return;
      const a = sorted[idx];
      const b = sorted[swapIdx];
      await Promise.all([
        supabase.from('organization_project_stages').update({ display_order: b.display_order }).eq('id', a.id),
        supabase.from('organization_project_stages').update({ display_order: a.display_order }).eq('id', b.id),
      ]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-project-stages', orgId] });
    },
  });

  const handleInvite = () => {
    if (!inviteEmail) return;
    inviteMutation.mutate({ email: inviteEmail, role: inviteRole });
  };

  const handleRoleChange = (memberId: string, newRole: string) => {
    changeRoleMutation.mutate({ memberId, newRole });
  };

  const handleRemoveMember = () => {
    if (!memberToRemove) return;
    removeMemberMutation.mutate(memberToRemove.id);
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-800';
      case 'manager': return 'bg-blue-100 text-blue-800';
      case 'user': return 'bg-green-100 text-green-800';
      case 'viewer': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (!canManage) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-gray-600">
              You don't have permission to access organization settings.
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
          <h1 className="text-2xl font-bold">Organization Settings</h1>
          <p className="text-sm text-gray-600 mt-1">
            Manage your organization members and permissions
          </p>
        </div>
      </div>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="stages">Project Stages</TabsTrigger>
        </TabsList>

        {/* ── GENERAL TAB ── */}
        <TabsContent value="general" className="space-y-4">

      {/* Organization Info */}
      <Card>
        <CardHeader>
          <CardTitle>Organization Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium text-gray-600">Name</Label>
              <p className="text-lg">{displayOrgName}</p>
            </div>
            <div>
              <Label className="text-sm font-medium text-gray-600">Total Members</Label>
              <p className="text-lg">{members?.length || 0}</p>
            </div>
            {isSuperAdmin && (
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium text-gray-600">Brand Color 1 — Primary (buttons, nav)</Label>
                  <div className="flex items-center gap-3 mt-1.5">
                    <input
                      type="color"
                      value={editBrandColor}
                      onChange={(e) => setEditBrandColor(e.target.value)}
                      className="h-10 w-20 rounded border border-input cursor-pointer"
                    />
                    <Input
                      type="text"
                      value={editBrandColor}
                      onChange={(e) => setEditBrandColor(e.target.value)}
                      placeholder="#eab308"
                      className="flex-1 font-mono"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-600">Brand Color 2 — Charts &amp; accents</Label>
                  <div className="flex items-center gap-3 mt-1.5">
                    <input
                      type="color"
                      value={editBrandColor2}
                      onChange={(e) => setEditBrandColor2(e.target.value)}
                      className="h-10 w-20 rounded border border-input cursor-pointer"
                    />
                    <Input
                      type="text"
                      value={editBrandColor2}
                      onChange={(e) => setEditBrandColor2(e.target.value)}
                      placeholder="#6b7280"
                      className="flex-1 font-mono"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-600">Brand Color 3 — Charts &amp; stage cards</Label>
                  <div className="flex items-center gap-3 mt-1.5">
                    <input
                      type="color"
                      value={editBrandColor3}
                      onChange={(e) => setEditBrandColor3(e.target.value)}
                      className="h-10 w-20 rounded border border-input cursor-pointer"
                    />
                    <Input
                      type="text"
                      value={editBrandColor3}
                      onChange={(e) => setEditBrandColor3(e.target.value)}
                      placeholder="#94a3b8"
                      className="flex-1 font-mono"
                    />
                  </div>
                </div>
                <Button
                  style={{ backgroundColor: editBrandColor }}
                  className="text-white hover:opacity-90"
                  onClick={() => updateBrandColorMutation.mutate({ brand_color: editBrandColor, brand_color_2: editBrandColor2, brand_color_3: editBrandColor3 })}
                  disabled={updateBrandColorMutation.isPending}
                >
                  {updateBrandColorMutation.isPending ? "Saving..." : "Save Brand Colors"}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

        </TabsContent>

        {/* ── TEAM TAB ── */}
        <TabsContent value="team" className="space-y-4">

      {/* Members Management */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>Manage who has access to your organization</CardDescription>
            </div>
            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
              <DialogTrigger asChild>
                <Button
                  style={{ backgroundColor: brandColor, borderColor: brandColor }}
                  className="text-white hover:opacity-90"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Member
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Team Member</DialogTitle>
                  <DialogDescription>
                    Add an existing user to your organization. They must have an account first.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="user@example.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="role">Role</Label>
                    <Select value={inviteRole} onValueChange={(value: any) => setInviteRole(value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin - Full access to everything</SelectItem>
                        <SelectItem value="manager">Manager - Can manage team and projects</SelectItem>
                        <SelectItem value="user">User - Can create and edit</SelectItem>
                        <SelectItem value="viewer">Viewer - Read only access</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setInviteOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleInvite}
                    style={{ backgroundColor: brandColor, borderColor: brandColor }}
                    className="text-white hover:opacity-90"
                    disabled={inviteMutation.isPending || !inviteEmail}
                  >
                    {inviteMutation.isPending ? "Adding..." : "Add Member"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members?.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">
                        {member.user_profiles.full_name || member.user_profiles.email}
                      </div>
                      <div className="text-sm text-gray-500">{member.user_profiles.email}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {member.user_id === user?.id ? (
                      <Badge className={getRoleBadgeColor(member.role)}>
                        {member.role} (You)
                      </Badge>
                    ) : (
                      <Select
                        value={member.role}
                        onValueChange={(value) => handleRoleChange(member.id, value)}
                        disabled={changeRoleMutation.isPending}
                      >
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="user">User</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Clock className="h-3 w-3" />
                      {new Date(member.joined_at).toLocaleDateString()}
                    </div>
                  </TableCell>
                  <TableCell>
                    {member.user_id !== user?.id ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => setMemberToRemove(member)}
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    ) : (
                      <span className="text-xs text-gray-400">Current user</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Role Descriptions */}
      <Card>
        <CardHeader>
          <CardTitle>Role Permissions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-red-600 mt-0.5" />
              <div>
                <h4 className="font-medium">Admin</h4>
                <p className="text-sm text-gray-600">
                  Full access to all features including user management, data deletion, and organization settings.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <UserCheck className="h-5 w-5 text-blue-600 mt-0.5" />
              <div>
                <h4 className="font-medium">Manager</h4>
                <p className="text-sm text-gray-600">
                  Can manage projects, invite users, and perform most operations except deleting critical data.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <UserCheck className="h-5 w-5 text-green-600 mt-0.5" />
              <div>
                <h4 className="font-medium">User</h4>
                <p className="text-sm text-gray-600">
                  Can create and edit data, manage assigned tasks. Cannot delete clients, contracts, or payments.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Mail className="h-5 w-5 text-gray-600 mt-0.5" />
              <div>
                <h4 className="font-medium">Viewer</h4>
                <p className="text-sm text-gray-600">
                  Read-only access to all data. Cannot create, edit, or delete anything.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

        </TabsContent>

        {/* ── LEADS TAB ── */}
        <TabsContent value="leads" className="space-y-4">

      {/* Pipeline Stages Management */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Pipeline Stages</CardTitle>
              <CardDescription>Customize lead pipeline stages for your organization</CardDescription>
            </div>
            <Dialog open={stageDialogOpen} onOpenChange={setStageDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  style={{ backgroundColor: brandColor, borderColor: brandColor }}
                  className="text-white hover:opacity-90"
                  onClick={() => { setNewStageName(''); setNewStageColor('#6b7280'); }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Stage
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Pipeline Stage</DialogTitle>
                  <DialogDescription>Add a custom stage to your lead pipeline.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="stage-name">Stage Name</Label>
                    <Input
                      id="stage-name"
                      placeholder="e.g. Follow Up"
                      value={newStageName}
                      onChange={e => setNewStageName(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="stage-color">Color</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        id="stage-color"
                        type="color"
                        value={newStageColor}
                        onChange={e => setNewStageColor(e.target.value)}
                        className="h-9 w-12 rounded border border-input cursor-pointer"
                      />
                      <Input
                        value={newStageColor}
                        onChange={e => setNewStageColor(e.target.value)}
                        placeholder="#6b7280"
                        className="font-mono"
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setStageDialogOpen(false)}>Cancel</Button>
                  <Button
                    style={{ backgroundColor: brandColor, borderColor: brandColor }}
                    className="text-white hover:opacity-90"
                    onClick={() => { if (newStageName.trim()) createStageMutation.mutate({ name: newStageName.trim(), color: newStageColor }); }}
                    disabled={createStageMutation.isPending || !newStageName.trim()}
                  >
                    {createStageMutation.isPending ? 'Adding...' : 'Add Stage'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Stage</TableHead>
                <TableHead>Color</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stagesData?.map((stage: any) => (
                <TableRow key={stage.id}>
                  <TableCell className="font-medium">{stage.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-5 w-5 rounded-full border" style={{ backgroundColor: stage.color }} />
                      <span className="text-xs font-mono text-gray-500">{stage.color}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {stage.is_won ? (
                      <Badge className="bg-green-100 text-green-800">Won</Badge>
                    ) : stage.is_lost ? (
                      <Badge className="bg-red-100 text-red-800">Lost</Badge>
                    ) : (
                      <Badge className="bg-gray-100 text-gray-800">Active</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {(stage.is_won || stage.is_lost) ? (
                      <span className="text-xs text-gray-400">Default (cannot delete)</span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => deleteStageMutation.mutate(stage.id)}
                        disabled={deleteStageMutation.isPending}
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Lead Sources Management */}
      <Card>
        <CardHeader>
          <CardTitle>Lead Sources</CardTitle>
          <CardDescription>Manage where your leads come from</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="e.g. LinkedIn"
              value={newSourceName}
              onChange={e => setNewSourceName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && newSourceName.trim()) {
                  createSourceMutation.mutate(newSourceName.trim());
                }
              }}
              className="max-w-xs"
            />
            <Button
              style={{ backgroundColor: brandColor, borderColor: brandColor }}
              className="text-white hover:opacity-90"
              onClick={() => { if (newSourceName.trim()) createSourceMutation.mutate(newSourceName.trim()); }}
              disabled={createSourceMutation.isPending || !newSourceName.trim()}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {sourcesData?.map((source: any) => (
              <div key={source.id} className="flex items-center gap-1 bg-gray-100 rounded-full px-3 py-1">
                <span className="text-sm">{source.name}</span>
                <button
                  onClick={() => deleteSourceMutation.mutate(source.id)}
                  className="ml-1 text-gray-400 hover:text-red-600 transition-colors"
                  disabled={deleteSourceMutation.isPending}
                >
                  ×
                </button>
              </div>
            ))}
            {(!sourcesData || sourcesData.length === 0) && (
              <p className="text-sm text-gray-500">No sources added yet.</p>
            )}
          </div>
        </CardContent>
      </Card>

        </TabsContent>

        {/* ── PROJECT STAGES TAB ── */}
        <TabsContent value="stages" className="space-y-4">

      {/* Project Stages Management */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5" style={{ color: brandColor }} />
                Project Stages
              </CardTitle>
              <CardDescription className="mt-1">
                Define stages and designer fee % for project milestone tracking.
                {orgProjectStages.length > 0 && (
                  <span className={`ml-2 font-medium ${Math.abs(totalProjectStageFee - 100) < 0.01 ? 'text-green-600' : 'text-amber-600'}`}>
                    Total: {totalProjectStageFee}%{Math.abs(totalProjectStageFee - 100) < 0.01 ? ' ✓' : ' (should be 100%)'}
                  </span>
                )}
              </CardDescription>
            </div>
            <Button
              style={{ backgroundColor: brandColor, borderColor: brandColor }}
              className="text-white hover:opacity-90"
              onClick={() => openProjectStageDialog()}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Stage
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {orgProjectStages.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">No project stages defined yet. Add stages to track project progress and designer fee milestones.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Order</TableHead>
                  <TableHead>Stage Name</TableHead>
                  <TableHead>Fee %</TableHead>
                  <TableHead>Color</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...orgProjectStages].sort((a, b) => a.display_order - b.display_order).map((stage: any, idx: number) => (
                  <TableRow key={stage.id}>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <Button
                          variant="ghost" size="icon" className="h-5 w-5"
                          disabled={idx === 0 || reorderProjectStageMutation.isPending}
                          onClick={() => reorderProjectStageMutation.mutate({ id: stage.id, direction: 'up' })}
                        >
                          <ChevronUp className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-5 w-5"
                          disabled={idx === orgProjectStages.length - 1 || reorderProjectStageMutation.isPending}
                          onClick={() => reorderProjectStageMutation.mutate({ id: stage.id, direction: 'down' })}
                        >
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{stage.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono">{Number(stage.fee_percentage)}%</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-5 w-5 rounded-full border" style={{ backgroundColor: stage.color }} />
                        <span className="text-xs font-mono text-gray-500">{stage.color}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost" size="icon" className="h-8 w-8 text-gray-500 hover:text-gray-700"
                          onClick={() => openProjectStageDialog(stage)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => deleteProjectStageMutation.mutate(stage.id)}
                          disabled={deleteProjectStageMutation.isPending}
                        >
                          <Trash className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

        </TabsContent>
      </Tabs>

      {/* Add / Edit Project Stage Dialog */}
      <Dialog open={projectStageDialogOpen} onOpenChange={setProjectStageDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProjectStage ? 'Edit Stage' : 'Add Project Stage'}</DialogTitle>
            <DialogDescription>Define a project milestone and the designer fee % released at this stage.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="ps-name">Stage Name</Label>
              <Input id="ps-name" placeholder="e.g. Design Brief" value={psName} onChange={e => setPsName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ps-fee">Designer Fee % for this stage</Label>
              <Input id="ps-fee" type="number" min="0" max="100" step="0.5" placeholder="25" value={psFee} onChange={e => setPsFee(e.target.value)} />
              <p className="text-xs text-gray-500 mt-1">Percentage of the total designer fee earned when this stage is completed.</p>
            </div>
            <div>
              <Label htmlFor="ps-color">Color</Label>
              <div className="flex items-center gap-2 mt-1">
                <input id="ps-color" type="color" value={psColor} onChange={e => setPsColor(e.target.value)} className="h-9 w-12 rounded border border-input cursor-pointer" />
                <Input value={psColor} onChange={e => setPsColor(e.target.value)} placeholder="#6b7280" className="font-mono" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProjectStageDialogOpen(false)}>Cancel</Button>
            <Button
              style={{ backgroundColor: brandColor, borderColor: brandColor }}
              className="text-white hover:opacity-90"
              onClick={() => saveProjectStageMutation.mutate()}
              disabled={saveProjectStageMutation.isPending || !psName.trim()}
            >
              {saveProjectStageMutation.isPending ? 'Saving...' : editingProjectStage ? 'Update Stage' : 'Add Stage'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Member Confirmation Dialog */}
      <AlertDialog open={!!memberToRemove} onOpenChange={(open) => !open && setMemberToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Team Member?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{memberToRemove?.user_profiles.email}</strong> from your organization?
              They will immediately lose access to all organization data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveMember}
              className="bg-red-600 hover:bg-red-700"
            >
              Remove Member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
