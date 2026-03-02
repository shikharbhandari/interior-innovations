import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Plus, Trash, Phone, Mail, MapPin, FileText, ArrowLeft, UserCheck, ExternalLink } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useBrandColor } from "@/hooks/use-brand-color";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { insertLeadActivitySchema, type Lead, type LeadStage, type LeadActivity, type InsertLeadActivity } from "@/lib/schema";

type ActivityType = 'call_message' | 'email' | 'site_visit_meeting' | 'note';

const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  call_message: 'Call / Message',
  email: 'Email',
  site_visit_meeting: 'Site Visit / Meeting',
  note: 'Note',
};

function ActivityIcon({ type }: { type: string }) {
  switch (type as ActivityType) {
    case 'call_message': return <Phone className="h-4 w-4" />;
    case 'email': return <Mail className="h-4 w-4" />;
    case 'site_visit_meeting': return <MapPin className="h-4 w-4" />;
    case 'note': return <FileText className="h-4 w-4" />;
    default: return <FileText className="h-4 w-4" />;
  }
}

type LeadWithRelations = Lead & {
  lead_stages: LeadStage | null;
  lead_sources: { id: string; name: string } | null;
  assignee: { id: string; full_name: string | null; email: string } | null;
};

export default function LeadDetails() {
  const params = useParams();
  const leadId = params.id;
  const [, setLocation] = useLocation();
  const [activityDialogOpen, setActivityDialogOpen] = useState(false);
  const { toast } = useToast();
  const { currentOrganization, user } = useAuth();
  const { brandColor } = useBrandColor();

  const { data: lead, isLoading: leadLoading } = useQuery({
    queryKey: ['lead', leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select(`
          *,
          lead_stages ( id, name, color, is_won, is_lost ),
          lead_sources ( id, name ),
          assignee:user_profiles!leads_assigned_to_fkey ( id, full_name, email )
        `)
        .eq('id', leadId)
        .single();
      if (error) throw error;
      return data as LeadWithRelations;
    },
  });

  const { data: activities, isLoading: activitiesLoading } = useQuery({
    queryKey: ['lead-activities', leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_activities')
        .select('*, created_by_profile:user_profiles!lead_activities_created_by_fkey ( full_name, email )')
        .eq('lead_id', leadId)
        .order('logged_at', { ascending: false });
      if (error) throw error;
      return data as (LeadActivity & { created_by_profile: { full_name: string | null; email: string } | null })[];
    },
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

  const updateStageMutation = useMutation({
    mutationFn: async (stageId: string | null) => {
      if (!user) throw new Error('Not authorized');
      const { error } = await supabase
        .from('leads')
        .update({ stage_id: stageId, updated_by: user.id })
        .eq('id', leadId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      queryClient.invalidateQueries({ queryKey: ['leads', currentOrganization?.organization_id] });
      toast({ title: "Success", description: "Stage updated successfully" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  });

  const convertToClientMutation = useMutation({
    mutationFn: async () => {
      if (!lead || !currentOrganization || !user) throw new Error('Not authorized');

      // 1. Create the client
      const { data: newClient, error: clientError } = await supabase
        .from('clients')
        .insert([{
          name: lead.name,
          email: lead.email || null,
          phone: lead.phone || null,
          address: lead.address || null,
          notes: lead.notes || null,
          contract_amount: lead.estimated_value ? Number(lead.estimated_value) : null,
          status: 'active',
          organization_id: currentOrganization.organization_id,
          created_by: user.id,
        }])
        .select()
        .single();

      if (clientError) throw clientError;

      // 2. Find the Won stage
      const wonStage = stagesData?.find(s => s.is_won);

      // 3. Update the lead with converted_client_id and Won stage
      const { error: leadError } = await supabase
        .from('leads')
        .update({
          converted_client_id: newClient.id,
          stage_id: wonStage?.id ?? lead.stage_id,
          updated_by: user.id,
        })
        .eq('id', leadId);

      if (leadError) throw leadError;

      return newClient;
    },
    onSuccess: (newClient) => {
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      queryClient.invalidateQueries({ queryKey: ['leads', currentOrganization?.organization_id] });
      queryClient.invalidateQueries({ queryKey: ['clients', currentOrganization?.organization_id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats', currentOrganization?.organization_id] });
      toast({ title: "Success", description: "Lead converted to client successfully" });
      setLocation(`/clients/${newClient.id}`);
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  });

  const activityForm = useForm<InsertLeadActivity>({
    resolver: zodResolver(insertLeadActivitySchema),
    defaultValues: {
      lead_id: leadId!,
      type: 'note',
      summary: '',
      notes: '',
      logged_at: new Date(),
    }
  });

  const logActivityMutation = useMutation({
    mutationFn: async (values: InsertLeadActivity) => {
      if (!currentOrganization || !user) throw new Error('Not authorized');
      const { error } = await supabase
        .from('lead_activities')
        .insert([{
          ...values,
          lead_id: leadId,
          organization_id: currentOrganization.organization_id,
          created_by: user.id,
        }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-activities', leadId] });
      setActivityDialogOpen(false);
      activityForm.reset({ lead_id: leadId!, type: 'note', summary: '', notes: '', logged_at: new Date() });
      toast({ title: "Success", description: "Activity logged successfully" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  });

  const deleteActivityMutation = useMutation({
    mutationFn: async (activityId: string) => {
      const { error } = await supabase.from('lead_activities').delete().eq('id', activityId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-activities', leadId] });
      toast({ title: "Success", description: "Activity deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  });

  if (leadLoading) return <div className="p-6">Loading...</div>;
  if (!lead) return <div className="p-6">Lead not found</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation('/leads')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">{lead.name}</h1>
        {lead.lead_stages && (
          <span
            className="px-3 py-1 rounded-full text-sm text-white font-medium"
            style={{ backgroundColor: lead.lead_stages.color }}
          >
            {lead.lead_stages.name}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Lead Info */}
        <Card>
          <CardHeader>
            <CardTitle>Lead Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Inline Stage Selector */}
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-500 w-28">Pipeline Stage</span>
              <Select
                value={lead.stage_id ?? 'none'}
                onValueChange={v => updateStageMutation.mutate(v === 'none' ? null : v)}
                disabled={updateStageMutation.isPending}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Stage</SelectItem>
                  {stagesData?.map(stage => (
                    <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {lead.email && (
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-500 w-28">Email</span>
                <span className="text-sm">{lead.email}</span>
              </div>
            )}
            {lead.phone && (
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-500 w-28">Phone</span>
                <span className="text-sm">{lead.phone}</span>
              </div>
            )}
            {lead.address && (
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-500 w-28">Address</span>
                <span className="text-sm">{lead.address}</span>
              </div>
            )}
            {lead.lead_sources && (
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-500 w-28">Source</span>
                <span className="text-sm">{lead.lead_sources.name}</span>
              </div>
            )}
            {lead.estimated_value && (
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-500 w-28">Est. Value</span>
                <span className="text-sm font-semibold">₹{Number(lead.estimated_value).toLocaleString()}</span>
              </div>
            )}
            {lead.assignee && (
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-500 w-28">Assigned To</span>
                <span className="text-sm">{lead.assignee.full_name || lead.assignee.email}</span>
              </div>
            )}
            {lead.notes && (
              <div className="space-y-1">
                <span className="text-sm font-medium text-gray-500">Notes</span>
                <p className="text-sm text-gray-700 bg-gray-50 rounded-md p-3">{lead.notes}</p>
              </div>
            )}

            <div className="pt-4 flex gap-3 flex-wrap">
              {!lead.converted_client_id ? (
                <>
                  <Button
                    style={lead.lead_stages?.is_won ? { backgroundColor: brandColor, borderColor: brandColor } : {}}
                    className="text-white hover:opacity-90"
                    onClick={() => convertToClientMutation.mutate()}
                    disabled={!lead.lead_stages?.is_won || convertToClientMutation.isPending}
                  >
                    <UserCheck className="h-4 w-4 mr-2" />
                    {convertToClientMutation.isPending ? 'Converting...' : 'Convert to Client'}
                  </Button>
                  {!lead.lead_stages?.is_won && (
                    <p className="text-xs text-gray-400 self-center">
                      Set stage to "Won" to convert this lead to a client.
                    </p>
                  )}
                </>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => setLocation(`/clients/${lead.converted_client_id}`)}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View Client
                </Button>
              )}
            </div>

            <div className="pt-2 text-xs text-gray-400">
              Created {lead.created_at ? format(new Date(lead.created_at), 'MMM dd, yyyy') : '—'}
            </div>
          </CardContent>
        </Card>

        {/* Right Column: Activity Timeline */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Activity Timeline</CardTitle>
            <Dialog open={activityDialogOpen} onOpenChange={setActivityDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  style={{ backgroundColor: brandColor, borderColor: brandColor }}
                  className="text-white hover:opacity-90"
                  onClick={() => activityForm.reset({
                    lead_id: leadId!,
                    type: 'note',
                    summary: '',
                    notes: '',
                    logged_at: new Date(),
                  })}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Log Activity
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Log Activity</DialogTitle>
                </DialogHeader>
                <Form {...activityForm}>
                  <form onSubmit={activityForm.handleSubmit(v => logActivityMutation.mutate(v))} className="space-y-4">
                    <FormField
                      control={activityForm.control}
                      name="type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Activity Type *</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {(Object.entries(ACTIVITY_TYPE_LABELS) as [ActivityType, string][]).map(([val, label]) => (
                                <SelectItem key={val} value={val}>{label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={activityForm.control}
                      name="summary"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Summary *</FormLabel>
                          <FormControl><Input {...field} placeholder="Brief summary of the activity" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={activityForm.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Notes</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              value={field.value ?? ''}
                              placeholder="Additional details..."
                              className="min-h-[80px]"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={activityForm.control}
                      name="logged_at"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Date & Time</FormLabel>
                          <FormControl>
                            <Input
                              type="datetime-local"
                              value={field.value instanceof Date
                                ? field.value.toISOString().slice(0, 16)
                                : new Date().toISOString().slice(0, 16)
                              }
                              onChange={e => field.onChange(new Date(e.target.value))}
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
                      disabled={logActivityMutation.isPending}
                    >
                      {logActivityMutation.isPending ? 'Logging...' : 'Log Activity'}
                    </Button>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {activitiesLoading ? (
              <p className="text-sm text-gray-500">Loading...</p>
            ) : activities && activities.length > 0 ? (
              <div className="space-y-4">
                {activities.map((activity) => (
                  <div key={activity.id} className="flex gap-3 p-3 bg-gray-50 rounded-lg">
                    <div
                      className="h-8 w-8 rounded-full flex items-center justify-center text-white flex-shrink-0 mt-0.5"
                      style={{ backgroundColor: brandColor }}
                    >
                      <ActivityIcon type={activity.type} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-xs font-medium text-gray-500 uppercase">
                            {ACTIVITY_TYPE_LABELS[activity.type as ActivityType] || activity.type}
                          </span>
                          <p className="text-sm font-medium">{activity.summary}</p>
                          {activity.notes && (
                            <p className="text-sm text-gray-600 mt-1">{activity.notes}</p>
                          )}
                          <p className="text-xs text-gray-400 mt-1">
                            {format(new Date(activity.logged_at), 'MMM dd, yyyy h:mm a')}
                            {activity.created_by_profile && (
                              <> · {activity.created_by_profile.full_name || activity.created_by_profile.email}</>
                            )}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50 flex-shrink-0"
                          onClick={() => deleteActivityMutation.mutate(activity.id)}
                        >
                          <Trash className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-8">
                No activities logged yet. Click "Log Activity" to add one.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
