import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { DollarSign, Users, Truck, CheckSquare, TrendingUp, Clock, IndianRupee, Wallet } from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Task } from "@/lib/schema";

const TASK_STATUSES = [
  "Not Started",
  "In Progress",
  "On Hold",
  "Completed",
  "Cancelled"
] as const;

function StatsCard({
  title,
  value,
  subValue,
  subValue2,
  icon: Icon
}: {
  title: string;
  value: string | number;
  subValue?: string;
  subValue2?: string;
  icon: React.ComponentType<any>;
}) {
  return (
    <Card className="hover:bg-accent/10 transition-colors cursor-pointer">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            {subValue && (
              <p className="text-sm text-muted-foreground mt-1">{subValue}</p>
            )}
            {subValue2 && (
              <p className="text-sm text-orange-600 mt-1">{subValue2}</p>
            )}
          </div>
          <Icon className="h-8 w-8 text-primary/40" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { toast } = useToast();
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const [
        clientsResult, 
        activeClientsResult,
        vendorsResult, 
        tasksResult, 
        laborsResult,
        paymentsResult, 
        recentTasksResult,
        contractsResult,
        clientContractsAmount
      ] = await Promise.all([
        supabase.from('clients').select('count', { count: 'exact' }).single(),
        supabase.from('clients').select('count', { count: 'exact' }).eq('status', 'active').single(),
        supabase.from('vendors').select('count', { count: 'exact' }).single(),
        supabase.from('tasks').select('count', { count: 'exact' }).single(),
        supabase.from('labors').select('count', { count: 'exact' }).single(),
        supabase.from('payments').select('*').order('date', { ascending: false }),
        supabase
          .from('tasks')
          .select(`
            *,
            clients (
              name
            )
          `)
          .neq('status', 'Completed')
          .order('due_date', { ascending: true })
          .limit(10),
        supabase
          .from('contracts')
          .select(`
            *,
            payments (
              amount,
              type
            )
          `),
        supabase
          .from('clients')
          .select(`
            *
          `)
      ]);

      // Calculate commission stats for all contracts
      const contracts = contractsResult.data || [];

      const totalCommission = contracts.reduce((sum, contract) => 
        sum + Number(contract.commission_amount), 0);

      // Calculate pending commissions (commission amount - paid amount) for all contracts
      const pendingCommission = contracts.reduce((sum, contract) => {
        const paidAmount = (contract.payments || [])
          .filter(p => p.type !== 'client')
          .reduce((pSum, p) => pSum + Number(p.amount), 0);
        return sum + (Number(contract.commission_amount) - paidAmount);
      }, 0);

      // Calculate client amounts for all contracts
      const totalClientAmount = (clientContractsAmount?.data ?? []).reduce((sum, contract) => 
        sum + Number(contract.contract_amount), 0);

      // Calculate pending client amounts for all contracts
      const paidAmount = (paymentsResult.data || [])
        .filter(p => !p.contract_id)
          .reduce((pSum, p) => pSum + Number(p.amount), 0);
      const pendingClientAmount = totalClientAmount - paidAmount
        

      // Process payment trends
      const trends = paymentsResult.data?.reduce((acc: any, payment) => {
        const month = format(new Date(payment.date), 'MMM yyyy');
        if (!acc[month]) {
          acc[month] = { client: 0, vendor: 0, labor: 0 };
        }
        acc[month][payment.type] = (acc[month][payment.type] || 0) + Number(payment.amount);
        return acc;
      }, {}) || {};

      const paymentTrends = Object.entries(trends).map(([month, amounts]) => ({
        month,
        ...amounts as { client: number; vendor: number; labor: number }
      }));

      return {
        totalClients: clientsResult.data?.count || 0,
        activeClients: activeClientsResult.data?.count || 0,
        totalVendors: vendorsResult.data?.count || 0,
        totalTasks: tasksResult.data?.count || 0,
        totalLabors: laborsResult.data?.count || 0,
        totalPayments: paymentsResult.data?.reduce((acc, curr) => acc + Number(curr.amount), 0) || 0,
        recentTasks: recentTasksResult.data || [],
        paymentTrends,
        totalCommission,
        pendingCommission,
        totalClientAmount,
        pendingClientAmount
      };
    }
  });

  // Add mutation for updating task status
  const updateTaskStatus = useMutation({
    mutationFn: async ({ taskId, newStatus }: { taskId: string, newStatus: string }) => {
      const { error } = await supabase
        .from('tasks')
        .update({ status: newStatus })
        .eq('id', taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast({
        title: "Success",
        description: "Task status updated",
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

  const handleStatusChange = (taskId: string, newStatus: string) => {
    updateTaskStatus.mutate({ taskId, newStatus });
  };

  if (statsLoading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Link href="/clients">
          <StatsCard
            title="Total Clients"
            value={stats?.totalClients || 0}
            icon={Users}
          />
        </Link>
        <Link href="/clients">
          <StatsCard
            title="Active Clients"
            value={stats?.activeClients || 0}
            icon={Users}
          />
        </Link>
        <Link href="/vendors">
          <StatsCard
            title="Total Vendors"
            value={stats?.totalVendors || 0}
            icon={Truck}
          />
        </Link>
        <Link href="/labors">
          <StatsCard
            title="Total Labors"
            value={stats?.totalLabors || 0}
            icon={Users}
          />
        </Link>
        <StatsCard
          title="Commission Summary"
          value={`₹${(stats?.totalCommission || 0).toLocaleString()}`}
          subValue={`Total Commission from All Contracts`}
          subValue2={`Pending: ₹${(stats?.pendingCommission || 0).toLocaleString()}`}
          icon={IndianRupee}
        />
        <StatsCard
          title="Client Amount Summary"
          value={`₹${(stats?.totalClientAmount || 0).toLocaleString()}`}
          subValue={`Total Amount from All Contracts`}
          subValue2={`Pending: ₹${(stats?.pendingClientAmount || 0).toLocaleString()}`}
          icon={Wallet}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Trends Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Payment Trends
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-4">
                {stats?.paymentTrends.map(trend => (
                  <div key={trend.month} className="space-y-2">
                    <div className="font-medium text-sm">{trend.month}</div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>Clients</span>
                        <span className="font-bold">₹{trend.client.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Vendors</span>
                        <span className="font-bold">₹{trend.vendor.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Labors</span>
                        <span className="font-bold">₹{trend.labor.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Recent Tasks Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Recent Tasks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              <div className="space-y-4 pr-4">
                {stats?.recentTasks.map((task) => (
                  <div key={task.id} className="flex items-center justify-between bg-white p-3 rounded-lg shadow-sm">
                    <div>
                      <Link href={`/tasks/${task.id}`} className="hover:underline">
                        <p className="text-sm font-medium">{task.title}</p>
                      </Link>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-xs text-gray-500">
                          {format(new Date(task.due_date), 'MMM dd, yyyy')}
                        </p>
                        {task.clients?.name && (
                          <p className="text-xs text-gray-500">
                            • {task.clients.name}
                          </p>
                        )}
                      </div>
                    </div>
                    <Select
                      value={task.status}
                      onValueChange={(value) => handleStatusChange(task.id.toString(), value)}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TASK_STATUSES.map((status) => (
                          <SelectItem 
                            key={status} 
                            value={status}
                            className={
                              status === 'Completed' ? 'text-emerald-600' :
                              status === 'In Progress' ? 'text-sky-600' :
                              status === 'On Hold' ? 'text-amber-600' :
                              status === 'Cancelled' ? 'text-slate-500' :
                              'text-slate-500'
                            }
                          >
                            {status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}