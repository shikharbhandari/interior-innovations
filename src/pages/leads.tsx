import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Plus, Pencil, Trash, Search, Target, ChevronDown } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useBrandColor } from "@/hooks/use-brand-color";

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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { insertLeadSchema, type Lead, type InsertLead, type LeadStage, type LeadSource } from "@/lib/schema";

const ITEMS_PER_PAGE = 7;

type LeadWithRelations = Lead & {
  lead_stages: LeadStage | null;
  lead_sources: LeadSource | null;
  assignee: { id: string; full_name: string | null; email: string } | null;
};

export default function Leads() {
  const { currentOrganization, user, hasPermission } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<LeadWithRelations | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [leadToDelete, setLeadToDelete] = useState<LeadWithRelations | null>(null);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);

  const { brandColor } = useBrandColor();

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [stageFilter, sourceFilter, searchQuery]);

  const { data: leadsData, isLoading } = useQuery({
    queryKey: ['leads', currentOrganization?.organization_id],
    queryFn: async () => {
      if (!currentOrganization) throw new Error('No organization selected');

      const { data, error } = await supabase
        .from('leads')
        .select(`
          *,
          lead_stages ( id, name, color, is_won, is_lost ),
          lead_sources ( id, name ),
          assignee:user_profiles!leads_assigned_to_fkey ( id, full_name, email )
        `)
        .eq('organization_id', currentOrganization.organization_id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as LeadWithRelations[];
    },
    enabled: !!currentOrganization,
  });

  const { data: stagesData } = useQuery({
    queryKey: ['lead-stages', currentOrganization?.organization_id],
    queryFn: async () => {
      if (!currentOrganization) throw new Error('No organization selected');
      const { data, error } = await supabase
        .from('lead_stages')
        .select('*')
        .eq('organization_id', currentOrganization.organization_id)
        .order('sort_order');
      if (error) throw error;
      return data as LeadStage[];
    },
    enabled: !!currentOrganization,
  });

  const { data: sourcesData } = useQuery({
    queryKey: ['lead-sources', currentOrganization?.organization_id],
    queryFn: async () => {
      if (!currentOrganization) throw new Error('No organization selected');
      const { data, error } = await supabase
        .from('lead_sources')
        .select('*')
        .eq('organization_id', currentOrganization.organization_id)
        .order('name');
      if (error) throw error;
      return data as LeadSource[];
    },
    enabled: !!currentOrganization,
  });

  const { data: membersData } = useQuery({
    queryKey: ['org-members-leads', currentOrganization?.organization_id],
    queryFn: async () => {
      if (!currentOrganization) throw new Error('No organization selected');
      const { data, error } = await supabase
        .from('organization_members')
        .select('user_id, user_profiles!organization_members_user_id_fkey ( id, full_name, email )')
        .eq('organization_id', currentOrganization.organization_id)
        .eq('status', 'active');
      if (error) throw error;
      return data;
    },
    enabled: !!currentOrganization,
  });

  // Compute stats
  const totalLeads = leadsData?.length || 0;
  const wonStageIds = stagesData?.filter(s => s.is_won).map(s => s.id) || [];
  const wonLeads = leadsData?.filter(l => l.stage_id && wonStageIds.includes(l.stage_id)).length || 0;
  const conversionRate = totalLeads > 0 ? ((wonLeads / totalLeads) * 100).toFixed(1) : '0.0';

  // Filter leads
  const allFilteredLeads = leadsData?.filter(lead => {
    const matchesSearch =
      lead.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (lead.email && lead.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (lead.phone && lead.phone.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStage = stageFilter === 'all' || lead.stage_id === stageFilter;
    const matchesSource = sourceFilter === 'all' || lead.source_id === sourceFilter;

    return matchesSearch && matchesStage && matchesSource;
  });

  const totalFilteredCount = allFilteredLeads?.length || 0;
  const totalPages = Math.ceil(totalFilteredCount / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const filteredLeads = allFilteredLeads?.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const form = useForm<InsertLead>({
    resolver: zodResolver(insertLeadSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      address: '',
      notes: '',
      stage_id: null,
      source_id: null,
      assigned_to: null,
      estimated_value: null,
    }
  });

  const createMutation = useMutation({
    mutationFn: async (values: InsertLead) => {
      if (!currentOrganization || !user) throw new Error('Not authorized');

      const { data, error } = await supabase
        .from('leads')
        .insert([{
          ...values,
          estimated_value: values.estimated_value ? Number(values.estimated_value) : null,
          organization_id: currentOrganization.organization_id,
          created_by: user.id,
        }])
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads', currentOrganization?.organization_id] });
      setIsOpen(false);
      form.reset();
      toast({ title: "Success", description: "Lead created successfully" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (values: InsertLead) => {
      if (!editingLead || !user) return;
      const { data, error } = await supabase
        .from('leads')
        .update({
          ...values,
          estimated_value: values.estimated_value ? Number(values.estimated_value) : null,
          updated_by: user.id,
        })
        .eq('id', editingLead.id)
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads', currentOrganization?.organization_id] });
      setIsOpen(false);
      setEditingLead(null);
      form.reset();
      toast({ title: "Success", description: "Lead updated successfully" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('leads').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads', currentOrganization?.organization_id] });
      setDeleteDialogOpen(false);
      setLeadToDelete(null);
      toast({ title: "Success", description: "Lead deleted" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  });

  const onSubmit = (values: InsertLead) => {
    if (editingLead) {
      updateMutation.mutate(values);
    } else {
      createMutation.mutate(values);
    }
  };

  const handleEdit = (lead: LeadWithRelations) => {
    setEditingLead(lead);
    form.reset({
      name: lead.name,
      email: lead.email || '',
      phone: lead.phone || '',
      address: lead.address || '',
      notes: lead.notes || '',
      stage_id: lead.stage_id,
      source_id: lead.source_id,
      assigned_to: lead.assigned_to,
      estimated_value: lead.estimated_value ? Number(lead.estimated_value) : null,
    });
    setIsOpen(true);
  };

  const handleDelete = (lead: LeadWithRelations) => {
    setLeadToDelete(lead);
    setDeleteDialogOpen(true);
  };

  if (isLoading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Leads</h1>
        {hasPermission('leads', 'create') && (
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button
                style={{ backgroundColor: brandColor, borderColor: brandColor }}
                className="text-white hover:opacity-90"
                onClick={() => {
                  setEditingLead(null);
                  form.reset({
                    name: '', email: '', phone: '', address: '', notes: '',
                    stage_id: null, source_id: null, assigned_to: null, estimated_value: null,
                  });
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Lead
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingLead ? 'Edit Lead' : 'Add New Lead'}</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name *</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl><Input type="email" {...field} value={field.value ?? ''} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone</FormLabel>
                          <FormControl><Input {...field} value={field.value ?? ''} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address</FormLabel>
                        <FormControl><Input {...field} value={field.value ?? ''} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="estimated_value"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Estimated Value (₹)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            {...field}
                            value={field.value ?? ''}
                            onChange={e => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="stage_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Stage</FormLabel>
                          <Select
                            value={field.value ?? 'none'}
                            onValueChange={v => field.onChange(v === 'none' ? null : v)}
                          >
                            <FormControl>
                              <SelectTrigger><SelectValue placeholder="Select stage" /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">No Stage</SelectItem>
                              {stagesData?.map(stage => (
                                <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="source_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Source</FormLabel>
                          <Select
                            value={field.value ?? 'none'}
                            onValueChange={v => field.onChange(v === 'none' ? null : v)}
                          >
                            <FormControl>
                              <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">No Source</SelectItem>
                              {sourcesData?.map(source => (
                                <SelectItem key={source.id} value={source.id}>{source.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="assigned_to"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Assigned To</FormLabel>
                        <Select
                          value={field.value ?? 'none'}
                          onValueChange={v => field.onChange(v === 'none' ? null : v)}
                        >
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="Select assignee" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">Unassigned</SelectItem>
                            {membersData?.map((m: any) => (
                              <SelectItem key={m.user_id} value={m.user_id}>
                                {m.user_profiles?.full_name || m.user_profiles?.email || m.user_id}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            value={field.value ?? ''}
                            placeholder="Add any notes about this lead..."
                            className="min-h-[80px]"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    style={{ backgroundColor: brandColor, borderColor: brandColor }}
                    className="w-full text-white hover:opacity-90"
                    disabled={createMutation.isPending || updateMutation.isPending}
                  >
                    {editingLead ? 'Update' : 'Create'} Lead
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-2" style={{ backgroundColor: brandColor, borderColor: brandColor }}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white">Total Leads</p>
                <p className="text-3xl font-bold mt-1 text-white">{totalLeads}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center">
                <Target className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-2" style={{ backgroundColor: brandColor, borderColor: brandColor }}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white">Won Leads</p>
                <p className="text-3xl font-bold mt-1 text-white">{wonLeads}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center">
                <Target className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-2" style={{ backgroundColor: brandColor, borderColor: brandColor }}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white">Conversion Rate</p>
                <p className="text-3xl font-bold mt-1 text-white">{conversionRate}%</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center">
                <Target className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center space-x-4 flex-wrap gap-2">
        <div className="flex items-center space-x-2">
          <Search className="h-4 w-4 text-gray-500" />
          <Input
            placeholder="Search leads..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-sm"
          />
        </div>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            {stagesData?.map(stage => (
              <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            {sourcesData?.map(source => (
              <SelectItem key={source.id} value={source.id}>{source.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Lead List</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead>Est. Value</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLeads?.map((lead) => (
                <TableRow
                  key={lead.id}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => setLocation(`/leads/${lead.id}`)}
                >
                  <TableCell className="font-medium">{lead.name}</TableCell>
                  <TableCell>{lead.phone || '—'}</TableCell>
                  <TableCell>
                    {lead.lead_stages ? (
                      <span
                        className="px-2 py-1 rounded-full text-xs text-white font-medium"
                        style={{ backgroundColor: lead.lead_stages.color }}
                      >
                        {lead.lead_stages.name}
                      </span>
                    ) : '—'}
                  </TableCell>
                  <TableCell>{lead.lead_sources?.name || '—'}</TableCell>
                  <TableCell>
                    {lead.assignee?.full_name || lead.assignee?.email || '—'}
                  </TableCell>
                  <TableCell>
                    {lead.estimated_value ? `₹${Number(lead.estimated_value).toLocaleString()}` : '—'}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Actions <ChevronDown className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {hasPermission('leads', 'update') && (
                          <DropdownMenuItem
                            onClick={(e) => { e.stopPropagation(); handleEdit(lead); }}
                          >
                            <Pencil className="h-4 w-4 mr-2" /> Edit
                          </DropdownMenuItem>
                        )}
                        {hasPermission('leads', 'delete') && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-600 focus:text-red-600"
                              onClick={(e) => { e.stopPropagation(); handleDelete(lead); }}
                            >
                              <Trash className="h-4 w-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {filteredLeads?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-gray-500 py-8">
                    No leads found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {totalFilteredCount > ITEMS_PER_PAGE && (
            <div className="mt-6 flex justify-center">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(e) => { e.preventDefault(); setCurrentPage(p => Math.max(1, p - 1)); }}
                    />
                  </PaginationItem>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <PaginationItem key={page}>
                      <PaginationLink
                        href="#"
                        onClick={(e) => { e.preventDefault(); setCurrentPage(page); }}
                        isActive={currentPage === page}
                      >
                        {page}
                      </PaginationLink>
                    </PaginationItem>
                  ))}
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(e) => { e.preventDefault(); setCurrentPage(p => Math.min(totalPages, p + 1)); }}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Lead</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {leadToDelete?.name}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => { if (leadToDelete) deleteMutation.mutate(leadToDelete.id); }}
              disabled={deleteMutation.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
