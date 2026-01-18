import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Plus, Pencil, IndianRupee, Search, Trash, MoreVertical } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { insertContractSchema, insertPaymentSchema, type Contract, type InsertContract, type InsertPayment } from "@/lib/schema";

export default function Contracts() {
  const [isOpen, setIsOpen] = useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 7;
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // Check for status query parameter on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    if (status === 'pending') {
      setStatusFilter('pending');
    }
  }, []);

  const { data: contracts, isLoading: contractsLoading } = useQuery({
    queryKey: ['contracts', searchQuery, statusFilter, typeFilter, clientFilter, currentPage],
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
        `);

      // Apply filters
      if (searchQuery) {
        query = query.ilike('title', `%${searchQuery}%`);
      }

      if (clientFilter !== 'all') {
        query = query.eq('client_id', Number(clientFilter));
      }

      if (typeFilter === 'vendor') {
        query = query.not('vendor_id', 'is', null);
      } else if (typeFilter === 'labor') {
        query = query.not('labor_id', 'is', null);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      let filteredData = data || [];
      
      // Apply payment status filter
      if (statusFilter === 'completed') {
        filteredData = filteredData.filter(contract => {
          const pendingAmount = Number(contract.commission_amount) -
            (contract.payments?.filter(p => p.type !== 'client')
              .reduce((sum, p) => sum + Number(p.amount), 0) || 0);
          return pendingAmount === 0;
        });
      } else if (statusFilter === 'pending') {
        filteredData = filteredData.filter(contract => {
          const pendingAmount = Number(contract.commission_amount) -
            (contract.payments?.filter(p => p.type !== 'client')
              .reduce((sum, p) => sum + Number(p.amount), 0) || 0);
          return pendingAmount > 0;
        });
      }
      
      // Sort by client name in ascending order
      const sortedData = filteredData.sort((a, b) => {
        const nameA = a.clients?.name?.toLowerCase() || '';
        const nameB = b.clients?.name?.toLowerCase() || '';
        return nameA.localeCompare(nameB);
      });
      
      // Apply pagination after filtering
      const start = (currentPage - 1) * itemsPerPage;
      return sortedData.slice(start, start + itemsPerPage);
    }
  });

  const { data: clients } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name')
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

  // Auto-calculate commission values based on contract amount
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      const contractAmount = Number(value.contract_amount) || 0;
      const commissionPercentage = Number(value.commission_percentage) || 0;
      const commissionAmount = Number(value.commission_amount) || 0;

      // Only calculate if contract amount exists
      if (contractAmount > 0) {
        // User entered or changed commission percentage
        if (name === 'commission_percentage') {
          if (commissionPercentage > 0) {
            const calculatedAmount = (contractAmount * commissionPercentage) / 100;
            const roundedAmount = calculatedAmount.toFixed(2);
            // Only update if different
            if (value.commission_amount !== roundedAmount) {
              form.setValue('commission_amount', roundedAmount, { shouldValidate: false });
            }
          } else if (value.commission_percentage === '') {
            // Percentage cleared, clear amount
            if (value.commission_amount) {
              form.setValue('commission_amount', '', { shouldValidate: false });
            }
          }
          return;
        }

        // User entered or changed commission amount
        if (name === 'commission_amount') {
          if (commissionAmount > 0) {
            const calculatedPercentage = (commissionAmount / contractAmount) * 100;
            const roundedPercentage = calculatedPercentage.toFixed(2);
            // Only update if different
            if (value.commission_percentage !== roundedPercentage) {
              form.setValue('commission_percentage', roundedPercentage, { shouldValidate: false });
            }
          } else if (value.commission_amount === '') {
            // Amount cleared, clear percentage
            if (value.commission_percentage) {
              form.setValue('commission_percentage', '', { shouldValidate: false });
            }
          }
          return;
        }

        // User changed contract amount - recalculate based on existing percentage or amount
        if (name === 'contract_amount') {
          if (commissionPercentage > 0) {
            const calculatedAmount = (contractAmount * commissionPercentage) / 100;
            const roundedAmount = calculatedAmount.toFixed(2);
            if (value.commission_amount !== roundedAmount) {
              form.setValue('commission_amount', roundedAmount, { shouldValidate: false });
            }
          } else if (commissionAmount > 0) {
            const calculatedPercentage = (commissionAmount / contractAmount) * 100;
            const roundedPercentage = calculatedPercentage.toFixed(2);
            if (value.commission_percentage !== roundedPercentage) {
              form.setValue('commission_percentage', roundedPercentage, { shouldValidate: false });
            }
          }
        }
      }
    });
    
    return () => subscription.unsubscribe();
  }, [form]);

  // Watch contract_amount and commission_percentage to calculate commission_amount
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

  const deleteMutation = useMutation({
    mutationFn: async (contractId: number) => {
      const { error } = await supabase
        .from('contracts')
        .delete()
        .eq('id', contractId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      setIsDeleteDialogOpen(false);
      setSelectedContract(null);
      toast({
        title: "Success",
        description: "Contract deleted successfully",
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

  const handleDelete = (contract: Contract) => {
    setSelectedContract(contract);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (selectedContract) {
      deleteMutation.mutate(selectedContract.id);
    }
  };

  // Total count for pagination
  const { data: totalCount } = useQuery({
    queryKey: ['contracts-count', searchQuery, statusFilter, typeFilter, clientFilter],
    queryFn: async () => {
      let query = supabase
        .from('contracts')
        .select(`
          commission_amount,
          payments (
            amount,
            type
          )
        `);

      if (searchQuery) {
        query = query.ilike('title', `%${searchQuery}%`);
      }

      if (clientFilter !== 'all') {
        query = query.eq('client_id', Number(clientFilter));
      }

      if (typeFilter === 'vendor') {
        query = query.not('vendor_id', 'is', null);
      } else if (typeFilter === 'labor') {
        query = query.not('labor_id', 'is', null);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      let filteredData = data || [];
      
      // Apply payment status filter
      if (statusFilter === 'completed') {
        filteredData = filteredData.filter(contract => {
          const pendingAmount = Number(contract.commission_amount) -
            (contract.payments?.filter(p => p.type !== 'client')
              .reduce((sum, p) => sum + Number(p.amount), 0) || 0);
          return pendingAmount === 0;
        });
      } else if (statusFilter === 'pending') {
        filteredData = filteredData.filter(contract => {
          const pendingAmount = Number(contract.commission_amount) -
            (contract.payments?.filter(p => p.type !== 'client')
              .reduce((sum, p) => sum + Number(p.amount), 0) || 0);
          return pendingAmount > 0;
        });
      }
      
      return filteredData.length;
    }
  });

  const totalPages = Math.ceil((totalCount || 0) / itemsPerPage);

  // Total commission amount with filters
  const { data: totalCommission } = useQuery({
    queryKey: ['contracts-total-commission', searchQuery, statusFilter, typeFilter, clientFilter],
    queryFn: async () => {
      let query = supabase
        .from('contracts')
        .select(`
          commission_amount,
          payments (
            amount,
            type
          )
        `);

      if (searchQuery) {
        query = query.ilike('title', `%${searchQuery}%`);
      }

      if (clientFilter !== 'all') {
        query = query.eq('client_id', Number(clientFilter));
      }

      if (typeFilter === 'vendor') {
        query = query.not('vendor_id', 'is', null);
      } else if (typeFilter === 'labor') {
        query = query.not('labor_id', 'is', null);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      let filteredData = data || [];
      
      // Apply payment status filter
      if (statusFilter === 'completed') {
        filteredData = filteredData.filter(contract => {
          const pendingAmount = Number(contract.commission_amount) -
            (contract.payments?.filter(p => p.type !== 'client')
              .reduce((sum, p) => sum + Number(p.amount), 0) || 0);
          return pendingAmount === 0;
        });
      } else if (statusFilter === 'pending') {
        filteredData = filteredData.filter(contract => {
          const pendingAmount = Number(contract.commission_amount) -
            (contract.payments?.filter(p => p.type !== 'client')
              .reduce((sum, p) => sum + Number(p.amount), 0) || 0);
          return pendingAmount > 0;
        });
      }
      
      return filteredData.reduce((sum, contract) => sum + Number(contract.commission_amount), 0) || 0;
    }
  });

  // Total pending commission amount with filters
  const { data: totalPendingCommission } = useQuery({
    queryKey: ['contracts-total-pending', searchQuery, statusFilter, typeFilter, clientFilter],
    queryFn: async () => {
      let query = supabase
        .from('contracts')
        .select(`
          commission_amount,
          payments (
            amount,
            type
          )
        `);

      if (searchQuery) {
        query = query.ilike('title', `%${searchQuery}%`);
      }

      if (clientFilter !== 'all') {
        query = query.eq('client_id', Number(clientFilter));
      }

      if (typeFilter === 'vendor') {
        query = query.not('vendor_id', 'is', null);
      } else if (typeFilter === 'labor') {
        query = query.not('labor_id', 'is', null);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      let filteredData = data || [];
      
      // Apply payment status filter
      if (statusFilter === 'completed') {
        filteredData = filteredData.filter(contract => {
          const pendingAmount = Number(contract.commission_amount) -
            (contract.payments?.filter(p => p.type !== 'client')
              .reduce((sum, p) => sum + Number(p.amount), 0) || 0);
          return pendingAmount === 0;
        });
      } else if (statusFilter === 'pending') {
        filteredData = filteredData.filter(contract => {
          const pendingAmount = Number(contract.commission_amount) -
            (contract.payments?.filter(p => p.type !== 'client')
              .reduce((sum, p) => sum + Number(p.amount), 0) || 0);
          return pendingAmount > 0;
        });
      }
      
      return filteredData.reduce((sum, contract) => {
        const totalPaid = contract.payments?.filter(p => p.type !== 'client')
          .reduce((paidSum, p) => paidSum + Number(p.amount), 0) || 0;
        const pending = Number(contract.commission_amount) - totalPaid;
        return sum + pending;
      }, 0) || 0;
    }
  });

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
                <div className="grid">
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
                        <FormLabel>Commission (%)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) => {
                              field.onChange(e.target.value);
                            }}
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
                          onChange={(e) => {
                              field.onChange(e.target.value);
                            }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />


                <div className="grid grid-cols-2 gap-4">                  <FormField
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
          <Label>Client</Label>
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by client" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Clients</SelectItem>
              {clients?.map((client) => (
                <SelectItem key={client.id} value={client.id.toString()}>
                  {client.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-full md:w-1/4">
          <Label>Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
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

      {/* Total Commission Card */}
      <Card className="border-stone-400" style={{ backgroundColor: 'rgb(174 168 162 / var(--tw-bg-opacity, 1))' }}>
        <CardContent className="pt-6">
          {statusFilter === 'all' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium" style={{ color: 'rgb(255 255 255 / var(--tw-text-opacity, 1))' }}>Total Commission Amount</p>
                  <p className="text-3xl font-bold mt-1" style={{ color: 'rgb(255 255 255 / var(--tw-text-opacity, 1))' }}>
                    ₹{(totalCommission || 0).toLocaleString()}
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center">
                  <IndianRupee className="h-6 w-6 text-white" />
                </div>
              </div>
              <div className="flex items-center justify-between border-l-0 md:border-l-2 border-white/30 md:pl-6">
                <div>
                  <p className="text-sm font-medium" style={{ color: 'rgb(255 255 255 / var(--tw-text-opacity, 1))' }}>Total Pending Commission</p>
                  <p className="text-3xl font-bold mt-1" style={{ color: 'rgb(255 255 255 / var(--tw-text-opacity, 1))' }}>
                    ₹{(totalPendingCommission || 0).toLocaleString()}
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center">
                  <IndianRupee className="h-6 w-6 text-white" />
                </div>
              </div>
            </div>
          ) : statusFilter === 'pending' ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium" style={{ color: 'rgb(255 255 255 / var(--tw-text-opacity, 1))' }}>Total Pending Commission</p>
                <p className="text-3xl font-bold mt-1" style={{ color: 'rgb(255 255 255 / var(--tw-text-opacity, 1))' }}>
                  ₹{(totalPendingCommission || 0).toLocaleString()}
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center">
                <IndianRupee className="h-6 w-6 text-white" />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium" style={{ color: 'rgb(255 255 255 / var(--tw-text-opacity, 1))' }}>Total Amount Earned</p>
                <p className="text-3xl font-bold mt-1" style={{ color: 'rgb(255 255 255 / var(--tw-text-opacity, 1))' }}>
                  ₹{((totalCommission || 0) - (totalPendingCommission || 0)).toLocaleString()}
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center">
                <IndianRupee className="h-6 w-6 text-white" />
              </div>
            </div>
          )}
          <p className="text-xs mt-4" style={{ color: 'rgb(255 255 255 / var(--tw-text-opacity, 1))' }}>
            Based on {totalCount || 0} contract{(totalCount || 0) !== 1 ? 's' : ''}
          </p>
        </CardContent>
      </Card>

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
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="usePendingAmount"
                  onCheckedChange={(checked) => {
                    if (checked && selectedContract) {
                      const totalPaid = selectedContract.payments?.filter(p => p.type !== 'client')
                        .reduce((sum, p) => sum + Number(p.amount), 0) || 0;
                      const pendingAmount = Number(selectedContract.commission_amount) - totalPaid;
                      paymentForm.setValue('amount', pendingAmount.toString());
                    }
                  }}
                />
                <label
                  htmlFor="usePendingAmount"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Use pending amount (₹
                  {selectedContract ? (
                    Number(selectedContract.commission_amount) -
                    (selectedContract.payments?.filter(p => p.type !== 'client')
                      .reduce((sum, p) => sum + Number(p.amount), 0) || 0)
                  ).toLocaleString() : 0})
                </label>
              </div>
              
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
                <TableHead>Client</TableHead>
                <TableHead>Vendor/Labor</TableHead>
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
                  <TableCell>{contract.clients?.name}</TableCell>
                  <TableCell>
                    {contract.vendors?.name || contract.labors?.name}
                  </TableCell>
                  <TableCell>
                    ₹{Number(contract.commission_amount).toLocaleString()}
                  </TableCell>
                  <TableCell className={`font-medium ${
                    (Number(contract.commission_amount) -
                      (contract.payments?.filter(p => p.type !== 'client')
                        .reduce((sum, p) => sum + Number(p.amount), 0) || 0)
                    ) > 0 ? 'text-red-600' : 'text-black'
                  }`}>
                    ₹{(Number(contract.commission_amount) -
                      (contract.payments?.filter(p => p.type !== 'client')
                        .reduce((sum, p) => sum + Number(p.amount), 0) || 0)
                      ).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const pendingAmount = Number(contract.commission_amount) -
                        (contract.payments?.filter(p => p.type !== 'client')
                          .reduce((sum, p) => sum + Number(p.amount), 0) || 0);
                      const isCompleted = pendingAmount === 0;
                      
                      return (
                        <span className="text-black">
                          {isCompleted ? 'Completed' : 'Pending'}
                        </span>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePayment(contract);
                          }}
                        >
                          <IndianRupee className="h-4 w-4 mr-2" />
                          Update Payment
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(contract);
                          }}
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(contract);
                          }}
                          className="text-red-600"
                        >
                          <Trash className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contract</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the contract with commission amount - "{selectedContract?.commission_amount}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              className="bg-red-500 hover:bg-red-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}