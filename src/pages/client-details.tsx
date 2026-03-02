import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { format, differenceInDays, addDays } from "date-fns";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Pencil, BarChart2, ArrowLeft, FolderOpen, Plus, Trash, MessageCircle, CalendarDays } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { Badge } from "@/components/ui/badge";
import { insertClientSchema, type InsertClient, type Client } from "@/lib/schema";
import { useBrandColor } from "@/hooks/use-brand-color";

export default function ClientDetails() {
  const params = useParams();
  const clientId = params.id;
  const [, setLocation] = useLocation();
  const [isEditClientOpen, setIsEditClientOpen] = useState(false);
  const { toast } = useToast();
  const { currentOrganization, user, isSuperAdmin } = useAuth();
  const { brandColor, brandColor2, brandColor3 } = useBrandColor();

  // Project stage dialog state
  const [pStageDialogOpen, setPStageDialogOpen] = useState(false);
  const [editingPStage, setEditingPStage] = useState<any | null>(null);
  const [pStageName, setPStageName] = useState('');
  const [pStageFee, setPStageFee] = useState('0');
  const [pStageDate, setPStageDate] = useState('');

  // ── Queries ─────────────────────────────────────────────────────────────────

  const { data: client, isLoading: clientLoading } = useQuery({
    queryKey: ['client', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .single();
      if (error) throw error;
      return data as Client;
    },
  });

  // Super admin may not have currentOrganization — fall back to the client's own org
  const effectiveOrgId = currentOrganization?.organization_id ?? (isSuperAdmin ? client?.organization_id : undefined);

  const { data: projectStages = [], isLoading: stagesLoading } = useQuery({
    queryKey: ['project-stages', clientId, effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) throw new Error('No organization');
      const { data, error } = await supabase
        .from('project_stages')
        .select('*')
        .eq('client_id', clientId)
        .eq('organization_id', effectiveOrgId)
        .order('display_order');
      if (error) throw error;
      return data as any[];
    },
    enabled: !!effectiveOrgId,
    refetchOnMount: 'always',
  });

  const { data: orgProjectStages = [], isLoading: orgStagesLoading, error: orgStagesError } = useQuery({
    queryKey: ['org-project-stages-templates', effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) throw new Error('No organization');
      const { data, error } = await supabase
        .from('organization_project_stages')
        .select('*')
        .eq('organization_id', effectiveOrgId)
        .order('display_order');
      if (error) throw error;
      return data as any[];
    },
    enabled: !!effectiveOrgId,
  });

  const { data: designerFeesTotals } = useQuery({
    queryKey: ['designer-fees-totals', clientId, effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) throw new Error('No organization');
      const { data, error } = await supabase
        .from('designer_fees')
        .select(`billing_amount, designer_fee_payments (amount)`)
        .eq('client_id', clientId)
        .eq('organization_id', effectiveOrgId);
      if (error) throw error;
      const fees = data || [];
      const totalFee = fees.reduce((s: number, f: any) => s + Number(f.billing_amount || 0), 0);
      const totalPaid = fees.reduce((s: number, f: any) =>
        s + (f.designer_fee_payments || []).reduce((ps: number, p: any) => ps + Number(p.amount), 0), 0);
      return { totalFee, totalPaid };
    },
    enabled: !!effectiveOrgId,
    refetchOnMount: 'always',
  });

  // ── Computed stage values ────────────────────────────────────────────────────

  const completedPct = projectStages
    .filter((s: any) => s.is_completed)
    .reduce((sum: number, s: any) => sum + Number(s.fee_percentage || 0), 0);

  const totalDesignerFee = designerFeesTotals?.totalFee || 0;
  const totalDesignerFeePaid = designerFeesTotals?.totalPaid || 0;
  const paidPct = totalDesignerFee > 0 ? (totalDesignerFeePaid / totalDesignerFee) * 100 : 0;

  // ── Project timeline derived values ─────────────────────────────────────────
  const projectStart = client?.estimated_start_date ? new Date(client.estimated_start_date) : null;
  const projectEnd = client?.estimated_end_date ? new Date(client.estimated_end_date) : null;
  const totalProjectDays = projectStart && projectEnd ? Math.max(1, differenceInDays(projectEnd, projectStart)) : 0;
  const totalStagePct = projectStages.reduce((s: number, st: any) => s + Number(st.fee_percentage || 0), 0) || 100;

  // ── Forms ────────────────────────────────────────────────────────────────────

  const clientForm = useForm<InsertClient>({
    resolver: zodResolver(insertClientSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      address: '',
      notes: '',
      status: 'active',
    }
  });

  // ── Mutations ────────────────────────────────────────────────────────────────

  const updateClientMutation = useMutation({
    mutationFn: async (values: InsertClient) => {
      if (!user) throw new Error('Not authorized');
      const { error } = await supabase
        .from('clients')
        .update({ ...values, updated_by: user.id })
        .eq('id', clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client', clientId] });
      queryClient.invalidateQueries({ queryKey: ['clients', currentOrganization?.organization_id] });
      setIsEditClientOpen(false);
      toast({ title: "Success", description: "Client updated successfully" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  });

  const invalidateStages = () =>
    queryClient.invalidateQueries({ queryKey: ['project-stages', clientId, effectiveOrgId] });

  const initializeStagesMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveOrgId || !user) throw new Error('Not authorized');
      if (orgProjectStages.length === 0) throw new Error('No org stage templates defined. Add stages in Settings first.');
      const rows = orgProjectStages.map((s: any) => ({
        client_id: Number(clientId),
        organization_id: effectiveOrgId,
        name: s.name,
        display_order: s.display_order,
        fee_percentage: s.fee_percentage,
        is_completed: false,
      }));
      const { error } = await supabase.from('project_stages').insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateStages();
      toast({ title: "Stages initialized", description: "Project stages copied from org template." });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const toggleStageMutation = useMutation({
    mutationFn: async ({ id, is_completed }: { id: number; is_completed: boolean }) => {
      const { error } = await supabase
        .from('project_stages')
        .update({ is_completed, completed_at: is_completed ? new Date().toISOString() : null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidateStages(),
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const updateStageStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const is_completed = status === 'completed';
      const { error } = await supabase
        .from('project_stages')
        .update({
          status,
          is_completed,
          completed_at: is_completed ? new Date().toISOString() : null,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidateStages(),
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const updateTimelineMutation = useMutation({
    mutationFn: async ({ field, value }: { field: 'estimated_start_date' | 'estimated_end_date'; value: string }) => {
      const { error } = await supabase
        .from('clients')
        .update({ [field]: value || null })
        .eq('id', clientId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['client', clientId] }),
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const saveProjectStageMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveOrgId || !user) throw new Error('Not authorized');
      if (!pStageName.trim()) throw new Error('Stage name is required');
      if (editingPStage) {
        const { error } = await supabase
          .from('project_stages')
          .update({ name: pStageName.trim(), fee_percentage: Number(pStageFee) || 0, target_date: pStageDate || null })
          .eq('id', editingPStage.id);
        if (error) throw error;
      } else {
        const maxOrder = projectStages.length > 0 ? Math.max(...projectStages.map((s: any) => s.display_order)) : -1;
        const { error } = await supabase.from('project_stages').insert({
          client_id: Number(clientId),
          organization_id: effectiveOrgId,
          name: pStageName.trim(),
          fee_percentage: Number(pStageFee) || 0,
          target_date: pStageDate || null,
          display_order: maxOrder + 1,
          is_completed: false,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidateStages();
      setPStageDialogOpen(false);
      toast({ title: "Saved", description: editingPStage ? "Stage updated" : "Stage added" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const deleteProjectStageMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('project_stages').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateStages();
      toast({ title: "Stage deleted" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const openPStageDialog = (stage?: any) => {
    setEditingPStage(stage || null);
    setPStageName(stage?.name || '');
    setPStageFee(stage ? String(Number(stage.fee_percentage)) : '0');
    setPStageDate(stage?.target_date || '');
    setPStageDialogOpen(true);
  };

  const buildWhatsAppLink = () => {
    const orgName = currentOrganization?.organizations?.name || 'our team';
    const completedStages = projectStages.filter((s: any) => s.status === 'completed' || s.is_completed);

    const stagesText = completedStages.length > 0
      ? completedStages.map((s: any) => {
          const stageAmount = totalDesignerFee > 0
            ? `₹${Math.round(Number(s.fee_percentage) / 100 * totalDesignerFee).toLocaleString('en-IN')}`
            : `${Number(s.fee_percentage)}%`;
          return `• ${s.name} — ${stageAmount}`;
        }).join('\n')
      : '• (No stages completed yet)';

    const timelineText = (client?.estimated_start_date || client?.estimated_end_date)
      ? `\n📅 Project Timeline: ${client?.estimated_start_date ? format(new Date(client.estimated_start_date), 'd MMM yyyy') : 'TBD'} – ${client?.estimated_end_date ? format(new Date(client.estimated_end_date), 'd MMM yyyy') : 'TBD'}`
      : '';

    const balance = Math.max(0, totalDesignerFee - totalDesignerFeePaid);

    const message = `Hi ${client?.name},

Greetings from ${orgName}!

The following stages of your project have been completed as per our agreement:

✅ Completed Stages:
${stagesText}${timelineText}

As per the agreement, we request you to kindly arrange the payment for the completed stages at the earliest.

💰 Designer Fee Summary:
Total Fee: ₹${totalDesignerFee.toLocaleString('en-IN')}
Paid: ₹${totalDesignerFeePaid.toLocaleString('en-IN')}
*Balance Due: ₹${balance.toLocaleString('en-IN')}*

Thank you!
${orgName}`;

    const digits = (client?.phone || '').replace(/\D/g, '');
    const phone = digits.length === 10 ? `91${digits}` : digits;
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  if (clientLoading) {
    return <div className="p-4">Loading...</div>;
  }

  if (!client) {
    return <div className="p-4">Client not found</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <Button variant="ghost" size="sm" onClick={() => setLocation('/clients')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Clients
        </Button>
      </div>
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold">{client.name}</h1>
          <Badge
            variant={client.status === 'active' ? 'default' : 'secondary'}
            className="mt-1"
            style={client.status === 'active' ? { backgroundColor: brandColor } : {}}
          >
            {client.status}
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              clientForm.reset({
                name: client.name,
                email: client.email || '',
                phone: client.phone || '',
                address: client.address || '',
                notes: client.notes || '',
                status: client.status || 'active',
              });
              setIsEditClientOpen(true);
            }}
          >
            <Pencil className="h-4 w-4 mr-2" />
            Edit
          </Button>
          <Button
            variant="outline"
            onClick={() => setLocation(`/clients/${clientId}/documents`)}
          >
            <FolderOpen className="h-4 w-4 mr-2" />
            Documents
          </Button>
          <Button
            style={{ backgroundColor: brandColor, borderColor: brandColor }}
            className="text-white hover:opacity-90"
            onClick={() => setLocation(`/clients/${clientId}/financials`)}
          >
            <BarChart2 className="h-4 w-4 mr-2" />
            View Financials
          </Button>
        </div>
      </div>

      {/* Client Information */}
      <Card>
        <CardHeader>
          <CardTitle>Client Information</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <dt className="text-sm font-medium text-gray-500">Email</dt>
              <dd className="mt-1">{client.email || '—'}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Phone</dt>
              <dd className="mt-1">{client.phone || '—'}</dd>
            </div>
            <div className="md:col-span-2">
              <dt className="text-sm font-medium text-gray-500">Address</dt>
              <dd className="mt-1">{client.address || '—'}</dd>
            </div>
            {client.notes && (
              <div className="md:col-span-2">
                <dt className="text-sm font-medium text-gray-500">Notes</dt>
                <dd className="mt-1 whitespace-pre-wrap">{client.notes}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* Project Timeline & Stages */}
      <Card style={{ borderTop: `3px solid ${brandColor}` }}>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Project Timeline &amp; Stages</CardTitle>
              <p className="text-sm text-gray-500 mt-1">Track project stages and designer fee milestones.</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {projectStages.length === 0 && !stagesLoading && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => initializeStagesMutation.mutate()}
                  disabled={initializeStagesMutation.isPending || orgStagesLoading || orgProjectStages.length === 0}
                >
                  {initializeStagesMutation.isPending
                    ? 'Initializing...'
                    : orgStagesLoading
                    ? 'Loading templates...'
                    : orgStagesError
                    ? `Error: ${(orgStagesError as Error).message}`
                    : orgProjectStages.length === 0
                    ? 'No org templates defined'
                    : 'Initialize from Org Template'}
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => openPStageDialog()}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Stage
              </Button>
              {client?.phone && projectStages.length > 0 && (
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => window.open(buildWhatsAppLink(), '_blank')}
                >
                  <MessageCircle className="h-4 w-4 mr-1" />
                  WhatsApp Reminder
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Timeline Date Inputs */}
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-gray-400" />
              <label className="text-sm font-medium text-gray-600 w-20">Start</label>
              <input
                type="date"
                className="border rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1"
                style={{ '--tw-ring-color': brandColor } as any}
                value={client?.estimated_start_date || ''}
                onChange={e => updateTimelineMutation.mutate({ field: 'estimated_start_date', value: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-gray-400" />
              <label className="text-sm font-medium text-gray-600 w-20">End</label>
              <input
                type="date"
                className="border rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1"
                style={{ '--tw-ring-color': brandColor } as any}
                value={client?.estimated_end_date || ''}
                onChange={e => updateTimelineMutation.mutate({ field: 'estimated_end_date', value: e.target.value })}
              />
            </div>
          </div>

          {/* Visual Stepper */}
          {stagesLoading ? (
            <p className="text-sm text-gray-400 py-4">Loading stages...</p>
          ) : projectStages.length === 0 ? (
            <div className="py-8 text-center text-gray-400 text-sm border-2 border-dashed rounded-lg">
              No project stages yet.<br />
              Click "Initialize from Org Template" to copy org stages, or "Add Stage" to create manually.
            </div>
          ) : (
            <>
              {/* Segmented payment-coverage bar */}
              {(() => {
                const totalPct = projectStages.reduce((s: number, st: any) => s + Number(st.fee_percentage || 0), 0) || 100;
                let cum = 0;
                return (
                  <div className="space-y-1.5">
                    {/* Bar */}
                    <div className="flex h-7 rounded-lg overflow-hidden border border-gray-200">
                      {projectStages.map((stage: any) => {
                        const pct = Number(stage.fee_percentage || 0);
                        const start = cum;
                        cum += pct;
                        const isCovered = cum <= paidPct;
                        const isPartial = !isCovered && start < paidPct;
                        const partialFill = isPartial && pct > 0 ? ((paidPct - start) / pct) * 100 : 0;
                        const widthPct = (pct / totalPct) * 100;
                        return (
                          <div
                            key={stage.id}
                            className="relative flex items-center justify-center text-xs font-semibold overflow-hidden border-r border-white/40 last:border-r-0"
                            style={{
                              width: `${widthPct}%`,
                              minWidth: 24,
                              backgroundColor: isCovered ? '#22c55e' : '#fee2e2',
                              color: isCovered ? 'white' : '#dc2626',
                            }}
                            title={`${stage.name} — ${pct}%`}
                          >
                            {isPartial && (
                              <div
                                className="absolute inset-y-0 left-0 bg-green-500"
                                style={{ width: `${partialFill}%` }}
                              />
                            )}
                            <span className="relative z-10 truncate px-1">{pct}%</span>
                          </div>
                        );
                      })}
                    </div>
                    {/* Stage name labels aligned to each bar segment */}
                    <div className="flex">
                      {projectStages.map((stage: any) => {
                        const pct = Number(stage.fee_percentage || 0);
                        const widthPct = (pct / totalPct) * 100;
                        return (
                          <div
                            key={stage.id}
                            className="truncate text-center text-[10px] text-gray-400 px-0.5"
                            style={{ width: `${widthPct}%`, minWidth: 24 }}
                          >
                            {stage.name}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Stage cards */}
              {(() => {
                let cum2 = 0;
                return (
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {projectStages.map((stage: any, idx: number) => {
                      const stageAccentColor = [brandColor, brandColor2, brandColor3][idx % 3];
                      const pct = Number(stage.fee_percentage || 0);
                      const start = cum2;
                      cum2 += pct;
                      const isCovered = cum2 <= paidPct;
                      const isPartial = !isCovered && start < paidPct;
                      const stageStatus = stage.status || 'not_started';

                      // Card color: driven by project status + payment coverage
                      const cardStyle = (() => {
                        if (stageStatus === 'not_started') {
                          return { borderColor: '#e5e7eb', backgroundColor: '#f9fafb' };
                        }
                        if (stageStatus === 'in_progress') {
                          return { borderColor: '#fde68a', backgroundColor: '#fffbeb' };
                        }
                        // completed
                        if (isCovered) return { borderColor: '#bbf7d0', backgroundColor: '#f0fdf4' };
                        if (isPartial) return { borderColor: '#fde68a', backgroundColor: '#fffbeb' };
                        return { borderColor: '#fecaca', backgroundColor: '#fff1f2' }; // completed, not paid
                      })();
                      return (
                        <div
                          key={stage.id}
                          className="border rounded-lg p-3 min-w-[130px] flex-shrink-0 flex flex-col gap-1.5"
                          style={{ ...cardStyle, borderLeftColor: stageAccentColor, borderLeftWidth: '3px' }}
                        >
                          <p className="text-xs font-semibold text-gray-800 truncate">{stage.name}</p>
                          <span className="text-xs font-mono text-gray-500">{pct}% of fee</span>
                          {totalDesignerFee > 0 && (
                            <span className="text-xs font-medium text-gray-700">
                              ₹{Math.round(pct / 100 * totalDesignerFee).toLocaleString('en-IN')}
                            </span>
                          )}
                          {totalDesignerFee > 0 && (() => {
                            const stageAmount = Math.round(pct / 100 * totalDesignerFee);
                            const stagePending = isCovered
                              ? 0
                              : isPartial
                                ? Math.round(stageAmount - (paidPct - start) / 100 * totalDesignerFee)
                                : stageAmount;
                            if (stagePending <= 0) return null;
                            return (
                              <span className="text-xs text-red-500">
                                Pending: ₹{stagePending.toLocaleString('en-IN')}
                              </span>
                            );
                          })()}
                          {projectStart && totalProjectDays > 0 ? (() => {
                            const stageStartDate = addDays(projectStart, Math.round(start / totalStagePct * totalProjectDays));
                            const stageEndDate = addDays(projectStart, Math.round(cum2 / totalStagePct * totalProjectDays));
                            const isOverdue = new Date() > stageEndDate && stage.status !== 'completed';
                            const daysOverdue = isOverdue ? Math.max(0, differenceInDays(new Date(), stageEndDate)) : 0;
                            return (
                              <>
                                <p className="text-[10px] text-gray-400">
                                  {format(stageStartDate, 'd MMM')} – {format(stageEndDate, 'd MMM yy')}
                                </p>
                                {isOverdue && (
                                  <span className="text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded px-1 py-0.5 w-fit">
                                    {daysOverdue}d overdue
                                  </span>
                                )}
                              </>
                            );
                          })() : (
                            <p className="text-[10px] text-gray-300">No project dates</p>
                          )}
                          {stage.target_date && (
                            <p className="text-[10px] text-gray-400">Target: {format(new Date(stage.target_date), 'd MMM yy')}</p>
                          )}
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full w-fit ${
                            isCovered
                              ? 'bg-green-100 text-green-700'
                              : isPartial
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-red-100 text-red-600'
                          }`}>
                            {isCovered ? 'Covered' : isPartial ? 'Partial' : 'Pending'}
                          </span>
                          <select
                            value={stage.status || 'not_started'}
                            onChange={e => updateStageStatusMutation.mutate({ id: stage.id, status: e.target.value })}
                            className="text-[10px] border rounded px-1 py-0.5 w-full cursor-pointer focus:outline-none bg-white"
                            style={{
                              color: stage.status === 'completed' ? '#22c55e'
                                : stage.status === 'in_progress' ? '#f59e0b'
                                : '#6b7280',
                            }}
                          >
                            <option value="not_started">Not Started</option>
                            <option value="in_progress">In Progress</option>
                            <option value="completed">Completed</option>
                          </select>
                          <div className="flex gap-1 mt-auto pt-1 justify-end">
                            <button
                              className="p-0.5 text-gray-400 hover:text-gray-600 transition-colors"
                              onClick={() => openPStageDialog(stage)}
                              title="Edit stage"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              className="p-0.5 text-red-300 hover:text-red-500 transition-colors"
                              onClick={() => deleteProjectStageMutation.mutate(stage.id)}
                              disabled={deleteProjectStageMutation.isPending}
                              title="Delete stage"
                            >
                              <Trash className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Overall progress bar */}
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Payment Progress</span>
                  <span className="font-medium" style={{ color: brandColor }}>{Math.round(paidPct)}% paid</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, paidPct)}%`, backgroundColor: brandColor }}
                  />
                </div>
              </div>

              {/* Fee Summary Strip */}
              {totalDesignerFee > 0 && (() => {
                const balance = totalDesignerFee - totalDesignerFeePaid;
                return (
                  <div className="p-3 rounded-lg border" style={{ backgroundColor: `${brandColor}08`, borderColor: `${brandColor}25` }}>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                      <div>
                        <span className="text-gray-500">Total Designer Fee: </span>
                        <span className="font-medium">₹{totalDesignerFee.toLocaleString('en-IN')}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Paid ({Math.round(paidPct)}%): </span>
                        <span className="font-medium text-green-700">₹{totalDesignerFeePaid.toLocaleString('en-IN')}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Balance Due: </span>
                        <span className={`font-semibold ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          ₹{Math.abs(balance).toLocaleString('en-IN')}{balance <= 0 ? ' (covered)' : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Project Stage Dialog */}
      <Dialog open={pStageDialogOpen} onOpenChange={setPStageDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPStage ? 'Edit Stage' : 'Add Project Stage'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Stage Name</label>
              <Input placeholder="e.g. Design Brief" value={pStageName} onChange={e => setPStageName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Fee %</label>
              <Input type="number" min="0" max="100" step="0.5" placeholder="25" value={pStageFee} onChange={e => setPStageFee(e.target.value)} className="mt-1" />
              <p className="text-xs text-gray-500 mt-1">% of total designer fee earned when this stage is complete.</p>
            </div>
            <div>
              <label className="text-sm font-medium">Target Date (optional)</label>
              <input
                type="date"
                value={pStageDate}
                onChange={e => setPStageDate(e.target.value)}
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setPStageDialogOpen(false)}>Cancel</Button>
            <Button
              style={{ backgroundColor: brandColor }}
              className="text-white hover:opacity-90"
              onClick={() => saveProjectStageMutation.mutate()}
              disabled={saveProjectStageMutation.isPending || !pStageName.trim()}
            >
              {saveProjectStageMutation.isPending ? 'Saving...' : editingPStage ? 'Update' : 'Add Stage'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Client Dialog */}
      <Dialog open={isEditClientOpen} onOpenChange={setIsEditClientOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Client</DialogTitle>
          </DialogHeader>
          <Form {...clientForm}>
            <form onSubmit={clientForm.handleSubmit(v => updateClientMutation.mutate(v))} className="space-y-4">
              <FormField
                control={clientForm.control}
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
                  control={clientForm.control}
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
                  control={clientForm.control}
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
                control={clientForm.control}
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
                control={clientForm.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value ?? 'active'} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={clientForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        value={field.value ?? ''}
                        placeholder="Add any notes about this client..."
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
                disabled={updateClientMutation.isPending}
              >
                {updateClientMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
