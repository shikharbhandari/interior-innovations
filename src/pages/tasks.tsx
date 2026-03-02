import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Plus, Pencil, Trash, Search, ChevronDown } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { insertTaskSchema, type Task, type InsertTask, type Client } from "@/lib/schema";

const TASK_STATUSES = [
  "Not Started",
  "In Progress",
  "On Hold",
  "Completed",
  "Cancelled"
] as const;

type TaskWithClient = Task & {
  clients: Client | null;
  user_profiles: { id: string; email: string | null; full_name: string | null } | null;
};

export default function Tasks() {
  const { currentOrganization, user, hasPermission } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();

  // Get brand color from centralized hook
  const { brandColor } = useBrandColor();

  const { data: tasks, isLoading: tasksLoading } = useQuery({
    queryKey: ['tasks', currentOrganization?.organization_id],
    queryFn: async () => {
      if (!currentOrganization) throw new Error('No organization selected');

      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          clients (
            id,
            name
          ),
          user_profiles!tasks_assigned_to_fkey (
            id,
            email,
            full_name
          )
        `)
        .eq('organization_id', currentOrganization.organization_id)
        .order('due_date', { ascending: true });
      if (error) throw error;
      return data as TaskWithClient[];
    },
    enabled: !!currentOrganization,
  });

  const { data: clients, isLoading: clientsLoading } = useQuery({
    queryKey: ['clients', currentOrganization?.organization_id],
    queryFn: async () => {
      if (!currentOrganization) throw new Error('No organization selected');

      const { data, error } = await supabase
        .from('clients')
        .select('id, name')
        .eq('organization_id', currentOrganization.organization_id)
        .order('name');
      if (error) throw error;
      return data as Client[];
    },
    enabled: !!currentOrganization,
  });

  // Fetch organization members for task assignment
  const { data: members } = useQuery({
    queryKey: ['organization-members', currentOrganization?.organization_id],
    queryFn: async () => {
      if (!currentOrganization) throw new Error('No organization selected');

      const { data, error } = await supabase
        .from('organization_members')
        .select(`
          user_id,
          user_profiles!organization_members_user_id_fkey (
            id,
            email,
            full_name
          )
        `)
        .eq('organization_id', currentOrganization.organization_id)
        .eq('status', 'active');

      if (error) throw error;
      return data;
    },
    enabled: !!currentOrganization,
  });

  // Filter tasks based on status, client, assignee, and search query
  const filteredTasks = tasks?.filter(task =>
    (statusFilter === "all" || task.status === statusFilter) &&
    (clientFilter === "all" || task.client_id?.toString() === clientFilter) &&
    (assigneeFilter === "all" ||
      (assigneeFilter === "unassigned" && !task.assigned_to) ||
      (assigneeFilter === "me" && task.assigned_to === user?.id) ||
      task.assigned_to === assigneeFilter) &&
    (task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.description?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const form = useForm<InsertTask>({
    resolver: zodResolver(insertTaskSchema),
    defaultValues: {
      title: '',
      description: '',
      status: 'Not Started',
      due_date: new Date(),
      client_id: null,
      assigned_to: null
    }
  });

  const createMutation = useMutation({
    mutationFn: async (values: InsertTask) => {
      if (!currentOrganization || !user) throw new Error('Not authorized');

      const { error } = await supabase
        .from('tasks')
        .insert([{
          title: values.title,
          description: values.description,
          status: values.status,
          due_date: values.due_date.toISOString(),
          client_id: values.client_id || null,
          assigned_to: values.assigned_to || null,
          organization_id: currentOrganization.organization_id,
          created_by: user.id,
        }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', currentOrganization?.organization_id] });
      setIsOpen(false);
      form.reset({
        title: '',
        description: '',
        status: 'Not Started',
        due_date: new Date(),
        client_id: null,
        assigned_to: null
      });
      toast({
        title: "Success",
        description: "Task created successfully",
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
    mutationFn: async (values: InsertTask) => {
      if (!editingTask || !user) return;
      const { error} = await supabase
        .from('tasks')
        .update({
          title: values.title,
          description: values.description,
          status: values.status,
          due_date: values.due_date.toISOString(),
          client_id: values.client_id || null,
          assigned_to: values.assigned_to || null,
          updated_by: user.id,
        })
        .eq('id', editingTask.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', currentOrganization?.organization_id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      setIsOpen(false);
      setEditingTask(null);
      form.reset({
        title: '',
        description: '',
        status: 'Not Started',
        due_date: new Date(),
        client_id: null,
        assigned_to: null
      });
      toast({
        title: "Success",
        description: "Task updated successfully",
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
        .from('tasks')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', currentOrganization?.organization_id] });
      toast({
        title: "Success",
        description: "Task deleted successfully",
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

  const onSubmit = (values: InsertTask) => {
    if (editingTask) {
      updateMutation.mutate(values);
    } else {
      createMutation.mutate(values);
    }
  };

  const handleEdit = (task: Task) => {
    setEditingTask(task);
    form.reset({
      ...task,
      due_date: new Date(task.due_date),
      client_id: task.client_id || null,
      assigned_to: task.assigned_to || null
    });
    setIsOpen(true);
  };

  if (tasksLoading || clientsLoading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Tasks</h1>
        <div className="flex gap-4">
          <Select
            value={statusFilter}
            onValueChange={setStatusFilter}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {TASK_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={clientFilter}
            onValueChange={setClientFilter}
          >
            <SelectTrigger className="w-[180px]">
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

          <Select
            value={assigneeFilter}
            onValueChange={setAssigneeFilter}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by assignee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tasks</SelectItem>
              <SelectItem value="me">My Tasks</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {members?.filter((m: any) => m.user_profiles).map((member: any) => (
                <SelectItem key={member.user_profiles.id} value={member.user_profiles.id}>
                  {member.user_profiles.full_name || member.user_profiles.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasPermission('tasks', 'create') && (
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
              <DialogTrigger asChild>
                <Button
                  style={{ backgroundColor: brandColor, borderColor: brandColor }}
                  className="text-white hover:opacity-90"
                  onClick={() => {
                  setEditingTask(null);
                  form.reset({
                    title: '',
                    description: '',
                    status: 'Not Started',
                    due_date: new Date(),
                    client_id: undefined
                  });
                }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Task
                </Button>
              </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingTask ? 'Edit Task' : 'Add New Task'}
                </DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea {...field} value={field.value || ''} placeholder="Add task description..." />
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
                              <SelectValue placeholder="Select a status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {TASK_STATUSES.map((status) => (
                              <SelectItem key={status} value={status}>
                                {status}
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
                    name="due_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Due Date</FormLabel>
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
                    name="client_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Client</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value !== null && field.value !== undefined ? String(field.value) : undefined}
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
                  <FormField
                    control={form.control}
                    name="assigned_to"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Assign To</FormLabel>
                        <Select
                          onValueChange={(value) => field.onChange(value === "unassigned" ? null : value)}
                          value={field.value || "unassigned"}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a team member" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="unassigned">Unassigned</SelectItem>
                            {members?.filter((m: any) => m.user_profiles).map((member: any) => (
                              <SelectItem
                                key={member.user_profiles.id}
                                value={member.user_profiles.id}
                              >
                                {member.user_profiles.full_name || member.user_profiles.email}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
                    {editingTask ? 'Update' : 'Create'} Task
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        )}
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <Search className="h-4 w-4 text-gray-500" />
        <Input
          placeholder="Search tasks..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Task List</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTasks?.map((task) => (
                <TableRow key={task.id}>
                  <TableCell>{task.title}</TableCell>
                  <TableCell>
                    <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                      ${task.status === 'Completed' ? 'bg-emerald-50/50 text-emerald-600' :
                        task.status === 'In Progress' ? 'bg-sky-50/50 text-sky-600' :
                          task.status === 'On Hold' ? 'bg-amber-50/50 text-amber-600' :
                            task.status === 'Cancelled' ? 'bg-slate-50/50 text-slate-500' :
                              'bg-slate-50/50 text-slate-500'}`}>
                      {task.status}
                    </div>
                  </TableCell>
                  <TableCell>
                    {format(new Date(task.due_date), 'MMM dd, yyyy')}
                  </TableCell>
                  <TableCell>{task.clients?.name}</TableCell>
                  <TableCell>
                    {task.user_profiles ? (
                      <div className="text-sm">
                        {task.user_profiles.full_name || task.user_profiles.email}
                      </div>
                    ) : (
                      <span className="text-gray-400 text-sm">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Actions <ChevronDown className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {hasPermission('tasks', 'update') && (
                          <DropdownMenuItem
                            onClick={(e) => { e.stopPropagation(); handleEdit(task); }}
                          >
                            <Pencil className="h-4 w-4 mr-2" /> Edit
                          </DropdownMenuItem>
                        )}
                        {hasPermission('tasks', 'delete') && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-600 focus:text-red-600"
                              onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(task.id.toString()); }}
                            >
                              <Trash className="h-4 w-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
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