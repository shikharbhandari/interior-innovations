import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";

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

export default function ContractDetails() {
  const { id } = useParams();

  const { data: contract, isLoading } = useQuery({
    queryKey: ['contract', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select(`
          *,
          clients (
            id,
            name,
            email,
            phone
          ),
          vendors (
            id,
            name,
            email,
            phone
          ),
          labors (
            id,
            name,
            phone,
            specialization
          ),
          payments (
            id,
            amount,
            date,
            type,
            description
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    }
  });

  if (isLoading) {
    return <div className="p-6">Loading...</div>;
  }

  if (!contract) {
    return <div className="p-6">Contract not found</div>;
  }

  // Calculate payment summaries
  const clientPayments = contract.payments?.filter(payment => payment.type === 'client') || [];
  const vendorLaborPayments = contract.payments?.filter(payment => ['vendor', 'labor'].includes(payment.type)) || [];

  const totalClientPayments = clientPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const totalVendorLaborPayments = vendorLaborPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);

  const remainingClientAmount = Number(contract.contract_amount) - totalClientPayments;
  const remainingCommission = Number(contract.commission_amount) - totalVendorLaborPayments;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold">{contract.title}</h1>
          <p className="text-muted-foreground">{contract.description}</p>
        </div>
        <div className="text-right">
          <div className="font-semibold">Status</div>
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
            contract.status === 'active'
              ? 'bg-emerald-50/50 text-emerald-600'
              : 'bg-slate-50/50 text-slate-500'
          }`}>
            {contract.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Contract Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="font-semibold">Client</div>
              <div>{contract.clients?.name}</div>
              <div className="text-sm text-muted-foreground">
                {contract.clients?.email} • {contract.clients?.phone}
              </div>
            </div>
            <div>
              <div className="font-semibold">
                {contract.vendors ? 'Vendor' : 'Labor'}
              </div>
              <div>{contract.vendors?.name || contract.labors?.name}</div>
              <div className="text-sm text-muted-foreground">
                {contract.vendors ? (
                  <>{contract.vendors.email} • {contract.vendors.phone}</>
                ) : (
                  <>{contract.labors?.phone} • {contract.labors?.specialization}</>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Financial Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="font-semibold mb-2">Contract Details</div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">Contract Amount</div>
                  <div className="text-lg">₹{Number(contract.contract_amount).toLocaleString()}</div>
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="font-semibold mb-2">Commission Status</div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">Commission Rate</div>
                  <div className="text-lg">{contract.commission_percentage}%</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Total Commission</div>
                  <div className="text-lg">₹{Number(contract.commission_amount).toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Commission Paid</div>
                  <div className="text-lg">₹{totalVendorLaborPayments.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Commission Pending</div>
                  <div className="text-lg font-semibold text-orange-600">₹{remainingCommission.toLocaleString()}</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

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
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contract.payments?.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>{format(new Date(payment.date), 'dd MMM yyyy')}</TableCell>
                  <TableCell>₹{Number(payment.amount).toLocaleString()}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      payment.type === 'client'
                        ? 'bg-blue-50 text-blue-600'
                        : 'bg-purple-50 text-purple-600'
                    }`}>
                      {payment.type.charAt(0).toUpperCase() + payment.type.slice(1)}
                    </span>
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