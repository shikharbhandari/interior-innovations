import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";
import {
  Bar,
  BarChart,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Card,
  CardContent,
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
import type { Payment } from "@/lib/schema";

export function PaymentHistory() {
  const { data: payments, isLoading } = useQuery({
    queryKey: ['payments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select(`
          *,
          clients (
            name
          ),
          vendors (
            name
          )
        `)
        .order('date', { ascending: false })
        .limit(10);

      if (error) throw error;
      return data as (Payment & {
        clients: { name: string } | null;
        vendors: { name: string } | null;
      })[];
    }
  });

  const chartData = payments?.map(payment => ({
    date: format(new Date(payment.date), 'MMM dd'),
    amount: Number(payment.amount)
  }));

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Recent Payments</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis
                  dataKey="date"
                />
                <YAxis />
                <Tooltip
                  formatter={(value) => [`₹${value}`, 'Amount']}
                />
                <Bar
                  dataKey="amount"
                  fill="hsl(215, 70%, 30%)"
                  opacity={0.8}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment History</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments?.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>
                    {format(new Date(payment.date), 'MMM dd, yyyy')}
                  </TableCell>
                  <TableCell>₹{payment.amount}</TableCell>
                  <TableCell className="capitalize">{payment.type}</TableCell>
                  <TableCell>
                    {payment.type === 'client'
                      ? payment.clients?.name
                      : payment.vendors?.name}
                  </TableCell>
                  <TableCell>{payment.description}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}