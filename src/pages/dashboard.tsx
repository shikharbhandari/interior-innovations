import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { TrendingUp, Clock, IndianRupee, Wallet, Target, Users, Truck } from "lucide-react";
import { format } from "date-fns";
import { Link, useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useBrandColor } from "@/hooks/use-brand-color";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const TASK_STATUSES = [
  "Not Started",
  "In Progress",
  "On Hold",
  "Completed",
  "Cancelled"
] as const;

const TASK_STATUS_COLORS: Record<string, string> = {
  "Not Started": "#94a3b8",
  "In Progress": "#3b82f6",
  "On Hold":     "#f59e0b",
  "Completed":   "#22c55e",
  "Cancelled":   "#ef4444",
};

function StatsCard({
  title,
  value,
  subValue,
  subValue2,
  icon: Icon,
  onClick,
  onSubValue2Click,
  brandColor
}: {
  title: string;
  value: string | number;
  subValue?: string;
  subValue2?: string;
  icon: React.ComponentType<any>;
  onClick?: () => void;
  onSubValue2Click?: () => void;
  brandColor?: string;
}) {
  return (
    <Card
      className="transition-colors cursor-pointer overflow-hidden"
      onClick={onClick}
      style={{
        transition: 'background-color 0.2s',
        borderTop: brandColor ? `3px solid ${brandColor}` : undefined,
      }}
      onMouseEnter={(e) => {
        if (brandColor) e.currentTarget.style.backgroundColor = `${brandColor}10`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = '';
      }}
    >
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            {subValue && (
              <p className="text-sm text-muted-foreground mt-1">{subValue}</p>
            )}
            {subValue2 && (
              <p
                className="text-sm mt-1 hover:underline font-medium"
                style={{ color: brandColor || '#ea580c' }}
                onClick={(e) => {
                  if (onSubValue2Click) {
                    e.stopPropagation();
                    onSubValue2Click();
                  }
                }}
              >
                {subValue2}
              </p>
            )}
          </div>
          <Icon
            className="h-8 w-8"
            style={{ color: brandColor ? `${brandColor}66` : 'rgba(var(--primary), 0.4)' }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// Custom tooltip for the bar chart
function PaymentTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} className="flex justify-between gap-6">
          <span style={{ color: entry.color }}>{entry.name}</span>
          <span className="font-medium">₹{Number(entry.value).toLocaleString('en-IN')}</span>
        </div>
      ))}
    </div>
  );
}

function fmtInr(v: number) {
  if (v >= 10_00_000) return `₹${(v / 10_00_000).toFixed(1)}L`;
  if (v >= 1_000)    return `₹${(v / 1_000).toFixed(0)}K`;
  return `₹${v}`;
}

function ForecastTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      <div className="flex justify-between gap-6">
        <span className="text-gray-500">Expected</span>
        <span className="font-medium">₹{Number(payload[0]?.value).toLocaleString('en-IN')}</span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { currentOrganization, user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { brandColor, brandColor2, brandColor3 } = useBrandColor();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats', currentOrganization?.organization_id],
    queryFn: async () => {
      if (!currentOrganization) throw new Error('No organization selected');

      const [
        clientsResult,
        activeClientsResult,
        vendorsResult,
        tasksResult,
        laborsResult,
        paymentsResult,
        recentTasksResult,
        lineItemsResult,
        leadsResult,
        leadStagesResult,
        taskStatusesResult,
      ] = await Promise.all([
        supabase.from('clients').select('count', { count: 'exact' }).eq('organization_id', currentOrganization.organization_id).single(),
        supabase.from('clients').select('count', { count: 'exact' }).eq('organization_id', currentOrganization.organization_id).eq('status', 'active').single(),
        supabase.from('vendors').select('count', { count: 'exact' }).eq('organization_id', currentOrganization.organization_id).single(),
        supabase.from('tasks').select('count', { count: 'exact' }).eq('organization_id', currentOrganization.organization_id).single(),
        supabase.from('labors').select('count', { count: 'exact' }).eq('organization_id', currentOrganization.organization_id).single(),
        supabase.from('payments').select('*').eq('organization_id', currentOrganization.organization_id).order('date', { ascending: false }),
        supabase
          .from('tasks')
          .select(`*, clients (name)`)
          .eq('organization_id', currentOrganization.organization_id)
          .neq('status', 'Completed')
          .order('due_date', { ascending: true })
          .limit(10),
        supabase
          .from('client_line_items')
          .select(`*, line_item_payments (amount)`)
          .eq('organization_id', currentOrganization.organization_id),
        supabase.from('leads').select('id, stage_id').eq('organization_id', currentOrganization.organization_id),
        supabase.from('lead_stages').select('id, is_won, is_lost').eq('organization_id', currentOrganization.organization_id),
        supabase.from('tasks').select('status').eq('organization_id', currentOrganization.organization_id),
      ]);

      // Commission & payments
      const lineItems = lineItemsResult.data || [];
      const totalCommission = lineItems.reduce((sum: number, item: any) => {
        if (item.is_legacy) return sum + Number(item.commission_amount || 0);
        if (item.type === 'fee') return sum;
        return sum + (Number(item.billing_amount || 0) - Number(item.actual_amount || 0));
      }, 0);

      const totalClientReceived = (paymentsResult.data || [])
        .filter((p: any) => p.type === 'client')
        .reduce((sum: number, p: any) => sum + Number(p.amount), 0);

      const totalOwed = lineItems.filter((item: any) => !item.is_legacy).reduce((sum: number, item: any) => {
        return sum + Number(item.billing_amount || 0);
      }, 0);
      const pendingClientAmount = totalOwed - totalClientReceived;

      // Payment trends — sorted chronologically, last 6 months
      const trendsMap: Record<string, { client: number; vendor: number; labor: number; sortKey: string }> = {};
      for (const payment of paymentsResult.data || []) {
        const date = new Date(payment.date);
        const month = format(date, 'MMM yy');
        const sortKey = format(date, 'yyyy-MM');
        if (!trendsMap[month]) {
          trendsMap[month] = { client: 0, vendor: 0, labor: 0, sortKey };
        }
        trendsMap[month][payment.type as 'client' | 'vendor' | 'labor'] =
          (trendsMap[month][payment.type as 'client' | 'vendor' | 'labor'] || 0) + Number(payment.amount);
      }
      const paymentTrends = Object.entries(trendsMap)
        .map(([month, amounts]) => ({ month, ...amounts }))
        .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
        .slice(-6);

      // Lead breakdown
      const wonIds  = (leadStagesResult.data || []).filter((s: any) => s.is_won).map((s: any) => s.id);
      const lostIds = (leadStagesResult.data || []).filter((s: any) => s.is_lost).map((s: any) => s.id);
      const allLeads = leadsResult.data || [];
      const leadBreakdown = {
        won:    allLeads.filter((l: any) => l.stage_id && wonIds.includes(l.stage_id)).length,
        lost:   allLeads.filter((l: any) => l.stage_id && lostIds.includes(l.stage_id)).length,
        active: allLeads.filter((l: any) => !l.stage_id || (!wonIds.includes(l.stage_id) && !lostIds.includes(l.stage_id))).length,
      };

      // Task status breakdown
      const taskStatuses = taskStatusesResult.data || [];
      const taskStatusBreakdown: Record<string, number> = {};
      for (const status of TASK_STATUSES) {
        taskStatusBreakdown[status] = taskStatuses.filter((t: any) => t.status === status).length;
      }

      // Conversion rate
      const totalLeads = allLeads.length;
      const wonLeads = leadBreakdown.won;
      const conversionRate = totalLeads ? Math.round((wonLeads / totalLeads) * 100) : 0;

      return {
        totalClients: clientsResult.data?.count || 0,
        activeClients: activeClientsResult.data?.count || 0,
        totalVendors: vendorsResult.data?.count || 0,
        totalTasks: tasksResult.data?.count || 0,
        totalLabors: laborsResult.data?.count || 0,
        recentTasks: recentTasksResult.data || [],
        paymentTrends,
        totalCommission,
        totalClientReceived,
        pendingClientAmount,
        totalLeads,
        wonLeads,
        conversionRate,
        leadBreakdown,
        taskStatusBreakdown,
      };
    },
    enabled: !!currentOrganization,
  });

  const updateTaskStatus = useMutation({
    mutationFn: async ({ taskId, newStatus }: { taskId: string; newStatus: string }) => {
      if (!user) throw new Error('Not authorized');
      const { error } = await supabase
        .from('tasks')
        .update({ status: newStatus, updated_by: user.id })
        .eq('id', taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats', currentOrganization?.organization_id] });
      toast({ title: "Success", description: "Task status updated" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  const handleStatusChange = (taskId: string, newStatus: string) => {
    updateTaskStatus.mutate({ taskId, newStatus });
  };

  const { data: forecastData } = useQuery({
    queryKey: ['earnings-forecast', currentOrganization?.organization_id],
    queryFn: async () => {
      if (!currentOrganization) throw new Error('No organization');
      const today = new Date();
      const sixMonthsLater = new Date(today);
      sixMonthsLater.setMonth(today.getMonth() + 6);

      const [{ data: stages }, { data: fees }] = await Promise.all([
        supabase
          .from('project_stages')
          .select('client_id, fee_percentage, target_date, status')
          .eq('organization_id', currentOrganization.organization_id)
          .neq('status', 'completed')
          .eq('is_completed', false)
          .gte('target_date', today.toISOString().slice(0, 10))
          .lte('target_date', sixMonthsLater.toISOString().slice(0, 10)),
        supabase
          .from('designer_fees')
          .select('client_id, billing_amount')
          .eq('organization_id', currentOrganization.organization_id),
      ]);

      const clientFeeMap: Record<number, number> = {};
      for (const fee of fees || []) {
        clientFeeMap[fee.client_id] = (clientFeeMap[fee.client_id] || 0) + Number(fee.billing_amount || 0);
      }

      const monthMap: Record<string, number> = {};
      for (const stage of stages || []) {
        if (!stage.target_date) continue;
        const clientTotal = clientFeeMap[stage.client_id] || 0;
        if (clientTotal === 0) continue;
        const amount = Math.round((Number(stage.fee_percentage) / 100) * clientTotal);
        const month = format(new Date(stage.target_date), 'MMM yy');
        monthMap[month] = (monthMap[month] || 0) + amount;
      }

      return Array.from({ length: 6 }, (_, i) => {
        const d = new Date(today);
        d.setMonth(today.getMonth() + i);
        const month = format(d, 'MMM yy');
        return { month, forecast: monthMap[month] || 0 };
      });
    },
    enabled: !!currentOrganization,
  });

  if (statsLoading) {
    return <div className="p-6">Loading...</div>;
  }

  // Lead donut data
  const leadPieData = [
    { name: 'Won',    value: stats?.leadBreakdown.won    || 0, color: brandColor },
    { name: 'Active', value: stats?.leadBreakdown.active || 0, color: brandColor2 },
    { name: 'Lost',   value: stats?.leadBreakdown.lost   || 0, color: brandColor3 },
  ].filter(d => d.value > 0);

  // Task status donut data
  const taskPieData = TASK_STATUSES
    .map(s => ({ name: s, value: stats?.taskStatusBreakdown[s] || 0, color: TASK_STATUS_COLORS[s] }))
    .filter(d => d.value > 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Link href="/clients">
          <StatsCard title="Total Clients"  value={stats?.totalClients || 0}  icon={Users}  brandColor={brandColor} />
        </Link>
        <StatsCard
          title="Active Clients" value={stats?.activeClients || 0} icon={Users}
          onClick={() => setLocation('/clients?status=active')} brandColor={brandColor}
        />
        <Link href="/vendors">
          <StatsCard title="Total Vendors" value={stats?.totalVendors || 0} icon={Truck} brandColor={brandColor} />
        </Link>
        <Link href="/labors">
          <StatsCard title="Total Labors" value={stats?.totalLabors || 0} icon={Users} brandColor={brandColor} />
        </Link>
        <StatsCard
          title="Commission Earned"
          value={`₹${(stats?.totalCommission || 0).toLocaleString('en-IN')}`}
          subValue="Total commission across all projects"
          icon={IndianRupee}
          onClick={() => setLocation('/clients')}
          brandColor={brandColor}
        />
        <StatsCard
          title="Client Balance"
          value={`₹${Math.abs(stats?.pendingClientAmount || 0).toLocaleString('en-IN')}`}
          subValue={`Received: ₹${(stats?.totalClientReceived || 0).toLocaleString('en-IN')}`}
          subValue2={(stats?.pendingClientAmount || 0) > 0 ? `Clients owe: ₹${(stats?.pendingClientAmount || 0).toLocaleString('en-IN')}` : 'Fully covered'}
          icon={Wallet}
          onClick={() => setLocation('/clients')}
          brandColor={brandColor}
        />
        <StatsCard
          title="Lead Conversion"
          value={`${stats?.conversionRate || 0}%`}
          subValue={`${stats?.wonLeads || 0} won of ${stats?.totalLeads || 0} leads`}
          icon={Target}
          onClick={() => setLocation('/leads')}
          brandColor={brandColor}
        />
      </div>

      {/* Row 2: Payment Trends (2/3) + Lead Breakdown (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Payment Trends Bar Chart */}
        <Card className="lg:col-span-2" style={{ borderTop: `3px solid ${brandColor}` }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" style={{ color: brandColor }} />
              Payment Trends
              <span className="text-xs font-normal text-gray-400 ml-1">(last 6 months)</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(stats?.paymentTrends?.length ?? 0) === 0 ? (
              <div className="h-[280px] flex items-center justify-center text-gray-400 text-sm">
                No payment data yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={stats?.paymentTrends} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={fmtInr}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                  />
                  <Tooltip content={<PaymentTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="client" name="Client Received" fill={brandColor}  radius={[3, 3, 0, 0]} />
                  <Bar dataKey="vendor" name="Vendor Paid"     fill={brandColor2} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="labor"  name="Labor Paid"      fill={brandColor3} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Lead Breakdown Donut */}
        <Card style={{ borderTop: `3px solid ${brandColor}` }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" style={{ color: brandColor }} />
              Lead Breakdown
            </CardTitle>
            <p className="text-xs text-gray-400">{stats?.totalLeads || 0} total leads</p>
          </CardHeader>
          <CardContent>
            {(stats?.totalLeads ?? 0) === 0 ? (
              <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm">
                No leads yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={leadPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    dataKey="value"
                    paddingAngle={2}
                  >
                    {leadPieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any, name: string) => [`${v} leads`, name]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Task Status (1/2) + Recent Tasks (1/2) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Task Status Donut */}
        <Card style={{ borderTop: `3px solid ${brandColor}` }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" style={{ color: brandColor }} />
              Task Status
            </CardTitle>
            <p className="text-xs text-gray-400">{stats?.totalTasks || 0} total tasks</p>
          </CardHeader>
          <CardContent>
            {taskPieData.length === 0 ? (
              <div className="h-[240px] flex items-center justify-center text-gray-400 text-sm">
                No tasks yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={taskPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    dataKey="value"
                    paddingAngle={2}
                  >
                    {taskPieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any, name: string) => [`${v} tasks`, name]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Recent Tasks */}
        <Card style={{ borderTop: `3px solid ${brandColor}` }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" style={{ color: brandColor }} />
              Recent Tasks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[240px]">
              <div className="space-y-3 pr-4">
                {(stats?.recentTasks || []).length === 0 ? (
                  <p className="text-sm text-gray-400 text-center pt-8">No pending tasks</p>
                ) : (
                  stats?.recentTasks.map((task) => (
                    <div key={task.id} className="flex items-center justify-between bg-white p-3 rounded-lg shadow-sm">
                      <div className="min-w-0 flex-1 mr-3">
                        <Link href={`/tasks/${task.id}`} className="hover:underline">
                          <p className="text-sm font-medium truncate">{task.title}</p>
                        </Link>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-xs text-gray-500">
                            {format(new Date(task.due_date), 'MMM dd, yyyy')}
                          </p>
                          {task.clients?.name && (
                            <p className="text-xs text-gray-500">• {task.clients.name}</p>
                          )}
                        </div>
                      </div>
                      <Select
                        value={task.status}
                        onValueChange={(value) => handleStatusChange(task.id.toString(), value)}
                      >
                        <SelectTrigger className="w-[130px] shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TASK_STATUSES.map((status) => (
                            <SelectItem
                              key={status}
                              value={status}
                              className={
                                status === 'Completed'  ? 'text-emerald-600' :
                                status === 'In Progress' ? 'text-sky-600' :
                                status === 'On Hold'     ? 'text-amber-600' :
                                status === 'Cancelled'   ? 'text-slate-500' :
                                'text-slate-500'
                              }
                            >
                              {status}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Earnings Forecast */}
      <Card style={{ borderTop: `3px solid ${brandColor}` }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" style={{ color: brandColor }} />
            Earnings Forecast
            <span className="text-xs font-normal text-gray-400 ml-1">(next 6 months — based on stage target dates)</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {forecastData?.every(d => d.forecast === 0) ? (
            <div className="h-[240px] flex items-center justify-center text-gray-400 text-sm">
              No stages with target dates in the next 6 months
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={forecastData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtInr} axisLine={false} tickLine={false} width={52} />
                <Tooltip content={<ForecastTooltip />} />
                <Bar dataKey="forecast" name="Expected Earnings" fill={brandColor} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
