import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import type { Labor, Payment } from "@/lib/schema";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function LaborDetails() {
  const params = useParams();
  const laborId = params.id;
  const { toast } = useToast();

  const { data: labor, isLoading: laborLoading } = useQuery({
    queryKey: ['labor', laborId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('labors')
        .select('*')
        .eq('id', laborId)
        .single();
      if (error) throw error;
      return data as Labor;
    },
  });

  const { data: contracts, isLoading: contractsLoading } = useQuery({
    queryKey: ['labor-contracts', laborId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select(`
          *,
          clients (
            name
          ),
          payments (
            id,
            amount,
            date,
            type,
            description
          )
        `)
        .eq('labor_id', laborId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const totalCommissionAmount = contracts?.reduce((sum, contract) => sum + Number(contract.commission_amount), 0) || 0;
  const totalPaidAmount = contracts?.reduce((sum, contract) => {
    return sum + (contract.payments?.reduce((pSum, payment) => pSum + Number(payment.amount), 0) || 0);
  }, 0) || 0;

  if (laborLoading || contractsLoading) {
    return <div className="p-4">Loading...</div>;
  }

  if (!labor) {
    return <div className="p-4">Labor not found</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">{labor.name}</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Labor Information</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4">
              <div>
                <dt className="text-sm font-medium text-gray-500">Phone</dt>
                <dd className="mt-1">{labor.phone}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Specialization</dt>
                <dd className="mt-1">{labor.specialization}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Notes</dt>
                <dd className="mt-1 whitespace-pre-wrap">{labor.notes}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Commission Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4">
              <div>
                <dt className="text-sm font-medium text-gray-500">Total Commission Amount</dt>
                <dd className="mt-1 text-xl">₹{totalCommissionAmount.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Total Paid</dt>
                <dd className="mt-1 text-xl">₹{totalPaidAmount.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Pending Amount</dt>
                <dd className="mt-1 text-xl font-bold text-orange-600">
                  ₹{(totalCommissionAmount - totalPaidAmount).toLocaleString()}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contracts & Payments</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {contracts?.map((contract) => (
              <div key={contract.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-semibold">{contract.title}</h3>
                    <p className="text-sm text-gray-500">Client: {contract.clients?.name}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-500">Commission</div>
                    <div className="font-medium">
                      {contract.commission_percentage}% (₹{Number(contract.commission_amount).toLocaleString()})
                    </div>
                  </div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contract.payments?.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>
                          {format(new Date(payment.date), 'MMM dd, yyyy')}
                        </TableCell>
                        <TableCell>₹{Number(payment.amount).toLocaleString()}</TableCell>
                        <TableCell>{payment.description}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <div className="mt-4 flex justify-between items-center">
                  <div>
                    <span className="text-sm text-gray-500">Pending:</span>
                    <span className="ml-2 font-medium text-orange-600">
                      ₹{(Number(contract.commission_amount) - 
                        (contract.payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0)
                      ).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}