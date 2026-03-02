import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import {
  Plus, Pencil, Trash, ChevronDown, ChevronRight, ArrowLeft, Download, Info, Search
} from "lucide-react";
import * as z from "zod";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useBrandColor } from "@/hooks/use-brand-color";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  insertClientLineItemSchema, insertLineItemPaymentSchema,
  insertDesignerFeeSchema, insertDesignerFeePaymentSchema,
  type Client, type ClientLineItem, type LineItemPayment, type Payment,
  type InsertClientLineItem, type InsertLineItemPayment,
  type DesignerFee, type DesignerFeePayment,
  type InsertDesignerFee, type InsertDesignerFeePayment,
} from "@/lib/schema";

// ── Types ─────────────────────────────────────────────────────────────────────

type LineItemWithPayments = ClientLineItem & {
  vendors?: { id: number; name: string } | null;
  labors?: { id: number; name: string } | null;
  line_item_payments?: LineItemPayment[];
};

type DesignerFeeWithPayments = DesignerFee & {
  designer_fee_payments?: DesignerFeePayment[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const today = new Date().toISOString().split("T")[0];

function itemPaid(item: LineItemWithPayments): number {
  return (item.line_item_payments || [])
    .filter(p => !p.is_proxy)
    .reduce((s, p) => s + Number(p.amount), 0);
}

function itemCommission(item: LineItemWithPayments): number {
  if (item.is_legacy) return Number(item.commission_amount || 0);
  if (item.type === "fee") return 0;
  return Number(item.billing_amount || 0) - Number(item.actual_amount || 0);
}

function itemBalance(item: LineItemWithPayments): number {
  const paid = itemPaid(item);
  if (item.is_legacy) return Number(item.commission_amount || 0) - paid;
  if (item.type === "fee") return Number(item.billing_amount || 0) - paid;
  return Number(item.actual_amount || 0) - paid;
}

// ── Client payment schema (stored in existing `payments` table) ───────────────

const clientPaymentSchema = z.object({
  amount: z.coerce.number().min(0.01, "Amount is required"),
  date: z.string().min(1, "Date is required"),
  description: z.string().optional(),
});
type ClientPaymentForm = z.infer<typeof clientPaymentSchema>;

// ── Component ─────────────────────────────────────────────────────────────────

export default function ClientFinancials() {
  const params = useParams();
  const clientId = params.id;
  const [, setLocation] = useLocation();
  const { currentOrganization, user } = useAuth();
  const { brandColor } = useBrandColor();
  const { toast } = useToast();

  // UI State
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null);
  const [isAddLineItemOpen, setIsAddLineItemOpen] = useState(false);
  const [editingLineItem, setEditingLineItem] = useState<LineItemWithPayments | null>(null);
  const [isRecordPaymentOpen, setIsRecordPaymentOpen] = useState(false);
  const [selectedLineItem, setSelectedLineItem] = useState<LineItemWithPayments | null>(null);
  const [editingLineItemPayment, setEditingLineItemPayment] = useState<LineItemPayment | null>(null);
  const [isClientPaymentOpen, setIsClientPaymentOpen] = useState(false);
  const [lineItemSearch, setLineItemSearch] = useState("");

  // Project stage dialog state
  const [editingClientPayment, setEditingClientPayment] = useState<Payment | null>(null);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [exportOptions, setExportOptions] = useState({
    vendors: true, labour: true, fees: true, designerFees: true, clientPayments: true, paymentDetails: true, showPaidBalance: true,
  });

  // Designer fee state
  const [expandedDesignerFeeId, setExpandedDesignerFeeId] = useState<number | null>(null);
  const [isAddDesignerFeeOpen, setIsAddDesignerFeeOpen] = useState(false);
  const [editingDesignerFee, setEditingDesignerFee] = useState<DesignerFeeWithPayments | null>(null);
  const [isRecordDesignerFeePaymentOpen, setIsRecordDesignerFeePaymentOpen] = useState(false);
  const [selectedDesignerFee, setSelectedDesignerFee] = useState<DesignerFeeWithPayments | null>(null);
  const [editingDesignerFeePayment, setEditingDesignerFeePayment] = useState<DesignerFeePayment | null>(null);

  // Combobox state for vendor/labour name fields
  const [vendorSearchText, setVendorSearchText] = useState("");
  const [showVendorSuggestions, setShowVendorSuggestions] = useState(false);
  const [laborSearchText, setLaborSearchText] = useState("");
  const [showLaborSuggestions, setShowLaborSuggestions] = useState(false);

  const resetComboboxes = () => {
    setVendorSearchText("");
    setLaborSearchText("");
    setShowVendorSuggestions(false);
    setShowLaborSuggestions(false);
  };

  // ── Forms ──────────────────────────────────────────────────────────────────

  const lineItemForm = useForm<InsertClientLineItem>({
    resolver: zodResolver(insertClientLineItemSchema),
    defaultValues: {
      client_id: Number(clientId),
      type: "vendor",
      name: null,
      vendor_id: null,
      labor_id: null,
      description: "",
      billing_amount: null,
      actual_amount: null,
    },
  });
  const watchedType = useWatch({ control: lineItemForm.control, name: "type" });

  const lineItemPaymentForm = useForm<InsertLineItemPayment>({
    resolver: zodResolver(insertLineItemPaymentSchema),
    defaultValues: { line_item_id: 0, amount: 0, date: today, description: "", is_proxy: false },
  });

  const clientPaymentForm = useForm<ClientPaymentForm>({
    resolver: zodResolver(clientPaymentSchema),
    defaultValues: { amount: 0, date: today, description: "" },
  });

  const designerFeeForm = useForm<InsertDesignerFee>({
    resolver: zodResolver(insertDesignerFeeSchema),
    defaultValues: { client_id: Number(clientId), description: 'Designer Fee', billing_amount: 0 },
  });

  const designerFeePaymentForm = useForm<InsertDesignerFeePayment>({
    resolver: zodResolver(insertDesignerFeePaymentSchema),
    defaultValues: { designer_fee_id: 0, amount: 0, date: today, description: "" },
  });

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: client, isLoading: clientLoading } = useQuery({
    queryKey: ["client", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients").select("*").eq("id", clientId).single();
      if (error) throw error;
      return data as Client;
    },
  });

  const { data: lineItems = [], isLoading: lineItemsLoading } = useQuery({
    queryKey: ["client-line-items", clientId, currentOrganization?.organization_id],
    queryFn: async () => {
      if (!currentOrganization) throw new Error("No organization");
      const { data, error } = await supabase
        .from("client_line_items")
        .select(`*, vendors (id, name), labors (id, name), line_item_payments (*)`)
        .eq("client_id", clientId)
        .eq("organization_id", currentOrganization.organization_id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as LineItemWithPayments[];
    },
    enabled: !!currentOrganization,
  });

  const { data: clientPayments = [], isLoading: clientPaymentsLoading } = useQuery({
    queryKey: ["client-payments", clientId, currentOrganization?.organization_id],
    queryFn: async () => {
      if (!currentOrganization) throw new Error("No organization");
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("client_id", clientId)
        .eq("organization_id", currentOrganization.organization_id)
        .eq("type", "client")
        .order("date", { ascending: false });
      if (error) throw error;
      return (data || []) as Payment[];
    },
    enabled: !!currentOrganization,
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ["vendors-list", currentOrganization?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendors").select("id, name")
        .eq("organization_id", currentOrganization!.organization_id)
        .eq("status", "active").order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization,
  });

  const { data: labors = [] } = useQuery({
    queryKey: ["labors-list", currentOrganization?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("labors").select("id, name")
        .eq("organization_id", currentOrganization!.organization_id)
        .eq("status", "active").order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization,
  });

  const { data: designerFees = [], isLoading: designerFeesLoading } = useQuery({
    queryKey: ["designer-fees", clientId, currentOrganization?.organization_id],
    queryFn: async () => {
      if (!currentOrganization) throw new Error("No organization");
      const { data, error } = await supabase
        .from("designer_fees")
        .select(`*, designer_fee_payments (*)`)
        .eq("client_id", clientId)
        .eq("organization_id", currentOrganization.organization_id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as DesignerFeeWithPayments[];
    },
    enabled: !!currentOrganization,
  });

  // ── Computed totals ────────────────────────────────────────────────────────

  const totalReceived = clientPayments.reduce((s, p) => s + Number(p.amount), 0);
  const totalOwed = lineItems
    .filter(item => !item.is_legacy)
    .reduce((s, item) => {
      return s + Number(item.billing_amount || 0);
    }, 0);
  const totalCommission = lineItems.reduce((s, item) => s + itemCommission(item), 0);
  const totalDesignerFee = designerFees.reduce((s, f) => s + Number(f.billing_amount || 0), 0);
  const totalDesignerFeePaid = designerFees.reduce((s, f) =>
    s + (f.designer_fee_payments || []).reduce((ps, p) => ps + Number(p.amount), 0), 0);
  const clientBalance = totalReceived - totalOwed - totalDesignerFeePaid;
  const totalOtherFeesBilling = lineItems
    .filter(item => !item.is_legacy && item.type === "fee")
    .reduce((s, item) => s + Number(item.billing_amount || 0), 0);
  const totalRevenue = totalCommission + totalDesignerFee + totalOtherFeesBilling;

  // Invalidate queries helper
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["client-line-items", clientId, currentOrganization?.organization_id] });
    queryClient.invalidateQueries({ queryKey: ["client-payments", clientId, currentOrganization?.organization_id] });
  };

  const invalidateDesignerFees = () => {
    queryClient.invalidateQueries({ queryKey: ["designer-fees", clientId, currentOrganization?.organization_id] });
  };

  // ── Line Item Mutations ────────────────────────────────────────────────────

  const createLineItemMutation = useMutation({
    mutationFn: async (values: InsertClientLineItem) => {
      if (!currentOrganization || !user) throw new Error("Not authorized");
      const payload: Record<string, unknown> = {
        client_id: Number(clientId),
        organization_id: currentOrganization.organization_id,
        type: values.type,
        name: values.name || null,
        description: values.description || null,
        billing_amount: values.billing_amount ?? null,
        actual_amount: values.type === "fee" ? null : (values.actual_amount ?? null),
        vendor_id: values.type === "vendor" ? (values.vendor_id ?? null) : null,
        labor_id: values.type === "labor" ? (values.labor_id ?? null) : null,
        is_legacy: false,
        created_by: user.id,
      };
      const { error } = await supabase.from("client_line_items").insert([payload]);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      setIsAddLineItemOpen(false);
      lineItemForm.reset({ client_id: Number(clientId), type: "vendor", name: null });
      resetComboboxes();
      toast({ title: "Success", description: "Line item added" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const updateLineItemMutation = useMutation({
    mutationFn: async (values: InsertClientLineItem) => {
      if (!editingLineItem || !user) throw new Error("Not authorized");
      const payload: Record<string, unknown> = {
        type: values.type,
        name: values.name || null,
        description: values.description || null,
        billing_amount: values.billing_amount ?? null,
        actual_amount: values.type === "fee" ? null : (values.actual_amount ?? null),
        vendor_id: values.type === "vendor" ? (values.vendor_id ?? null) : null,
        labor_id: values.type === "labor" ? (values.labor_id ?? null) : null,
        updated_by: user.id,
      };
      const { error } = await supabase
        .from("client_line_items").update(payload).eq("id", editingLineItem.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      setEditingLineItem(null);
      resetComboboxes();
      toast({ title: "Success", description: "Line item updated" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const deleteLineItemMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("client_line_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      setExpandedRowId(null);
      toast({ title: "Success", description: "Line item deleted" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  // ── Line Item Payment Mutations ────────────────────────────────────────────

  const createLineItemPaymentMutation = useMutation({
    mutationFn: async (values: InsertLineItemPayment) => {
      if (!currentOrganization || !user) throw new Error("Not authorized");
      const { error } = await supabase.from("line_item_payments").insert([{
        ...values,
        organization_id: currentOrganization.organization_id,
        created_by: user.id,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      setIsRecordPaymentOpen(false);
      lineItemPaymentForm.reset({ line_item_id: 0, amount: 0, date: today, description: "", is_proxy: false });
      toast({ title: "Success", description: "Payment recorded" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const updateLineItemPaymentMutation = useMutation({
    mutationFn: async (values: InsertLineItemPayment) => {
      if (!editingLineItemPayment || !user) throw new Error("Not authorized");
      const { error } = await supabase
        .from("line_item_payments")
        .update({ ...values, updated_by: user.id })
        .eq("id", editingLineItemPayment.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      setIsRecordPaymentOpen(false);
      setEditingLineItemPayment(null);
      toast({ title: "Success", description: "Payment updated" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const deleteLineItemPaymentMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("line_item_payments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Success", description: "Payment deleted" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  // ── Client Payment Mutations ───────────────────────────────────────────────

  const createClientPaymentMutation = useMutation({
    mutationFn: async (values: ClientPaymentForm) => {
      if (!currentOrganization || !user) throw new Error("Not authorized");
      const { error } = await supabase.from("payments").insert([{
        ...values,
        client_id: Number(clientId),
        contract_id: null,
        type: "client",
        organization_id: currentOrganization.organization_id,
        created_by: user.id,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      setIsClientPaymentOpen(false);
      clientPaymentForm.reset({ amount: 0, date: today, description: "" });
      toast({ title: "Success", description: "Payment recorded" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const updateClientPaymentMutation = useMutation({
    mutationFn: async (values: ClientPaymentForm) => {
      if (!editingClientPayment || !user) throw new Error("Not authorized");
      const { error } = await supabase
        .from("payments")
        .update({ ...values, type: "client", updated_by: user.id })
        .eq("id", editingClientPayment.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      setIsClientPaymentOpen(false);
      setEditingClientPayment(null);
      toast({ title: "Success", description: "Payment updated" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const deleteClientPaymentMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("payments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Success", description: "Payment deleted" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  const openRecordPayment = (item: LineItemWithPayments, existing?: LineItemPayment) => {
    setSelectedLineItem(item);
    if (existing) {
      setEditingLineItemPayment(existing);
      lineItemPaymentForm.reset({
        line_item_id: item.id,
        amount: Number(existing.amount),
        date: existing.date,
        description: existing.description || "",
        is_proxy: existing.is_proxy,
      });
    } else {
      setEditingLineItemPayment(null);
      const balance = itemBalance(item);
      lineItemPaymentForm.reset({
        line_item_id: item.id,
        amount: balance > 0 ? balance : 0,
        date: today,
        description: "",
        is_proxy: false,
      });
    }
    setIsRecordPaymentOpen(true);
  };

  const openEditLineItem = (item: LineItemWithPayments) => {
    setEditingLineItem(item);
    // Pre-fill combobox search text with existing name
    const existingName = item.type === "vendor"
      ? (item.vendors?.name || item.name || "")
      : item.type === "labor"
      ? (item.labors?.name || item.name || "")
      : "";
    if (item.type === "vendor") setVendorSearchText(existingName);
    if (item.type === "labor") setLaborSearchText(existingName);
    lineItemForm.reset({
      client_id: Number(clientId),
      type: (item.type as "vendor" | "labor" | "fee") || "vendor",
      name: item.name || null,
      vendor_id: item.vendor_id ?? null,
      labor_id: item.labor_id ?? null,
      description: item.description || "",
      billing_amount: item.billing_amount ? Number(item.billing_amount) : null,
      actual_amount: item.actual_amount ? Number(item.actual_amount) : null,
    });
  };

  const handleLineItemSubmit = (values: InsertClientLineItem) => {
    if (editingLineItem) {
      updateLineItemMutation.mutate(values);
    } else {
      createLineItemMutation.mutate(values);
    }
  };

  const handleLineItemPaymentSubmit = (values: InsertLineItemPayment) => {
    if (editingLineItemPayment) {
      updateLineItemPaymentMutation.mutate(values);
    } else {
      createLineItemPaymentMutation.mutate(values);
    }
  };

  // When proxy checkbox toggled, auto-fill amount
  const handleProxyToggle = (checked: boolean) => {
    lineItemPaymentForm.setValue("is_proxy", checked);
    if (checked && selectedLineItem) {
      const commission = Number(selectedLineItem.billing_amount || 0) - Number(selectedLineItem.actual_amount || 0);
      if (commission > 0) lineItemPaymentForm.setValue("amount", commission);
    }
  };

  // ── Designer Fee Mutations ─────────────────────────────────────────────────

  const createDesignerFeeMutation = useMutation({
    mutationFn: async (values: InsertDesignerFee) => {
      if (!currentOrganization || !user) throw new Error("Not authorized");
      const { error } = await supabase.from("designer_fees").insert([{
        client_id: Number(clientId),
        organization_id: currentOrganization.organization_id,
        description: values.description,
        billing_amount: values.billing_amount,
        is_legacy: false,
        created_by: user.id,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateDesignerFees();
      setIsAddDesignerFeeOpen(false);
      designerFeeForm.reset({ client_id: Number(clientId), description: 'Designer Fee', billing_amount: 0 });
      toast({ title: "Success", description: "Designer fee added" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const updateDesignerFeeMutation = useMutation({
    mutationFn: async (values: InsertDesignerFee) => {
      if (!editingDesignerFee || !user) throw new Error("Not authorized");
      const { error } = await supabase
        .from("designer_fees")
        .update({ description: values.description, billing_amount: values.billing_amount, updated_by: user.id })
        .eq("id", editingDesignerFee.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateDesignerFees();
      setEditingDesignerFee(null);
      toast({ title: "Success", description: "Designer fee updated" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const deleteDesignerFeeMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("designer_fees").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateDesignerFees();
      setExpandedDesignerFeeId(null);
      toast({ title: "Success", description: "Designer fee deleted" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const createDesignerFeePaymentMutation = useMutation({
    mutationFn: async (values: InsertDesignerFeePayment) => {
      if (!currentOrganization || !user) throw new Error("Not authorized");
      const { error } = await supabase.from("designer_fee_payments").insert([{
        ...values,
        organization_id: currentOrganization.organization_id,
        created_by: user.id,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateDesignerFees();
      setIsRecordDesignerFeePaymentOpen(false);
      designerFeePaymentForm.reset({ designer_fee_id: 0, amount: 0, date: today, description: "" });
      toast({ title: "Success", description: "Payment recorded" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const updateDesignerFeePaymentMutation = useMutation({
    mutationFn: async (values: InsertDesignerFeePayment) => {
      if (!editingDesignerFeePayment || !user) throw new Error("Not authorized");
      const { error } = await supabase
        .from("designer_fee_payments")
        .update({ ...values, updated_by: user.id })
        .eq("id", editingDesignerFeePayment.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateDesignerFees();
      setIsRecordDesignerFeePaymentOpen(false);
      setEditingDesignerFeePayment(null);
      toast({ title: "Success", description: "Payment updated" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const deleteDesignerFeePaymentMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("designer_fee_payments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateDesignerFees();
      toast({ title: "Success", description: "Payment deleted" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const openDesignerFeePaymentDialog = (fee: DesignerFeeWithPayments, existing?: DesignerFeePayment) => {
    setSelectedDesignerFee(fee);
    if (existing) {
      setEditingDesignerFeePayment(existing);
      designerFeePaymentForm.reset({
        designer_fee_id: fee.id,
        amount: Number(existing.amount),
        date: existing.date,
        description: existing.description || "",
      });
    } else {
      setEditingDesignerFeePayment(null);
      const paid = (fee.designer_fee_payments || []).reduce((s, p) => s + Number(p.amount), 0);
      const balance = Number(fee.billing_amount || 0) - paid;
      designerFeePaymentForm.reset({
        designer_fee_id: fee.id,
        amount: balance > 0 ? balance : 0,
        date: today,
        description: "",
      });
    }
    setIsRecordDesignerFeePaymentOpen(true);
  };

  // ── Export ─────────────────────────────────────────────────────────────────

  const exportToHTML = (opts: typeof exportOptions) => {
    const orgName = currentOrganization?.organizations?.name || "Interior Design";
    const generatedDate = format(new Date(), "dd MMM yyyy");
    const fmtH = (n: number) => `₹${n.toLocaleString("en-IN")}`;

    const filteredItems = lineItems.filter(item => {
      if (item.is_legacy) return false;
      if (item.type === "vendor") return opts.vendors;
      if (item.type === "labor") return opts.labour;
      if (item.type === "fee") return opts.fees;
      return false;
    });

    // Dynamic document label
    const includedTypeLabels = [
      opts.vendors && "Vendor",
      opts.labour && "Labour",
      opts.fees && "Fee",
    ].filter(Boolean) as string[];
    const allSelected = opts.vendors && opts.labour && opts.fees && opts.designerFees && opts.clientPayments;
    let docLabel: string;
    if (allSelected) {
      docLabel = "Client Financial Summary";
    } else {
      const parts = [
        ...includedTypeLabels,
        opts.designerFees ? "Designer Fees" : "",
        opts.clientPayments ? "Payments" : "",
      ].filter(Boolean);
      if (parts.length === 0) {
        docLabel = "Client Financial Summary";
      } else if (parts.length === 1) {
        docLabel = `${parts[0]} Summary`;
      } else {
        const last = parts[parts.length - 1];
        docLabel = `${parts.slice(0, -1).join(", ")} & ${last} Summary`;
      }
    }

    // Summary card computed values (based on filtered items only)
    const hasLineItems = opts.vendors || opts.labour || opts.fees;
    const filteredBilled = filteredItems.reduce((s, item) => s + Number(item.billing_amount || 0), 0);
    const filteredBalance = totalReceived
      - filteredBilled
      - (opts.designerFees ? totalDesignerFee : 0);

    // Cards shown when Client Payments is selected
    const totalBilledForCards = filteredBilled + (opts.designerFees ? totalDesignerFee : 0);
    const showCards = opts.clientPayments;
    const summaryCards: string[] = [];
    if (showCards) {
      if (hasLineItems || opts.designerFees) {
        const billedLabel = !hasLineItems && opts.designerFees ? "Designer Fees Total" : "Total Billed";
        const billedSub = !hasLineItems && opts.designerFees
          ? "designer fees"
          : [...includedTypeLabels, opts.designerFees ? "Designer Fees" : ""].filter(Boolean).join(", ") || "selected items";
        summaryCards.push(`
    <div class="card">
      <div class="card-label">${billedLabel}</div>
      <div class="card-value" style="color:${brandColor}">${fmtH(totalBilledForCards)}</div>
      <div class="card-sub">${billedSub}</div>
    </div>`);
      }
      summaryCards.push(`
    <div class="card">
      <div class="card-label">Total Received</div>
      <div class="card-value" style="color:#16a34a">${fmtH(totalReceived)}</div>
      <div class="card-sub">payments made by client</div>
    </div>`);
      if (hasLineItems || opts.designerFees) {
        summaryCards.push(`
    <div class="card" style="border-color:${filteredBalance >= 0 ? "#16a34a" : "#ef4444"}44">
      <div class="card-label">Balance</div>
      <div class="card-value" style="color:${filteredBalance >= 0 ? "#16a34a" : "#ef4444"}">${fmtH(Math.abs(filteredBalance))}</div>
      <div class="card-sub">${filteredBalance >= 0 ? "surplus — overpaid" : "outstanding — client owes"}</div>
    </div>`);
      }
    }
    const cardsHtml = summaryCards.join("");
    const cardsGridCols = Math.max(1, summaryCards.length);

    // Total Billed footer row — shown below items table when cards are hidden
    const colCount = opts.showPaidBalance ? 5 : 3;
    const totalBilledFooter = !showCards && hasLineItems ? `
    <tr style="border-top:2px solid #e5e7eb;background:#f9fafb">
      <td colspan="${colCount - 1}" style="padding:10px 12px;font-weight:700;color:#111827">Total Billed</td>
      <td style="padding:10px 12px;text-align:right;font-weight:800;color:${brandColor}">${fmtH(filteredBilled)}</td>
    </tr>` : "";

    const colSpan = opts.showPaidBalance ? 5 : 3;

    const renderItem = (item: typeof filteredItems[0]) => {
      const displayName =
        item.type === "vendor" ? (item.vendors?.name || item.name || "—")
        : item.type === "labor" ? (item.labors?.name || item.name || "—")
        : (item.description || "Designer Fee");

      const paid = itemPaid(item);
      const bal = itemBalance(item);
      const billedAmt = Number(item.billing_amount || 0);

      const paymentsHtml = opts.paymentDetails
        ? (item.line_item_payments || []).map(p => `
        <tr style="background:#f9fafb">
          <td colspan="2" style="padding:5px 12px 5px 28px;font-size:11px;color:#6b7280;border-bottom:1px solid #f3f4f6">
            ${format(new Date(p.date), "dd MMM yyyy")}${p.description ? ` — ${p.description}` : ""}
          </td>
          <td colspan="2" style="padding:5px 12px;font-size:11px;color:#374151;text-align:right;border-bottom:1px solid #f3f4f6">${fmtH(Number(p.amount))}</td>
        </tr>`).join("")
        : "";

      return `
        <tr>
          <td style="padding:10px 12px;font-weight:500;color:#111827">${displayName}</td>
          <td style="padding:10px 12px;color:#6b7280;font-size:12px">${item.description && item.type !== "fee" ? item.description : ""}</td>
          <td style="padding:10px 12px;text-align:right">${fmtH(billedAmt)}</td>
          ${opts.showPaidBalance ? `
          <td style="padding:10px 12px;text-align:right;color:${paid > 0 ? "#16a34a" : "#9ca3af"}">${fmtH(paid)}</td>
          <td style="padding:10px 12px;text-align:right;font-weight:600;color:${bal > 0 ? "#ef4444" : bal < 0 ? "#16a34a" : "#9ca3af"}">
            ${bal > 0 ? fmtH(bal) : bal < 0 ? fmtH(Math.abs(bal)) + " surplus" : "Settled"}
          </td>` : ""}
        </tr>
        ${paymentsHtml}`;
    };

    const groups: { label: string; color: string; items: typeof filteredItems }[] = [
      { label: "Vendors", color: "#2563eb", items: filteredItems.filter(i => i.type === "vendor") },
      { label: "Labour", color: "#7c3aed", items: filteredItems.filter(i => i.type === "labor") },
      { label: "Other Fees", color: brandColor, items: filteredItems.filter(i => i.type === "fee") },
    ].filter(g => g.items.length > 0);

    const lineItemRows = groups.map(({ label, color, items }) => `
      <tr>
        <td colspan="${colSpan}" style="padding:7px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:${color};background:${color}11;border-top:2px solid ${color}33;border-bottom:1px solid ${color}22">
          ${label}
        </td>
      </tr>
      ${items.map(renderItem).join("")}
    `).join("");

    const clientPaymentRows = opts.clientPayments ? clientPayments.map(p => `
      <tr>
        <td style="padding:10px 12px;color:#374151">${format(new Date(p.date), "dd MMM yyyy")}</td>
        <td style="padding:10px 12px;color:#374151">${p.description || "—"}</td>
        <td style="padding:10px 12px;text-align:right;font-weight:600;color:#16a34a">${fmtH(Number(p.amount))}</td>
      </tr>`).join("") : "";

    const html = `<!DOCTYPE html>
<html lang="en"><head>
  <meta charset="utf-8">
  <title>${client?.name} — ${docLabel}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111827;background:#fff;font-size:13px}
    .page{max-width:860px;margin:0 auto;padding:36px 32px}
    .header{background:${brandColor};color:#fff;padding:28px 32px;border-radius:12px;margin-bottom:28px;display:flex;justify-content:space-between;align-items:flex-start}
    .org{font-size:20px;font-weight:700;letter-spacing:-0.4px}
    .doc-label{font-size:12px;opacity:.8;margin-top:4px;letter-spacing:.04em;text-transform:uppercase}
    .client-name{font-size:22px;font-weight:700;text-align:right}
    .gen-date{font-size:11px;opacity:.75;margin-top:4px;text-align:right}
    .cards{display:grid;grid-template-columns:repeat(${cardsGridCols},1fr);gap:14px;margin-bottom:28px}
    .card{border:1px solid #e5e7eb;border-radius:10px;padding:18px 20px}
    .card-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280}
    .card-value{font-size:24px;font-weight:800;margin-top:6px;line-height:1}
    .card-sub{font-size:11px;color:#9ca3af;margin-top:5px}
    .section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:${brandColor};padding-bottom:8px;border-bottom:2px solid ${brandColor}25;margin-bottom:14px}
    .section{margin-bottom:28px}
    table{width:100%;border-collapse:collapse}
    th{background:#f9fafb;padding:9px 12px;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid #e5e7eb}
    th.r{text-align:right}
    tr:not(:last-child) td{border-bottom:1px solid #f3f4f6}
    .footer{margin-top:36px;padding-top:14px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:11px;color:#9ca3af}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{padding:20px}}
  </style>
</head>
<body><div class="page">

  <div class="header">
    <div>
      <div class="org">${orgName}</div>
      <div class="doc-label">${docLabel}</div>
    </div>
    <div>
      <div class="client-name">${client?.name}</div>
      <div class="gen-date">Generated ${generatedDate}</div>
    </div>
  </div>

  ${showCards && cardsHtml ? `<div class="cards">
    ${cardsHtml}
  </div>` : ""}

  ${opts.designerFees ? `<div class="section">
    <div class="section-title">Designer Fees</div>
    <table>
      <thead><tr>
        <th>Description</th>
        <th class="r">Billed</th>
        ${opts.showPaidBalance ? `<th class="r">Paid</th><th class="r">Balance</th>` : ""}
      </tr></thead>
      <tbody>
        ${designerFees.length === 0
          ? `<tr><td colspan="${opts.showPaidBalance ? 4 : 2}" style="padding:20px;text-align:center;color:#9ca3af">No designer fees recorded</td></tr>`
          : designerFees.map(fee => {
              const feePaid = (fee.designer_fee_payments || []).reduce((s: number, p: any) => s + Number(p.amount), 0);
              const feeBalance = Number(fee.billing_amount || 0) - feePaid;
              const paymentsHtml = opts.paymentDetails
                ? (fee.designer_fee_payments || []).map((p: any) => `
                <tr style="background:#f9fafb">
                  <td colspan="${opts.showPaidBalance ? 3 : 1}" style="padding:5px 12px 5px 28px;font-size:11px;color:#6b7280;border-bottom:1px solid #f3f4f6">
                    ${format(new Date(p.date), "dd MMM yyyy")}${p.description ? ` — ${p.description}` : ""}
                  </td>
                  <td style="padding:5px 12px;font-size:11px;color:#374151;text-align:right;border-bottom:1px solid #f3f4f6">${fmtH(Number(p.amount))}</td>
                </tr>`).join("")
                : "";
              return `
              <tr>
                <td style="padding:10px 12px;font-weight:500;color:#111827">${fee.description}</td>
                <td style="padding:10px 12px;text-align:right">${fmtH(Number(fee.billing_amount || 0))}</td>
                ${opts.showPaidBalance ? `
                <td style="padding:10px 12px;text-align:right;color:${feePaid > 0 ? "#16a34a" : "#9ca3af"}">${fmtH(feePaid)}</td>
                <td style="padding:10px 12px;text-align:right;font-weight:600;color:${feeBalance > 0 ? "#ef4444" : "#9ca3af"}">
                  ${feeBalance > 0 ? fmtH(feeBalance) : "Settled"}
                </td>` : ""}
              </tr>
              ${paymentsHtml}`;
            }).join("")
        }
        <tr style="border-top:2px solid #e5e7eb;background:#f9fafb">
          <td style="padding:10px 12px;font-weight:700;color:#111827">Total Designer Fee</td>
          <td style="padding:10px 12px;text-align:right;font-weight:800;color:${brandColor}">${fmtH(totalDesignerFee)}</td>
          ${opts.showPaidBalance ? `
          <td style="padding:10px 12px;text-align:right;font-weight:700;color:#16a34a">${fmtH(totalDesignerFeePaid)}</td>
          <td style="padding:10px 12px;text-align:right;font-weight:800;color:${(totalDesignerFee - totalDesignerFeePaid) > 0 ? "#ef4444" : "#9ca3af"}">${fmtH(Math.abs(totalDesignerFee - totalDesignerFeePaid))}</td>
          ` : ""}
        </tr>
      </tbody>
    </table>
  </div>` : ""}

  ${hasLineItems ? `<div class="section">
    <div class="section-title">Project Line Items</div>
    <table>
      <thead><tr>
        <th>Name</th>
        <th>Description</th>
        <th class="r">Billed</th>
        ${opts.showPaidBalance ? `<th class="r">Paid</th><th class="r">Balance</th>` : ""}
      </tr></thead>
      <tbody>
        ${lineItemRows || `<tr><td colspan="${opts.showPaidBalance ? 5 : 3}" style="padding:20px;text-align:center;color:#9ca3af">No line items recorded</td></tr>`}
        ${totalBilledFooter}
      </tbody>
    </table>
  </div>` : ""}

  ${opts.clientPayments ? `
  <div class="section">
    <div class="section-title">Payments Received</div>
    <table>
      <thead><tr>
        <th>Date</th>
        <th>Description</th>
        <th class="r">Amount</th>
      </tr></thead>
      <tbody>
        ${clientPaymentRows || `<tr><td colspan="3" style="padding:20px;text-align:center;color:#9ca3af">No payments recorded</td></tr>`}
        <tr style="border-top:2px solid #e5e7eb;background:#f9fafb">
          <td colspan="2" style="padding:10px 12px;font-weight:700">Total Received</td>
          <td style="padding:10px 12px;text-align:right;font-weight:700;color:#16a34a">${fmtH(totalReceived)}</td>
        </tr>
      </tbody>
    </table>
  </div>` : ""}

  <div class="footer">
    <span>Prepared by <strong>${orgName}</strong></span>
    <span style="display:flex;align-items:center;gap:8px">
      <span>Confidential · ${generatedDate}</span>
      <span style="color:#d1d5db">·</span>
      <span style="font-size:11px">Powered by <span style="font-weight:800;color:${brandColor};letter-spacing:-0.3px">Dezfin</span></span>
    </span>
  </div>

</div>
<script>window.onload=()=>{window.print()}</script>
</body></html>`;

    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
    }
  };

  if (clientLoading) return <div className="p-4">Loading...</div>;
  if (!client) return <div className="p-4">Client not found</div>;

  const isLoading = lineItemsLoading || clientPaymentsLoading || designerFeesLoading;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation(`/clients/${clientId}`)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <p className="text-sm text-gray-500">Financial Hub</p>
            <h1 className="text-2xl font-bold">{client.name}</h1>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() => setIsExportDialogOpen(true)}
          className="flex items-center gap-2"
        >
          <Download className="h-4 w-4" />
          Export PDF
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Received</p>
            <p className="text-2xl font-bold mt-1 text-green-600">{fmt(totalReceived)}</p>
            <p className="text-xs text-gray-400 mt-1">from client</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Client Balance</p>
              <Popover>
                <PopoverTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-gray-400 cursor-pointer shrink-0" />
                </PopoverTrigger>
                <PopoverContent side="bottom" className="max-w-xs p-3 space-y-1.5 text-xs">
                  <p className="font-semibold text-gray-700 mb-2">How this is calculated</p>
                  <div className="space-y-1 text-gray-500">
                    <div className="flex justify-between gap-6">
                      <span>Client Payments Received</span>
                      <span className="font-medium text-gray-700">{fmt(totalReceived)}</span>
                    </div>
                    <div className="flex justify-between gap-6">
                      <span>Total Billed (BM)</span>
                      <span className="font-medium text-gray-700">−&nbsp;{fmt(totalOwed)}</span>
                    </div>
                    <div className="flex justify-between gap-6">
                      <span>Designer Fees paid till now</span>
                      <span className="font-medium text-gray-700">−&nbsp;{fmt(totalDesignerFeePaid)}</span>
                    </div>
                    <div className="flex justify-between gap-6 border-t pt-1 font-semibold text-gray-700">
                      <span>Client Balance</span>
                      <span className={clientBalance >= 0 ? "text-green-600" : "text-red-500"}>
                        {clientBalance >= 0 ? "" : "−"}{fmt(Math.abs(clientBalance))}
                      </span>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <p className={`text-2xl font-bold mt-1 ${clientBalance >= 0 ? "text-green-600" : "text-red-500"}`}>
              {fmt(Math.abs(clientBalance))}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {clientBalance >= 0 ? "surplus" : "deficit — client owes"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Designer Fee</p>
              <Popover>
                <PopoverTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-gray-400 cursor-pointer shrink-0" />
                </PopoverTrigger>
                <PopoverContent side="bottom" className="max-w-xs p-3 space-y-1.5 text-xs">
                  <p className="font-semibold text-gray-700 mb-2">Designer Fee Summary</p>
                  <div className="space-y-1 text-gray-500">
                    <div className="flex justify-between gap-6">
                      <span>Total Billed</span>
                      <span className="font-medium text-gray-700">{fmt(totalDesignerFee)}</span>
                    </div>
                    <div className="flex justify-between gap-6">
                      <span>Total Paid</span>
                      <span className="font-medium text-gray-700">−&nbsp;{fmt(totalDesignerFeePaid)}</span>
                    </div>
                    <div className="flex justify-between gap-6 border-t pt-1 font-semibold text-gray-700">
                      <span>Balance</span>
                      <span className={(totalDesignerFee - totalDesignerFeePaid) > 0 ? "text-red-500" : "text-green-600"}>
                        {fmt(Math.abs(totalDesignerFee - totalDesignerFeePaid))}
                      </span>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <p className={`text-2xl font-bold mt-1 ${(totalDesignerFee - totalDesignerFeePaid) > 0 ? "text-red-500" : "text-green-600"}`}>
              {fmt(Math.abs(totalDesignerFee - totalDesignerFeePaid))}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {(totalDesignerFee - totalDesignerFeePaid) > 0 ? "balance outstanding" : "fully settled"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Revenue</p>
            <p className="text-2xl font-bold mt-1" style={{ color: brandColor }}>{fmt(totalRevenue)}</p>
            <p className="text-xs text-gray-400 mt-1">Markup {fmt(totalCommission)} + Designer {fmt(totalDesignerFee)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Designer Fees Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div className="min-w-0">
            <CardTitle>
              Designer Fees
            </CardTitle>
            <p className="text-sm text-gray-500 mt-1">Professional fees charged to the client. Click a row to see payment history.</p>
          </div>
          <Button
            style={{ backgroundColor: brandColor }}
            className="text-white hover:opacity-90 shrink-0"
            onClick={() => {
              setEditingDesignerFee(null);
              designerFeeForm.reset({ client_id: Number(clientId), description: 'Designer Fee', billing_amount: 0 });
              setIsAddDesignerFeeOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Designer Fee
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {designerFeesLoading ? (
            <div className="p-4 text-center text-gray-500">Loading...</div>
          ) : designerFees.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              No designer fees recorded yet. Add your first designer fee.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="w-6"></TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Billed</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {designerFees.map((fee) => {
                    const paid = (fee.designer_fee_payments || []).reduce((s, p) => s + Number(p.amount), 0);
                    const balance = Number(fee.billing_amount || 0) - paid;
                    const isExpanded = expandedDesignerFeeId === fee.id;
                    const payments = [...(fee.designer_fee_payments || [])].sort(
                      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
                    );

                    return (
                      <>
                        <TableRow
                          key={fee.id}
                          className="cursor-pointer hover:bg-gray-50 transition-colors"
                          onClick={() => setExpandedDesignerFeeId(isExpanded ? null : fee.id)}
                        >
                          <TableCell className="w-6">
                            {isExpanded
                              ? <ChevronDown className="h-4 w-4 text-gray-400" />
                              : <ChevronRight className="h-4 w-4 text-gray-400" />}
                          </TableCell>
                          <TableCell className="font-medium">{fee.description}</TableCell>
                          <TableCell className="text-right text-sm">{fmt(Number(fee.billing_amount || 0))}</TableCell>
                          <TableCell className="text-right text-sm text-green-600 font-medium">{fmt(paid)}</TableCell>
                          <TableCell className={`text-right text-sm font-bold ${balance > 0 ? "text-red-500" : "text-gray-400"}`}>
                            {fmt(balance)}
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <div className="flex gap-1 justify-end">
                              <Button
                                variant="ghost" size="icon"
                                onClick={() => {
                                  setEditingDesignerFee(fee);
                                  designerFeeForm.reset({
                                    client_id: Number(clientId),
                                    description: fee.description,
                                    billing_amount: Number(fee.billing_amount),
                                  });
                                  setIsAddDesignerFeeOpen(true);
                                }}
                                title="Edit"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost" size="icon"
                                className="text-red-400 hover:text-red-600 hover:bg-red-50"
                                onClick={() => deleteDesignerFeeMutation.mutate(fee.id)}
                                title="Delete"
                              >
                                <Trash className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>

                        {/* Expanded Payment History */}
                        {isExpanded && (
                          <TableRow key={`${fee.id}-expanded`}>
                            <TableCell colSpan={6} className="p-0 bg-gray-50/60">
                              <div className="px-10 py-4 space-y-3">
                                <div className="flex items-center justify-between">
                                  <h4 className="text-sm font-semibold text-gray-700">Payment History</h4>
                                  <Button
                                    size="sm"
                                    style={{ backgroundColor: brandColor }}
                                    className="text-white hover:opacity-90 h-7 text-xs"
                                    onClick={() => openDesignerFeePaymentDialog(fee)}
                                  >
                                    <Plus className="h-3.5 w-3.5 mr-1" />
                                    Record Payment
                                  </Button>
                                </div>
                                {payments.length === 0 ? (
                                  <p className="text-sm text-gray-400 py-2">No payments recorded yet.</p>
                                ) : (
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="text-xs text-gray-500 border-b">
                                        <th className="text-left pb-1 font-medium">Date</th>
                                        <th className="text-right pb-1 font-medium">Amount</th>
                                        <th className="text-left pb-1 font-medium pl-4">Description</th>
                                        <th></th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {payments.map((p) => (
                                        <tr key={p.id} className="border-b border-gray-100 last:border-0">
                                          <td className="py-1.5 text-gray-600">
                                            {format(new Date(p.date), "dd MMM yyyy")}
                                          </td>
                                          <td className="py-1.5 text-right font-medium text-green-600">
                                            {fmt(Number(p.amount))}
                                          </td>
                                          <td className="py-1.5 pl-4 text-gray-500">{p.description || "—"}</td>
                                          <td className="py-1.5">
                                            <div className="flex gap-1 justify-end">
                                              <Button
                                                variant="ghost" size="icon" className="h-6 w-6"
                                                onClick={() => openDesignerFeePaymentDialog(fee, p)}
                                              >
                                                <Pencil className="h-3 w-3" />
                                              </Button>
                                              <Button
                                                variant="ghost" size="icon" className="h-6 w-6 text-red-400 hover:text-red-600"
                                                onClick={() => deleteDesignerFeePaymentMutation.mutate(p.id)}
                                              >
                                                <Trash className="h-3 w-3" />
                                              </Button>
                                            </div>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Line Items Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div className="min-w-0">
            <CardTitle>Project Line Items</CardTitle>
            <p className="text-sm text-gray-500 mt-1">Vendors, labours, and fees. Click a row to see payment history.</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                placeholder="Search line items..."
                value={lineItemSearch}
                onChange={(e) => setLineItemSearch(e.target.value)}
                className="pl-8 w-52"
              />
            </div>
            <Button
              style={{ backgroundColor: brandColor }}
              className="text-white hover:opacity-90"
              onClick={() => {
                setEditingLineItem(null);
                lineItemForm.reset({ client_id: Number(clientId), type: "vendor" });
                setIsAddLineItemOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Line Item
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 text-center text-gray-500">Loading...</div>
          ) : lineItems.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              No line items yet. Add your first vendor, labour, or fee.
            </div>
          ) : (() => {
            const q = lineItemSearch.trim().toLowerCase();
            const filteredLineItems = q
              ? lineItems.filter(item => {
                  const name = (item.vendors?.name || item.labors?.name || item.name || '').toLowerCase();
                  const desc = (item.description || '').toLowerCase();
                  const type = (item.type || '').toLowerCase();
                  return name.includes(q) || desc.includes(q) || type.includes(q);
                })
              : lineItems;
            return filteredLineItems.length === 0 ? (
              <div className="p-8 text-center text-gray-400">No line items match your search.</div>
            ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="w-6"></TableHead>
                    <TableHead>Type / Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">BM</TableHead>
                    <TableHead className="text-right">AM</TableHead>
                    <TableHead className="text-right">Markup</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLineItems.map((item) => {
                    const paid = itemPaid(item);
                    const commission = itemCommission(item);
                    const balance = itemBalance(item);
                    const isExpanded = expandedRowId === item.id;
                    const payments = [...(item.line_item_payments || [])].sort(
                      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
                    );

                    const typeBadge = item.is_legacy ? (
                      <Badge variant="outline" className="text-xs text-gray-400">Legacy</Badge>
                    ) : item.type === "vendor" ? (
                      <Badge variant="outline" className="text-xs text-blue-600 border-blue-200">Vendor</Badge>
                    ) : item.type === "labor" ? (
                      <Badge variant="outline" className="text-xs text-purple-600 border-purple-200">Labour</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-amber-600 border-amber-200">Other Fee</Badge>
                    );

                    const displayName = item.type === "vendor"
                      ? (item.vendors?.name || item.name || "—")
                      : item.type === "labor"
                      ? (item.labors?.name || item.name || "—")
                      : "—";

                    return (
                      <>
                        <TableRow
                          key={item.id}
                          className="cursor-pointer hover:bg-gray-50 transition-colors"
                          onClick={() => setExpandedRowId(isExpanded ? null : item.id)}
                        >
                          <TableCell className="w-6">
                            {isExpanded
                              ? <ChevronDown className="h-4 w-4 text-gray-400" />
                              : <ChevronRight className="h-4 w-4 text-gray-400" />}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              {typeBadge}
                              {displayName !== "—" && (
                                <div className="text-sm font-medium">{displayName}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">{item.description || "—"}</TableCell>
                          <TableCell className="text-right text-sm">
                            {item.is_legacy || item.type === "fee"
                              ? item.type === "fee" ? fmt(Number(item.billing_amount || 0)) : "—"
                              : fmt(Number(item.billing_amount || 0))}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {item.is_legacy || item.type === "fee" ? "—" : fmt(Number(item.actual_amount || 0))}
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium" style={{ color: brandColor }}>
                            {commission > 0 ? fmt(commission) : "—"}
                          </TableCell>
                          <TableCell className="text-right text-sm text-green-600 font-medium">
                            {fmt(paid)}
                          </TableCell>
                          <TableCell className={`text-right text-sm font-bold ${balance > 0 ? "text-red-500" : "text-gray-400"}`}>
                            {fmt(balance)}
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <div className="flex gap-1 justify-end">
                              <Button
                                variant="ghost" size="icon"
                                onClick={() => openEditLineItem(item)}
                                title="Edit"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost" size="icon"
                                className="text-red-400 hover:text-red-600 hover:bg-red-50"
                                onClick={() => deleteLineItemMutation.mutate(item.id)}
                                title="Delete"
                              >
                                <Trash className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>

                        {/* Expanded Payment History */}
                        {isExpanded && (
                          <TableRow key={`${item.id}-expanded`}>
                            <TableCell colSpan={9} className="p-0 bg-gray-50/60">
                              <div className="px-10 py-4 space-y-3">
                                <div className="flex items-center justify-between">
                                  <h4 className="text-sm font-semibold text-gray-700">Payment History</h4>
                                  <Button
                                    size="sm"
                                    style={{ backgroundColor: brandColor }}
                                    className="text-white hover:opacity-90 h-7 text-xs"
                                    onClick={() => openRecordPayment(item)}
                                  >
                                    <Plus className="h-3.5 w-3.5 mr-1" />
                                    Record Payment
                                  </Button>
                                </div>
                                {payments.length === 0 ? (
                                  <p className="text-sm text-gray-400 py-2">No payments recorded yet.</p>
                                ) : (
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="text-xs text-gray-500 border-b">
                                        <th className="text-left pb-1 font-medium">Date</th>
                                        <th className="text-right pb-1 font-medium">Amount</th>
                                        <th className="text-left pb-1 font-medium pl-4">Description</th>
                                        <th className="text-center pb-1 font-medium">Proxy</th>
                                        <th></th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {payments.map((p) => (
                                        <tr key={p.id} className="border-b border-gray-100 last:border-0">
                                          <td className="py-1.5 text-gray-600">
                                            {format(new Date(p.date), "dd MMM yyyy")}
                                          </td>
                                          <td className="py-1.5 text-right font-medium text-green-600">
                                            {fmt(Number(p.amount))}
                                          </td>
                                          <td className="py-1.5 pl-4 text-gray-500">{p.description || "—"}</td>
                                          <td className="py-1.5 text-center">
                                            {p.is_proxy && (
                                              <Badge variant="outline" className="text-xs text-amber-600 border-amber-200">
                                                Proxy
                                              </Badge>
                                            )}
                                          </td>
                                          <td className="py-1.5">
                                            <div className="flex gap-1 justify-end">
                                              <Button
                                                variant="ghost" size="icon" className="h-6 w-6"
                                                onClick={() => openRecordPayment(item, p)}
                                              >
                                                <Pencil className="h-3 w-3" />
                                              </Button>
                                              <Button
                                                variant="ghost" size="icon" className="h-6 w-6 text-red-400 hover:text-red-600"
                                                onClick={() => deleteLineItemPaymentMutation.mutate(p.id)}
                                              >
                                                <Trash className="h-3 w-3" />
                                              </Button>
                                            </div>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          );
          })()}
        </CardContent>
      </Card>

      {/* Client Payments Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Client Payments</CardTitle>
            <p className="text-sm text-gray-500 mt-1">Money received from the client.</p>
          </div>
          <Button
            style={{ backgroundColor: brandColor }}
            className="text-white hover:opacity-90"
            onClick={() => {
              setEditingClientPayment(null);
              clientPaymentForm.reset({ amount: 0, date: today, description: "" });
              setIsClientPaymentOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Payment
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {clientPayments.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No payments received yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientPayments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm">
                      {format(new Date(p.date), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell className="text-right font-medium text-green-600">
                      {fmt(Number(p.amount))}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">{p.description || "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        <Button
                          variant="ghost" size="icon"
                          onClick={() => {
                            setEditingClientPayment(p);
                            clientPaymentForm.reset({
                              amount: Number(p.amount),
                              date: new Date(p.date).toISOString().split("T")[0],
                              description: p.description || "",
                            });
                            setIsClientPaymentOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          className="text-red-400 hover:text-red-600 hover:bg-red-50"
                          onClick={() => deleteClientPaymentMutation.mutate(p.id)}
                        >
                          <Trash className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Add / Edit Line Item Dialog ───────────────────────────────────── */}
      <Dialog
        open={isAddLineItemOpen || !!editingLineItem}
        onOpenChange={(open) => {
          if (!open) { setIsAddLineItemOpen(false); setEditingLineItem(null); resetComboboxes(); }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingLineItem ? "Edit Line Item" : "Add Line Item"}</DialogTitle>
          </DialogHeader>
          <Form {...lineItemForm}>
            <form onSubmit={lineItemForm.handleSubmit(handleLineItemSubmit)} className="space-y-4">
              {/* Type */}
              <FormField
                control={lineItemForm.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select value={field.value} onValueChange={(v) => {
                      field.onChange(v);
                      lineItemForm.setValue("vendor_id", null);
                      lineItemForm.setValue("labor_id", null);
                    }}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="vendor">Vendor</SelectItem>
                        <SelectItem value="labor">Labour</SelectItem>
                        <SelectItem value="fee">Other Fee</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Vendor combobox */}
              {watchedType === "vendor" && (
                <FormItem>
                  <FormLabel>Vendor Name</FormLabel>
                  <div className="relative">
                    <Input
                      placeholder="Type to search or enter custom name"
                      value={vendorSearchText}
                      onChange={(e) => {
                        const val = e.target.value;
                        setVendorSearchText(val);
                        setShowVendorSuggestions(true);
                        lineItemForm.setValue("vendor_id", null);
                        lineItemForm.setValue("name", val || null);
                      }}
                      onFocus={() => setShowVendorSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowVendorSuggestions(false), 150)}
                    />
                    {showVendorSuggestions && vendors.filter(v =>
                      v.name.toLowerCase().includes(vendorSearchText.toLowerCase())
                    ).length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-auto">
                        {vendors
                          .filter(v => v.name.toLowerCase().includes(vendorSearchText.toLowerCase()))
                          .map(v => (
                            <div
                              key={v.id}
                              className="px-3 py-2 text-sm cursor-pointer hover:bg-gray-100"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setVendorSearchText(v.name);
                                lineItemForm.setValue("vendor_id", v.id);
                                lineItemForm.setValue("name", v.name);
                                setShowVendorSuggestions(false);
                              }}
                            >
                              {v.name}
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </FormItem>
              )}

              {/* Labour combobox */}
              {watchedType === "labor" && (
                <FormItem>
                  <FormLabel>Labour Name</FormLabel>
                  <div className="relative">
                    <Input
                      placeholder="Type to search or enter custom name"
                      value={laborSearchText}
                      onChange={(e) => {
                        const val = e.target.value;
                        setLaborSearchText(val);
                        setShowLaborSuggestions(true);
                        lineItemForm.setValue("labor_id", null);
                        lineItemForm.setValue("name", val || null);
                      }}
                      onFocus={() => setShowLaborSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowLaborSuggestions(false), 150)}
                    />
                    {showLaborSuggestions && labors.filter(l =>
                      l.name.toLowerCase().includes(laborSearchText.toLowerCase())
                    ).length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-auto">
                        {labors
                          .filter(l => l.name.toLowerCase().includes(laborSearchText.toLowerCase()))
                          .map(l => (
                            <div
                              key={l.id}
                              className="px-3 py-2 text-sm cursor-pointer hover:bg-gray-100"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setLaborSearchText(l.name);
                                lineItemForm.setValue("labor_id", l.id);
                                lineItemForm.setValue("name", l.name);
                                setShowLaborSuggestions(false);
                              }}
                            >
                              {l.name}
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </FormItem>
              )}

              {/* Description */}
              <FormField
                control={lineItemForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{watchedType === "fee" ? "Fee Name" : "Description"}</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} placeholder={watchedType === "fee" ? "e.g. Designer Fee" : "Work description"} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* BM / Fee Amount */}
              <FormField
                control={lineItemForm.control}
                name="billing_amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{watchedType === "fee" ? "Fee Amount (₹)" : "Billing Amount — BM (₹)"}</FormLabel>
                    <FormControl>
                      <Input
                        type="number" step="0.01"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* AM — only for vendor/labor */}
              {watchedType !== "fee" && (
                <FormField
                  control={lineItemForm.control}
                  name="actual_amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Actual Amount — AM (₹)</FormLabel>
                      <FormControl>
                        <Input
                          type="number" step="0.01"
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Commission preview */}
              {watchedType !== "fee" && (
                <div className="rounded-md bg-gray-50 p-3 text-sm flex justify-between">
                  <span className="text-gray-500">Markup (BM − AM)</span>
                  <span className="font-bold" style={{ color: brandColor }}>
                    {fmt(
                      Math.max(0,
                        Number(lineItemForm.watch("billing_amount") || 0) -
                        Number(lineItemForm.watch("actual_amount") || 0)
                      )
                    )}
                  </span>
                </div>
              )}

              <Button
                type="submit"
                className="w-full text-white hover:opacity-90"
                style={{ backgroundColor: brandColor }}
                disabled={createLineItemMutation.isPending || updateLineItemMutation.isPending}
              >
                {editingLineItem ? "Save Changes" : "Add Line Item"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── Record Payment Dialog ─────────────────────────────────────────── */}
      <Dialog open={isRecordPaymentOpen} onOpenChange={(open) => {
        if (!open) { setIsRecordPaymentOpen(false); setEditingLineItemPayment(null); setSelectedLineItem(null); }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {editingLineItemPayment ? "Edit Payment" : "Record Payment"}
              {selectedLineItem && (
                <span className="block text-sm font-normal text-gray-500 mt-0.5">
                  {selectedLineItem.vendors?.name || selectedLineItem.labors?.name || selectedLineItem.description}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <Form {...lineItemPaymentForm}>
            <form onSubmit={lineItemPaymentForm.handleSubmit(handleLineItemPaymentSubmit)} className="space-y-4">
              <FormField
                control={lineItemPaymentForm.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount (₹)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={lineItemPaymentForm.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={lineItemPaymentForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} placeholder="Optional note" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Proxy checkbox — only for vendor/labor */}
              {selectedLineItem && selectedLineItem.type !== "fee" && (
                <FormField
                  control={lineItemPaymentForm.control}
                  name="is_proxy"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-3 space-y-0 rounded-md border p-3">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(checked) => handleProxyToggle(!!checked)}
                        />
                      </FormControl>
                      <div>
                        <FormLabel className="cursor-pointer">Proxy Payment</FormLabel>
                        <p className="text-xs text-gray-400">
                          Auto-fill BM − AM ({fmt(
                            Number(selectedLineItem.billing_amount || 0) - Number(selectedLineItem.actual_amount || 0)
                          )})
                        </p>
                      </div>
                    </FormItem>
                  )}
                />
              )}

              <Button
                type="submit"
                className="w-full text-white hover:opacity-90"
                style={{ backgroundColor: brandColor }}
                disabled={createLineItemPaymentMutation.isPending || updateLineItemPaymentMutation.isPending}
              >
                {editingLineItemPayment ? "Save Changes" : "Record Payment"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── Client Payment Dialog ─────────────────────────────────────────── */}
      <Dialog open={isClientPaymentOpen} onOpenChange={(open) => {
        if (!open) { setIsClientPaymentOpen(false); setEditingClientPayment(null); }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingClientPayment ? "Edit Client Payment" : "Add Client Payment"}</DialogTitle>
          </DialogHeader>
          <Form {...clientPaymentForm}>
            <form onSubmit={clientPaymentForm.handleSubmit((v) =>
              editingClientPayment ? updateClientPaymentMutation.mutate(v) : createClientPaymentMutation.mutate(v)
            )} className="space-y-4">
              <FormField
                control={clientPaymentForm.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount (₹)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={clientPaymentForm.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={clientPaymentForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea {...field} value={field.value ?? ""} placeholder="e.g. Advance payment" className="min-h-[60px]" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full text-white hover:opacity-90"
                style={{ backgroundColor: brandColor }}
                disabled={createClientPaymentMutation.isPending || updateClientPaymentMutation.isPending}
              >
                {editingClientPayment ? "Save Changes" : "Add Payment"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── Add / Edit Designer Fee Dialog ───────────────────────────────── */}
      <Dialog
        open={isAddDesignerFeeOpen || !!editingDesignerFee}
        onOpenChange={(open) => {
          if (!open) { setIsAddDesignerFeeOpen(false); setEditingDesignerFee(null); }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingDesignerFee ? "Edit Designer Fee" : "Add Designer Fee"}</DialogTitle>
          </DialogHeader>
          <Form {...designerFeeForm}>
            <form onSubmit={designerFeeForm.handleSubmit((v) =>
              editingDesignerFee ? updateDesignerFeeMutation.mutate(v) : createDesignerFeeMutation.mutate(v)
            )} className="space-y-4">
              <FormField
                control={designerFeeForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g. Designer Fee — Phase 1" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={designerFeeForm.control}
                name="billing_amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Billing Amount (₹)</FormLabel>
                    <FormControl>
                      <Input
                        type="number" step="0.01"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full text-white hover:opacity-90"
                style={{ backgroundColor: brandColor }}
                disabled={createDesignerFeeMutation.isPending || updateDesignerFeeMutation.isPending}
              >
                {editingDesignerFee ? "Save Changes" : "Add Designer Fee"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── Record Designer Fee Payment Dialog ───────────────────────────── */}
      <Dialog open={isRecordDesignerFeePaymentOpen} onOpenChange={(open) => {
        if (!open) { setIsRecordDesignerFeePaymentOpen(false); setEditingDesignerFeePayment(null); setSelectedDesignerFee(null); }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {editingDesignerFeePayment ? "Edit Payment" : "Record Payment"}
              {selectedDesignerFee && (
                <span className="block text-sm font-normal text-gray-500 mt-0.5">
                  {selectedDesignerFee.description}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <Form {...designerFeePaymentForm}>
            <form onSubmit={designerFeePaymentForm.handleSubmit((v) =>
              editingDesignerFeePayment ? updateDesignerFeePaymentMutation.mutate(v) : createDesignerFeePaymentMutation.mutate(v)
            )} className="space-y-4">
              <FormField
                control={designerFeePaymentForm.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount (₹)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={designerFeePaymentForm.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={designerFeePaymentForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} placeholder="Optional note" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full text-white hover:opacity-90"
                style={{ backgroundColor: brandColor }}
                disabled={createDesignerFeePaymentMutation.isPending || updateDesignerFeePaymentMutation.isPending}
              >
                {editingDesignerFeePayment ? "Save Changes" : "Record Payment"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── Export Options Dialog ──────────────────────────────────────────── */}
      <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Export PDF</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-500">Select sections to include in the PDF export.</p>
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Line Item Types</p>
              {([
                { key: "vendors", label: "Vendors" },
                { key: "labour", label: "Labour" },
                { key: "fees", label: "Other Fees" },
              ] as { key: keyof typeof exportOptions; label: string }[]).map(({ key, label }) => (
                <label key={key} className="flex items-center gap-3 cursor-pointer">
                  <Checkbox
                    checked={exportOptions[key]}
                    onCheckedChange={(v) => setExportOptions(o => ({ ...o, [key]: !!v }))}
                  />
                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </div>
            <div className="border-t pt-3 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Additional Sections</p>
              <label className="flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={exportOptions.designerFees}
                  onCheckedChange={(v) => setExportOptions(o => ({ ...o, designerFees: !!v }))}
                />
                <span className="text-sm">Designer Fees</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={exportOptions.clientPayments}
                  onCheckedChange={(v) => setExportOptions(o => ({ ...o, clientPayments: !!v }))}
                />
                <span className="text-sm">Client Payments</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={exportOptions.paymentDetails}
                  onCheckedChange={(v) => setExportOptions(o => ({ ...o, paymentDetails: !!v }))}
                />
                <div>
                  <span className="text-sm">Include Payment Details</span>
                  <p className="text-xs text-gray-400">Show individual payments under each line item</p>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={exportOptions.showPaidBalance}
                  onCheckedChange={(v) => setExportOptions(o => ({ ...o, showPaidBalance: !!v }))}
                />
                <div>
                  <span className="text-sm">Show Paid &amp; Balance columns</span>
                  <p className="text-xs text-gray-400">Include Paid and Balance columns in the line items table</p>
                </div>
              </label>
            </div>
            <Button
              className="w-full text-white hover:opacity-90"
              style={{ backgroundColor: brandColor }}
              onClick={() => {
                exportToHTML(exportOptions);
                setIsExportDialogOpen(false);
              }}
            >
              <Download className="h-4 w-4 mr-2" />
              Generate PDF
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
