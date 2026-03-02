import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Plus, Pencil, Trash, Search, IndianRupee } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useBrandColor } from "@/hooks/use-brand-color";

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
  DialogFooter,
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
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { insertClientSchema, type Client, type InsertClient } from "@/lib/schema";

const ITEMS_PER_PAGE = 7;

export default function Clients() {
  const { currentOrganization, user, hasPermission } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);

  // Get brand color from centralized hook
  const { brandColor } = useBrandColor();

  // Check for status query parameter on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    if (status === 'pending') {
      setPaymentStatusFilter('pending');
    } else if (status === 'active' || status === 'inactive') {
      setStatusFilter(status);
    }
  }, []);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, paymentStatusFilter, searchQuery]);

  const { data: clientData, isLoading } = useQuery({
    queryKey: ['clients', currentOrganization?.organization_id, statusFilter],
    queryFn: async () => {
      if (!currentOrganization) throw new Error('No organization selected');

      let query = supabase
        .from('clients')
        .select('*')
        .eq('organization_id', currentOrganization.organization_id);

      // Apply status filter
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query.order('name');

      if (error) throw error;
      return data as Client[];
    },
    enabled: !!currentOrganization,
  });

  const { data: paymentsData } = useQuery({
    queryKey: ['payments', currentOrganization?.organization_id],
    queryFn: async () => {
      if (!currentOrganization) throw new Error('No organization selected');

      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('organization_id', currentOrganization.organization_id);

      if (error) throw error;
      return data;
    },
    enabled: !!currentOrganization,
  });

  const { data: lineItemsData } = useQuery({
    queryKey: ['client-line-items-all', currentOrganization?.organization_id],
    queryFn: async () => {
      if (!currentOrganization) throw new Error('No organization selected');
      const { data, error } = await supabase
        .from('client_line_items')
        .select('*, line_item_payments(amount)')
        .eq('organization_id', currentOrganization.organization_id);
      if (error) throw error;
      return data;
    },
    enabled: !!currentOrganization,
  });

  const { data: designerFeesData } = useQuery({
    queryKey: ['designer-fees-all', currentOrganization?.organization_id],
    queryFn: async () => {
      if (!currentOrganization) throw new Error('No organization selected');
      const { data, error } = await supabase
        .from('designer_fees')
        .select('client_id, billing_amount, designer_fee_payments(amount)')
        .eq('organization_id', currentOrganization.organization_id);
      if (error) throw error;
      return data;
    },
    enabled: !!currentOrganization,
  });

  const getClientFinancials = (clientId: number) => {
    const items = (lineItemsData || []).filter((item: any) => item.client_id === clientId && !item.is_legacy);
    const received = (paymentsData || [])
      .filter((p: any) => p.client_id === clientId && p.type === 'client')
      .reduce((s: number, p: any) => s + Number(p.amount), 0);
    const lineItemsOwed = items.reduce((s: number, item: any) => s + Number(item.billing_amount || 0), 0);
    const clientDesignerFees = (designerFeesData || []).filter((f: any) => f.client_id === clientId);
    const totalDesignerFee = clientDesignerFees.reduce((s: number, f: any) => s + Number(f.billing_amount || 0), 0);
    const totalDesignerFeePaid = clientDesignerFees.reduce((s: number, f: any) =>
      s + (f.designer_fee_payments || []).reduce((ps: number, p: any) => ps + Number(p.amount), 0), 0);
    const designerFeePending = totalDesignerFee - totalDesignerFeePaid;
    // Finance hub formula: received - BM billed - designer fees paid
    const clientBalance = received - lineItemsOwed - totalDesignerFeePaid;
    return { totalReceived: received, totalOwed: lineItemsOwed + totalDesignerFee, totalDesignerFee, designerFeePending, clientBalance };
  };

  const allFilteredClients = clientData?.filter(client => {
    const matchesSearch = client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (client.email && client.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (client.phone && client.phone.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    const { clientBalance } = getClientFinancials(client.id);
    if (paymentStatusFilter === 'pending' && clientBalance >= 0) return false;
    if (paymentStatusFilter === 'completed' && clientBalance < 0) return false;

    return true;
  });

  // Apply pagination after filtering
  const totalFilteredCount = allFilteredClients?.length || 0;
  const totalPages = Math.ceil(totalFilteredCount / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const filteredClients = allFilteredClients?.slice(startIndex, endIndex);

  // Calculate totals based on payment status filter
  const calculateTotals = () => {
    if (!clientData) return { totalAmount: 0, pendingAmount: 0, earnedAmount: 0 };

    let clientsToCalculate = clientData;

    if (paymentStatusFilter !== 'all') {
      clientsToCalculate = clientData.filter(client => {
        const { clientBalance } = getClientFinancials(client.id);
        if (paymentStatusFilter === 'pending') return clientBalance < 0;
        if (paymentStatusFilter === 'completed') return clientBalance >= 0;
        return true;
      });
    }

    const totalAmount = clientsToCalculate.reduce((sum, client) => {
      return sum + getClientFinancials(client.id).totalOwed;
    }, 0);
    const earnedAmount = clientsToCalculate.reduce((sum, client) => {
      return sum + getClientFinancials(client.id).totalReceived;
    }, 0);
    const pendingAmount = clientsToCalculate.reduce((sum, client) => {
      const { totalOwed, totalReceived } = getClientFinancials(client.id);
      const owed = totalOwed - totalReceived;
      return sum + (owed > 0 ? owed : 0);
    }, 0);

    return { totalAmount, pendingAmount, earnedAmount };
  };

  const { totalAmount, pendingAmount, earnedAmount } = calculateTotals();

  const form = useForm<InsertClient>({
    resolver: zodResolver(insertClientSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      address: '',
      notes: '',
      status: 'active',
    }
  });

  const createMutation = useMutation({
    mutationFn: async (values: InsertClient) => {
      if (!currentOrganization || !user) throw new Error('Not authorized');

      const { data, error } = await supabase
        .from('clients')
        .insert([{
          ...values,
          organization_id: currentOrganization.organization_id,
          created_by: user.id,
        }])
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      setIsOpen(false);
      form.reset();
      toast({
        title: "Success",
        description: "Client created successfully",
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

  const updateMutation = useMutation({
    mutationFn: async (values: InsertClient) => {
      if (!editingClient || !user) return;

      const updateData = {
        ...values,
        updated_by: user.id,
      };

      const { data, error } = await supabase
        .from('clients')
        .update(updateData)
        .eq('id', editingClient.id)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      setIsOpen(false);
      setEditingClient(null);
      form.reset();
      toast({
        title: "Success",
        description: "Client updated successfully",
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
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('clients')
        .update({ status: 'inactive' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setDeleteDialogOpen(false);
      setClientToDelete(null);
      toast({
        title: "Success",
        description: "Client marked as inactive",
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

  const onSubmit = (values: InsertClient) => {
    if (editingClient) {
      updateMutation.mutate(values);
    } else {
      createMutation.mutate(values);
    }
  };

  const handleEdit = (client: Client) => {
    setEditingClient(client);
    form.reset({ ...client });
    setIsOpen(true);
  };

  const handleViewDetails = (id: string) => {
    setLocation(`/clients/${id}`);
  };

  const handleDelete = (client: Client) => {
    setClientToDelete(client);
    setDeleteDialogOpen(true);
  };

  if (isLoading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Clients</h1>
        {hasPermission('clients', 'create') && (
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button
                style={{ backgroundColor: brandColor, borderColor: brandColor }}
                className="text-white hover:opacity-90"
                onClick={() => {
                setEditingClient(null);
                form.reset({
                  name: '',
                  email: '',
                  phone: '',
                  address: '',
                  notes: '',
                  status: 'active',
                });
              }}>
                <Plus className="h-4 w-4 mr-2" />
                Add Client
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingClient ? 'Edit Client' : 'Add New Client'}
              </DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Add any additional notes about the client..."
                          className="min-h-[100px]"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  style={{ backgroundColor: brandColor, borderColor: brandColor }}
                  className="w-full text-white hover:opacity-90"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {editingClient ? 'Update' : 'Create'} Client
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        )}
      </div>

      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          <Search className="h-4 w-4 text-gray-500" />
          <Input
            placeholder="Search clients..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-sm"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={setStatusFilter}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={paymentStatusFilter}
          onValueChange={setPaymentStatusFilter}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Payment status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Payments</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Total Amount Card */}
      <Card className="border-2" style={{ backgroundColor: brandColor, borderColor: brandColor }}>
        <CardContent className="pt-6">
          {paymentStatusFilter === 'all' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">Total Receivable</p>
                  <p className="text-3xl font-bold mt-1 text-white">
                    ₹{totalAmount.toLocaleString()}
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center">
                  <IndianRupee className="h-6 w-6 text-white" />
                </div>
              </div>
              <div className="flex items-center justify-between border-l-0 md:border-l-2 border-white/30 md:pl-6">
                <div>
                  <p className="text-sm font-medium text-white">Total Outstanding</p>
                  <p className="text-3xl font-bold mt-1 text-white">
                    ₹{pendingAmount.toLocaleString()}
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center">
                  <IndianRupee className="h-6 w-6 text-white" />
                </div>
              </div>
            </div>
          ) : paymentStatusFilter === 'pending' ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium" style={{ color: 'rgb(255 255 255 / var(--tw-text-opacity, 1))' }}>Total Outstanding</p>
                <p className="text-3xl font-bold mt-1" style={{ color: 'rgb(255 255 255 / var(--tw-text-opacity, 1))' }}>
                  ₹{pendingAmount.toLocaleString()}
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center">
                <IndianRupee className="h-6 w-6 text-white" />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white">Total Received</p>
                <p className="text-3xl font-bold mt-1 text-white">
                  ₹{earnedAmount.toLocaleString()}
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center">
                <IndianRupee className="h-6 w-6 text-white" />
              </div>
            </div>
          )}
          <p className="text-xs mt-4 text-white">
            Based on {totalFilteredCount} client{totalFilteredCount !== 1 ? 's' : ''}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Client List</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Designer Fee</TableHead>
                <TableHead>Designer Fee Pending</TableHead>
                <TableHead>Client Balance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredClients?.map((client) => (
                <TableRow
                  key={client.id}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => handleViewDetails(client.id)}
                >
                  <TableCell>{client.name}</TableCell>
                  <TableCell>{client.phone}</TableCell>
                  <TableCell>₹{getClientFinancials(client.id).totalDesignerFee.toLocaleString()}</TableCell>
                  <TableCell>
                    {(() => {
                      const { designerFeePending } = getClientFinancials(client.id);
                      return <span className={designerFeePending > 0 ? "text-red-500" : "text-gray-400"}>₹{designerFeePending.toLocaleString()}</span>;
                    })()}
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const { clientBalance } = getClientFinancials(client.id);
                      if (clientBalance < 0) return <span className="text-red-500">−₹{Math.abs(clientBalance).toLocaleString()}</span>;
                      if (clientBalance > 0) return <span className="text-green-600">₹{clientBalance.toLocaleString()}</span>;
                      return <span className="text-gray-400">₹0</span>;
                    })()}
                  </TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      client.status === 'active'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {client.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      {hasPermission('clients', 'update') && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(client);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {hasPermission('clients', 'delete') && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(client);
                          }}
                        >
                          <Trash className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {totalFilteredCount > ITEMS_PER_PAGE && (
            <div className="mt-6 flex justify-center">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        setCurrentPage(p => Math.max(1, p - 1));
                      }}
                    />
                  </PaginationItem>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <PaginationItem key={page}>
                      <PaginationLink
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          setCurrentPage(page);
                        }}
                        isActive={currentPage === page}
                      >
                        {page}
                      </PaginationLink>
                    </PaginationItem>
                  ))}
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        setCurrentPage(p => Math.min(totalPages, p + 1));
                      }}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Action</DialogTitle>
            <DialogDescription>
              Are you sure you want to mark {clientToDelete?.name} as inactive? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (clientToDelete) {
                  deleteMutation.mutate(clientToDelete.id);
                }
              }}
              disabled={deleteMutation.isPending}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}