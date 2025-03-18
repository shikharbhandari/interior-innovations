import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Plus, Pencil, Trash } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import * as z from 'zod';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import type { Client, Payment } from "@/lib/schema";

const insertPaymentSchema = z.object({
  amount: z.number().min(0),
  date: z.string(),
  description: z.string().optional(),
});

type InsertPayment = z.infer<typeof insertPaymentSchema>;

export default function ClientDetails() {
  const params = useParams();
  const clientId = params.id;  // No need to parse as int, keep as UUID string
  const [isOpen, setIsOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const { toast } = useToast();

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

  const { data: payments, isLoading: paymentsLoading } = useQuery({
    queryKey: ['client-payments', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('client_id', clientId)
        .order('date', { ascending: false });
      if (error) throw error;
      return data as Payment[];
    },
  });

  const form = useForm<InsertPayment>({
    resolver: zodResolver(insertPaymentSchema),
    defaultValues: {
      amount: 0,
      date: new Date().toISOString().split('T')[0],
      description: '',
    }
  });

  const createPaymentMutation = useMutation({
    mutationFn: async (values: InsertPayment) => {
      const { error } = await supabase
        .from('payments')
        .insert([{
          ...values,
          client_id: clientId,
          contract_id: null, // Since this is a direct client payment
          type: 'client',
          amount: Number(values.amount),
          date: values.date
        }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-payments', clientId] });
      setIsOpen(false);
      form.reset();
      toast({
        title: "Success",
        description: "Payment added successfully",
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

  const updatePaymentMutation = useMutation({
    mutationFn: async (values: InsertPayment) => {
      if (!editingPayment) return;
      const { error } = await supabase
        .from('payments')
        .update({
          ...values,
          client_id: clientId,
          type: 'client',
        })
        .eq('id', editingPayment.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-payments', clientId] });
      setIsOpen(false);
      setEditingPayment(null);
      form.reset();
      toast({
        title: "Success",
        description: "Payment updated successfully",
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

  const deletePaymentMutation = useMutation({
    mutationFn: async (id: string) => {  // Change to string for UUID
      const { error } = await supabase
        .from('payments')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-payments', clientId] });
      toast({
        title: "Success",
        description: "Payment deleted successfully",
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

  const onSubmit = (values: InsertPayment) => {
    if (editingPayment) {
      updatePaymentMutation.mutate(values);
    } else {
      createPaymentMutation.mutate(values);
    }
  };

  const handleEdit = (payment: Payment) => {
    setEditingPayment(payment);
    form.reset({
      amount: Number(payment.amount),  // Convert decimal to number
      date: new Date(payment.date).toISOString().split('T')[0],
      description: payment.description || '',
    });
    setIsOpen(true);
  };

  if (clientLoading || paymentsLoading) {
    return <div className="p-4">Loading...</div>;
  }

  if (!client) {
    return <div className="p-4">Client not found</div>;
  }

  const totalPayments = payments?.reduce((sum, payment) => sum + Number(payment.amount), 0) || 0;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">{client.name}</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Client Information</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4">
              <div>
                <dt className="text-sm font-medium text-gray-500">Email</dt>
                <dd className="mt-1">{client.email}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Phone</dt>
                <dd className="mt-1">{client.phone}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Contract Amount</dt>
                <dd className="mt-1">₹{client.contract_amount}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Address</dt>
                <dd className="mt-1">{client.address}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Notes</dt>
                <dd className="mt-1 whitespace-pre-wrap">{client.notes}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4">
              <div>
                <dt className="text-sm font-medium text-gray-500">Total Payments</dt>
                <dd className="mt-1 text-2xl font-bold">₹{totalPayments}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Contract Amount</dt>
                <dd className="mt-1 text-2xl font-bold">₹{client.contract_amount}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Balance</dt>
                <dd className="mt-1 text-2xl font-bold text-green-600">
                  ₹{Number(client.contract_amount) - totalPayments}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row justify-between items-center">
          <CardTitle>Payment History</CardTitle>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => {
                setEditingPayment(null);
                form.reset();
              }}>
                <Plus className="h-4 w-4 mr-2" />
                Add Payment
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingPayment ? 'Edit Payment' : 'Add New Payment'}
                </DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Amount (₹)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            {...field}
                            onChange={(e) => field.onChange(parseFloat(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            placeholder="Add payment description..."
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={createPaymentMutation.isPending || updatePaymentMutation.isPending}
                  >
                    {editingPayment ? 'Update' : 'Add'} Payment
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments?.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>
                    {format(new Date(payment.date), 'MMM dd, yyyy')}
                  </TableCell>
                  <TableCell>₹{payment.amount}</TableCell>
                  <TableCell>{payment.description}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(payment)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => deletePaymentMutation.mutate(payment.id)}
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}