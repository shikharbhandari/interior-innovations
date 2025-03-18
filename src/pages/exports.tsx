import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";
import { Download } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";

export default function Exports() {
  const [paymentType, setPaymentType] = useState<"all" | "client" | "vendor" | "labor">("all");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);

  const { data: payments, isLoading } = useQuery({
    queryKey: ['export-payments', paymentType, startDate, endDate],
    queryFn: async () => {
      let query = supabase
        .from('payments')
        .select(`
          *,
          contract:contracts (
            title,
            vendor:vendors (
              name
            ),
            labor:labors (
              name
            ),
            client:clients (
              name
            )
          )
        `);

      if (paymentType !== "all") {
        query = query.eq('type', paymentType);
      }

      if (startDate) {
        query = query.gte('date', format(startDate, 'yyyy-MM-dd'));
      }

      if (endDate) {
        const nextDay = new Date(endDate);
        nextDay.setDate(nextDay.getDate() + 1);
        query = query.lt('date', format(nextDay, 'yyyy-MM-dd'));
      }

      const { data, error } = await query.order('date', { ascending: false });

      if (error) {
        console.error('Export query error:', error);
        throw error;
      }

      console.log('Export data:', data);
      return data;
    }
  });

  const handleExport = () => {
    if (!payments?.length) {
      console.log('No payments to export');
      return;
    }

    console.log('Preparing export for payments:', payments);

    // Format the data for CSV
    const csvData = [
      ['Date', 'Amount (₹)', 'Type', 'Contract', 'Entity Name', 'Description'], // Headers
      ...payments.map(payment => {
        let entityName = '';
        if (payment.contract) {
          if (payment.type === 'client') {
            entityName = payment.contract.client?.name || '';
          } else if (payment.type === 'vendor') {
            entityName = payment.contract.vendor?.name || '';
          } else if (payment.type === 'labor') {
            entityName = payment.contract.labor?.name || '';
          }
        }

        return [
          format(new Date(payment.date), 'yyyy-MM-dd'),
          payment.amount.toString(),
          payment.type,
          payment.contract?.title || '',
          entityName,
          payment.description || ''
        ];
      })
    ];

    // Convert to CSV string
    const csvString = csvData.map(row => row.join(',')).join('\n');

    // Create blob and download
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute(
      'download', 
      `payments_${paymentType}_${format(new Date(), 'yyyy-MM-dd')}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isLoading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Export Payment Data</h1>

      <Card>
        <CardHeader>
          <CardTitle>Export Options</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Payment Type</label>
            <Select value={paymentType} onValueChange={(value: any) => setPaymentType(value)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select payment type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Payments</SelectItem>
                <SelectItem value="client">Client Payments</SelectItem>
                <SelectItem value="vendor">Vendor Payments</SelectItem>
                <SelectItem value="labor">Labor Payments</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Start Date</label>
              <DatePicker 
                date={startDate} 
                onDateChange={setStartDate}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">End Date</label>
              <DatePicker 
                date={endDate} 
                onDateChange={setEndDate}
              />
            </div>
          </div>

          <Button 
            onClick={handleExport}
            disabled={!payments?.length}
            className="w-full mt-4"
          >
            <Download className="h-4 w-4 mr-2" />
            Export Payments ({payments?.length || 0} records)
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}