import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { format } from "date-fns";

interface Payment {
  date: string;
  amount: number;
  description: string | null;
}

interface ExportPaymentsProps {
  payments: Payment[];
  entityName: string;
  entityType: 'client' | 'vendor' | 'labor';
}

export function ExportPayments({ payments, entityName, entityType }: ExportPaymentsProps) {
  const handleExport = () => {
    // Format the data for CSV
    const csvData = [
      ['Date', 'Amount (₹)', 'Description'], // Headers
      ...payments.map(payment => [
        format(new Date(payment.date), 'yyyy-MM-dd'),
        payment.amount.toString(),
        payment.description || ''
      ])
    ];

    // Convert to CSV string
    const csvString = csvData.map(row => row.join(',')).join('\n');

    // Create blob and download
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${entityType}_${entityName}_payments_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      className="ml-auto"
    >
      <Download className="h-4 w-4 mr-2" />
      Export Payments
    </Button>
  );
}
