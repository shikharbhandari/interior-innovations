import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Pencil } from "lucide-react";
import type { Vendor, Payment } from "@/lib/schema";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export default function VendorDetails() {
  const params = useParams();
  const vendorId = params.id;
  const [isEditing, setIsEditing] = useState(false);
  const [notes, setNotes] = useState("");
  const { toast } = useToast();

  const { data: vendor, isLoading: vendorLoading } = useQuery({
    queryKey: ['vendor', vendorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendors')
        .select('*')
        .eq('id', vendorId)
        .single();
      if (error) throw error;
      if (data) {
        setNotes(data.notes || "");
      }
      return data as Vendor;
    },
  });

  const updateNotesMutation = useMutation({
    mutationFn: async (newNotes: string) => {
      const { error } = await supabase
        .from('vendors')
        .update({ notes: newNotes })
        .eq('id', vendorId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor', vendorId] });
      setIsEditing(false);
      toast({
        title: "Success",
        description: "Notes updated successfully",
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

  const { data: contracts, isLoading: contractsLoading } = useQuery({
    queryKey: ['vendor-contracts', vendorId],
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
        .eq('vendor_id', vendorId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const totalCommissionAmount = contracts?.reduce((sum, contract) => sum + Number(contract.commission_amount), 0) || 0;
  const totalPaidAmount = contracts?.reduce((sum, contract) => {
    return sum + (contract.payments?.reduce((pSum, payment) => pSum + Number(payment.amount), 0) || 0);
  }, 0) || 0;

  const handleSaveNotes = () => {
    updateNotesMutation.mutate(notes);
  };

  if (vendorLoading || contractsLoading) {
    return <div className="p-4">Loading...</div>;
  }

  if (!vendor) {
    return <div className="p-4">Vendor not found</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">{vendor.name}</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Vendor Information</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4">
              <div>
                <dt className="text-sm font-medium text-gray-500">Email</dt>
                <dd className="mt-1">{vendor.email}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Phone</dt>
                <dd className="mt-1">{vendor.phone}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Category</dt>
                <dd className="mt-1">{vendor.category}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500 flex justify-between items-center">
                  Notes
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditing(!isEditing)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </dt>
                <dd className="mt-1">
                  {isEditing ? (
                    <div className="space-y-2">
                      <Textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Add notes about the vendor..."
                        className="min-h-[100px]"
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setIsEditing(false);
                            setNotes(vendor.notes || "");
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleSaveNotes}
                          disabled={updateNotesMutation.isPending}
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap">
                      {vendor.notes || "No notes added"}
                    </div>
                  )}
                </dd>
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