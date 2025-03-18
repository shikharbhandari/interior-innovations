import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Plus, Pencil, IndianRupee, Search } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useLocation } from "wouter";
import { Label } from "@/components/ui/label";

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
  DialogDescription,
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { insertContractSchema, insertPaymentSchema, type Contract, type InsertContract, type InsertPayment } from "@/lib/schema";

export default function Contracts() {
  const [isOpen, setIsOpen] = useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 7;
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: contracts, isLoading: contractsLoading } = useQuery({
    queryKey: ['contracts', searchQuery, statusFilter, typeFilter, currentPage],
    queryFn: async () => {
      let query = supabase
        .from('contracts')
        .select(`
          *,
          clients (
            id,
            name
          ),
          vendors (
            id,
            name
          ),
          labors (
            id,
            name
          ),
          payments (
            id,
            amount,
            date,
            type
          )
        `)
        .order('created_at', { ascending: false });

      // Apply filters
      if (searchQuery) {
        query = query.ilike('title', `%${searchQuery}%`);
      }

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      if (typeFilter === 'vendor') {
        query = query.not('vendor_id', 'is', null);
      } else if (typeFilter === 'labor') {
        query = query.not('labor_id', 'is', null);
      }

      // Apply pagination
      const start = (currentPage - 1) * itemsPerPage;
      query = query.range(start, start + itemsPerPage - 1);

      const { data, error } = await query;
      if (error) throw error;
      return data;
    }
  });

  const { data: clients } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name')
        .eq('status', 'active')
        .order('name');
      if (error) throw error;
      return data;
    }
  });

  const { data: vendors } = useQuery({
    queryKey: ['vendors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendors')
        .select('id, name')
        .eq('status', 'active')
        .order('name');
      if (error) throw error;
      return data;
    }
  });

  const { data: labors } = useQuery({
    queryKey: ['labors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('labors')
        .select('id, name')
        .eq('status', 'active')
        .order('name');
      if (error) throw error;
      return data;
    }
  });

  const form = useForm<InsertContract>({
    resolver: zodResolver(insertContractSchema),
    defaultValues: {
      client_id: undefined,
      vendor_id: null,
      labor_id: null,
      title: '',
      description: '',
      contract_amount: '',
      commission_percentage: '',
      commission_amount: '',
      status: 'active',
      start_date: new Date(),
    }
  });

  const paymentForm = useForm<InsertPayment>({
    resolver: zodResolver(insertPaymentSchema),
    defaultValues: {
      amount: '',
      date: new Date(),
      type: selectedContract?.vendor_id ? 'vendor' : 'labor',
      description: '',
      contract_id: selectedContract?.id
    }
  });

  // Watch contract_amount and commission_percentage to calculate commission_amount
  const contractAmount = form.watch('contract_amount');
  const commissionPercentage = form.watch('commission_percentage');


  const createMutation = useMutation({
    mutationFn: async (values: InsertContract) => {
      console.log('Creating contract with values:', values);
      const { error } = await supabase
        .from('contracts')
        .insert([{
          ...values,
          contract_amount: Number(values.contract_amount),
          commission_percentage: Number(values.commission_percentage),
          commission_amount: Number(values.commission_amount),
          start_date: values.start_date.toISOString(),
          end_date: values.end_date?.toISOString()
        }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      setIsOpen(false);
      form.reset();
      toast({
        title: "Success",
        description: "Contract created successfully",
      });
    },
    onError: (error: Error) => {
      console.error('Contract creation error:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (values: InsertContract) => {
      if (!selectedContract) return;
      const { error } = await supabase
        .from('contracts')
        .update({
          ...values,
          contract_amount: Number(values.contract_amount),
          commission_percentage: Number(values.commission_percentage),
          commission_amount: Number(values.commission_amount),
          start_date: values.start_date.toISOString(),
          end_date: values.end_date?.toISOString()
        })
        .eq('id', selectedContract.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      setIsOpen(false);
      setSelectedContract(null);
      form.reset();
      toast({
        title: "Success",
        description: "Contract updated successfully",
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

  const createPaymentMutation = useMutation({
    mutationFn: async (values: InsertPayment) => {
      const { error } = await supabase
        .from('payments')
        .insert([{
          ...values,
          amount: Number(values.amount),
          date: values.date.toISOString()
        }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      setIsPaymentDialogOpen(false);
      setSelectedContract(null);
      paymentForm.reset();
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

  const onSubmit = (values: InsertContract) => {
    console.log('Form values:', values);
    if (selectedContract) {
      updateMutation.mutate(values);
    } else {
      createMutation.mutate(values);
    }
  };

  const onPaymentSubmit = (values: InsertPayment) => {
    if (selectedContract) {
      createPaymentMutation.mutate({
        ...values,
        contract_id: selectedContract.id,
        type: selectedContract.vendor_id ? 'vendor' : 'labor'
      });
    }
  };

  const handleEdit = (contract: Contract) => {
    setSelectedContract(contract);
    form.reset({
      ...contract,
      contract_amount: contract.contract_amount.toString(),
      commission_percentage: contract.commission_percentage.toString(),
      commission_amount: contract.commission_amount.toString(),
      start_date: new Date(contract.start_date),
      end_date: contract.end_date ? new Date(contract.end_date) : undefined
    });
    setIsOpen(true);
  };

  const handlePayment = (contract: Contract) => {
    setSelectedContract(contract);
    paymentForm.reset({
      amount: '',
      date: new Date(),
      type: contract.vendor_id ? 'vendor' : 'labor',
      description: '',
      contract_id: contract.id
    });
    setIsPaymentDialogOpen(true);
  };

  // Total count for pagination
  const { data: totalCount } = useQuery({
    queryKey: ['contracts-count', searchQuery, statusFilter, typeFilter],
    queryFn: async () => {
      let query = supabase
        .from('contracts')
        .select('*', { count: 'exact' });

      if (searchQuery) {
        query = query.ilike('title', `%${searchQuery}%`);
      }

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      if (typeFilter === 'vendor') {
        query = query.not('vendor_id', 'is', null);
      } else if (typeFilter === 'labor') {
        query = query.not('labor_id', 'is', null);
      }

      const { count, error } = await query;
      if (error) throw error;
      return count;
    }
  });

  const totalPages = Math.ceil((totalCount || 0) / itemsPerPage);

  const handlePreviousPage = () => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(totalPages, prev + 1));
  };

  if (contractsLoading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Contracts</h1>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => {
              setSelectedContract(null);
              form.reset({
                client_id: undefined,
                vendor_id: null,
                labor_id: null,
                title: '',
                description: '',
                contract_amount: '',
                commission_percentage: '',
                commission_amount: '',
                status: 'active',
                start_date: new Date(),
              });
            }}>
              <Plus className="h-4 w-4 mr-2" />
              Add Contract
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {selectedContract ? 'Edit Contract' : 'Add New Contract'}
              </DialogTitle>
              <DialogDescription>
                {selectedContract ? 'Update the contract details below.' : 'Fill in the contract details below.'}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="client_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Client</FormLabel>
                        <Select
                          onValueChange={(value) => field.onChange(Number(value))}
                          value={field.value?.toString()}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a client" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {clients?.map((client) => (
                              <SelectItem
                                key={client.id}
                                value={client.id.toString()}
                              >
                                {client.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="vendor_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vendor</FormLabel>
                        <Select
                          onValueChange={(value) => {
                            field.onChange(value === "null" ? null : Number(value));
                            // Clear labor_id if vendor is selected
                            if (value !== "null") {
                              form.setValue('labor_id', null);
                            }
                          }}
                          value={field.value?.toString() || "null"}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a vendor" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="null">None</SelectItem>
                            {vendors?.map((vendor) => (
                              <SelectItem
                                key={vendor.id}
                                value={vendor.id.toString()}
                              >
                                {vendor.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="labor_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Labor</FormLabel>
                        <Select
                          onValueChange={(value) => {
                            field.onChange(value === "null" ? null : Number(value));
                            // Clear vendor_id if labor is selected
                            if (value !== "null") {
                              form.setValue('vendor_id', null);
                            }
                          }}
                          value={field.value?.toString() || "null"}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a labor" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="null">None</SelectItem>
                            {labors?.map((labor) => (
                              <SelectItem
                                key={labor.id}
                                value={labor.id.toString()}
                              >
                                {labor.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="contract_amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contract Amount (₹)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="commission_percentage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Commission Percentage (%)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="commission_amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Commission Amount (₹)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          {...field}
                          onChange={(e) => field.onChange(e.target.value)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
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


                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="start_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Date</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            {...field}
                            value={field.value instanceof Date ? field.value.toISOString().split('T')[0] : ''}
                            onChange={(e) => {
                              field.onChange(new Date(e.target.value));
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="end_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End Date (Optional)</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            {...field}
                            value={field.value instanceof Date ? field.value.toISOString().split('T')[0] : ''}
                            onChange={(e) => {
                              field.onChange(e.target.value ? new Date(e.target.value) : undefined);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {selectedContract ? 'Update' : 'Create'} Contract
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-end">
        <div className="w-full md:w-1/3">
          <Label>Search</Label>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search contracts..."
              className="pl-8"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="w-full md:w-1/4">
          <Label>Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="w-full md:w-1/4">
          <Label>Type</Label>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="vendor">Vendor</SelectItem>
              <SelectItem value="labor">Labor</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Payment Dialog */}
      <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Payment</DialogTitle>
            <DialogDescription>
              Add a new payment for this contract.
            </DialogDescription>
          </DialogHeader>
          <Form {...paymentForm}>
            <form onSubmit={paymentForm.handleSubmit(onPaymentSubmit)} className="space-y-4">
              <FormField
                control={paymentForm.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount (₹)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        onChange={(e) => field.onChange(e.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={paymentForm.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Date</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        value={field.value instanceof Date ? field.value.toISOString().split('T')[0] : ''}
                        onChange={(e) => {
                          field.onChange(new Date(e.target.value));
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={paymentForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full"
                disabled={createPaymentMutation.isPending}
              >
                Add Payment
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>Contract List</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Vendor/Labor</TableHead>
                <TableHead>Amount (₹)</TableHead>
                <TableHead>Commission</TableHead>
                <TableHead>Pending (₹)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts?.map((contract) => (
                <TableRow
                  key={contract.id}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => setLocation(`/contracts/${contract.id}`)}
                >
                  <TableCell>{contract.title}</TableCell>
                  <TableCell>{contract.clients?.name}</TableCell>
                  <TableCell>
                    {contract.vendors?.name || contract.labors?.name}
                  </TableCell>
                  <TableCell>₹{Number(contract.contract_amount).toLocaleString()}</TableCell>
                  <TableCell>
                    {contract.commission_percentage}% (₹{Number(contract.commission_amount).toLocaleString()})
                  </TableCell>
                  <TableCell className="text-orange-600 font-medium">
                    ₹{(Number(contract.commission_amount) -
                      (contract.payments?.filter(p => p.type !== 'client')
                        .reduce((sum, p) => sum + Number(p.amount), 0) || 0)
                      ).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      contract.status === 'active'
                        ? 'bg-emerald-50/50 text-emerald-600'
                        : 'bg-slate-50/50 text-slate-500'
                    }`}>
                      {contract.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(contract);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePayment(contract);
                        }}
                      >
                        <IndianRupee className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <div className="flex items-center justify-between space-x-2 py-4">
        <div className="text-sm text-muted-foreground">
          Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, totalCount || 0)} of{" "}
          {totalCount || 0} results
        </div>
        <div className="flex space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePreviousPage}
            disabled={currentPage === 1}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNextPage}
            disabled={currentPage === totalPages}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}