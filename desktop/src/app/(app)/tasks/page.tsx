'use client';

import * as React from 'react';
import {
  Plus, Search, Filter, MoreHorizontal, Calendar, User, Flag, ArrowUpRight,
  ChevronDown, MessageSquare, Link2, Paperclip, CheckCircle2, AlertCircle,
  Briefcase, LifeBuoy, Settings as SettingsIcon, Clock, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { tasksApi, type Task } from '@/lib/api/tasks';
import { toast } from 'sonner';

const REF_DATE = Date.now();

function TaskCard({ task, onSelect, onStatusChange, onDelete, onDragStart }: {
  task: Task
  onSelect: (task: Task) => void
  onStatusChange: (status: string) => Promise<void>
  onDelete: () => Promise<void>
  onDragStart?: (e: React.DragEvent, task: Task) => void
}) {
  const priorityColors: Record<string, string> = {
    high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    low: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  };

  const statusMap: Record<string, 'todo' | 'in_progress' | 'completed'> = {
    'todo': 'todo',
    'in_progress': 'in_progress',
    'completed': 'completed',
    'pending': 'todo',
    'done': 'completed',
  };

  const dueDate = task.dueDate ? new Date(task.dueDate) : null;
  const isOverdue = dueDate && dueDate < new Date(REF_DATE) && task.status !== 'completed';
  const daysUntilDue = dueDate ? Math.ceil((dueDate.getTime() - REF_DATE) / (1000 * 60 * 60 * 24)) : null;

  const displayInitials = task.assignedTo?.substring(0, 2).toUpperCase() ?? '?';

  return (
    <Card
      className="hover:shadow-md transition-shadow group cursor-grab active:cursor-grabbing"
      draggable
      onDragStart={(e) => onDragStart?.(e, task)}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-sm flex-1">{task.title}</h3>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onSelect(task)}>View Details</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onStatusChange('completed')}>Mark Complete</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600" onClick={onDelete}>Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {task.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>
        )}

        {task.leadId && (
          <div className="flex items-center gap-1.5 text-xs">
            <Link2 className="h-3 w-3 text-muted-foreground" />
            <Badge variant="secondary" className="text-[10px]">Lead: {task.leadId}</Badge>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Avatar className="h-6 w-6">
              <AvatarFallback className="text-[9px]">{displayInitials}</AvatarFallback>
            </Avatar>
            <span className="text-xs font-medium">{task.assignedTo ?? 'Unassigned'}</span>
          </div>
          <Badge variant="outline" className={cn('text-[10px] font-medium border-transparent', priorityColors[task.priority])}>
            {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
          </Badge>
        </div>

        {dueDate && (
          <div className="flex items-center gap-2 text-xs">
            <Calendar className="h-3 w-3 text-muted-foreground" />
            <span className={cn(isOverdue ? 'text-red-600 font-semibold' : 'text-muted-foreground')}>
              {isOverdue && daysUntilDue ? `Overdue by ${Math.abs(daysUntilDue)} days` : daysUntilDue === 0 ? 'Today' : daysUntilDue ? `${daysUntilDue} days left` : dueDate.toLocaleDateString()}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function KanbanColumn({
  title,
  status,
  tasks,
  onTaskSelect,
  onStatusChange,
  onDelete,
  onDragStart,
  onDrop,
}: {
  title: string
  status: 'todo' | 'in_progress' | 'completed'
  tasks: Task[]
  onTaskSelect: (task: Task) => void
  onStatusChange: (task: Task, newStatus: string) => Promise<void>
  onDelete: (taskId: string) => Promise<void>
  onDragStart: (e: React.DragEvent, task: Task) => void
  onDrop: (status: string) => void
}) {
  const [dragOver, setDragOver] = React.useState(false);

  const statusMap: Record<string, string> = {
    'pending': 'todo',
    'todo': 'todo',
    'in_progress': 'in_progress',
    'completed': 'completed',
    'done': 'completed',
  };

  const columnTasks = tasks.filter((t: any) => statusMap[t.status ?? 'pending'] === status);

  return (
    <div
      className={cn(
        'flex flex-col flex-1 min-w-0 bg-muted/30 rounded-lg p-4 space-y-3 transition-colors',
        dragOver && 'bg-primary/10 ring-2 ring-primary/30',
      )}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); onDrop(status); }}
    >
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm">{title}</h2>
        <Badge variant="secondary" className="text-xs">{columnTasks.length ?? 0}</Badge>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto pr-2">
        {columnTasks && columnTasks.length > 0 ? (
          columnTasks.map((task: any) => (
            <TaskCard
              key={task.id}
              task={task}
              onSelect={onTaskSelect}
              onStatusChange={(newStatus) => onStatusChange(task, newStatus)}
              onDelete={() => onDelete(task.id)}
              onDragStart={onDragStart}
            />
          ))
        ) : (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            <p className="text-xs">No tasks</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Task Detail Panel ─── */
function TaskDetailPanel({ task, open, onOpenChange }: { task: Task | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const priorityColors: Record<string, string> = {
    high: 'text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-400',
    medium: 'text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400',
    low: 'text-blue-700 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400',
  };

  const statusLabels: Record<string, string> = {
    'pending': 'Pending',
    'todo': 'To Do',
    'in_progress': 'In Progress',
    'completed': 'Completed',
    'cancelled': 'Cancelled',
  };

  if (!task) return null;

  const dueDate = task.dueDate ? new Date(task.dueDate) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:w-96 overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-left">{task.title}</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Status */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Status</p>
            <Badge variant={task.status === 'completed' ? 'default' : task.status === 'in_progress' ? 'secondary' : 'outline'}>
              {statusLabels[task.status ?? 'pending']}
            </Badge>
          </div>

          {/* Priority */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Priority</p>
            <Badge className={cn('text-[10px]', priorityColors[task.priority as keyof typeof priorityColors])}>
              {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
            </Badge>
          </div>

          {/* Description */}
          {task.description && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Description</p>
              <p className="text-sm text-foreground">{task.description}</p>
            </div>
          )}

          {/* Due Date */}
          {dueDate && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Due Date</p>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>{dueDate.toLocaleDateString('en-IN')}</span>
              </div>
            </div>
          )}

          {/* Assignee */}
          {task.assignedTo && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Assigned To</p>
              <p className="text-sm">{task.assignedTo}</p>
            </div>
          )}

          {/* Linked Lead */}
          {task.leadId && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Linked Lead</p>
              <Badge variant="secondary" className="text-xs">{task.leadId}</Badge>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function TasksPage() {
  const [selectedAssignee, setSelectedAssignee] = React.useState<string>('all');
  const [selectedPriority, setSelectedPriority] = React.useState<string>('all');
  const [selectedStatus, setSelectedStatus] = React.useState<string>('all');
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  const [selectedTask, setSelectedTask] = React.useState<Task | null>(null);
  const [detailPanelOpen, setDetailPanelOpen] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [newTask, setNewTask] = React.useState({ title: '', description: '', priority: 'medium', dueDate: '' });

  const { data: response, loading, error, refetch } = useApiQuery(
    () => tasksApi.list({
      search: searchQuery || undefined,
      status: selectedStatus !== 'all' ? selectedStatus : undefined,
      priority: selectedPriority !== 'all' ? selectedPriority : undefined,
      assignedTo: selectedAssignee !== 'all' ? selectedAssignee : undefined,
    }),
    [searchQuery, selectedStatus, selectedPriority, selectedAssignee],
  );

  const updateStatusMutation = useApiMutation((input: { taskId: string; status: string }) =>
    tasksApi.updateStatus(input.taskId, { status: input.status as 'todo' | 'in_progress' | 'done' }),
  );

  const createMutation = useApiMutation((data: any) => tasksApi.create(data));
  const deleteMutation = useApiMutation((taskId: string) => tasksApi.delete(taskId));

  const rawTasks = response?.data?.data ?? response?.data ?? [];
  // Map backend snake_case fields to frontend camelCase
  const tasks: Task[] = (Array.isArray(rawTasks) ? rawTasks : []).map((t: any) => ({
    ...t,
    dueDate: t.dueDate || t.due_date,
    assignedTo: t.assignedTo || t.assignee_name || t.assigned_to,
    leadId: t.leadId || t.related_lead_id,
    createdBy: t.createdBy || t.created_by,
    createdAt: t.createdAt || t.created_at,
    updatedAt: t.updatedAt || t.updated_at,
    // Map backend 'done' to frontend 'completed'
    status: t.status === 'done' ? 'completed' : (t.status || 'todo'),
  }));

  const filteredTasks = React.useMemo(() => {
    return tasks;
  }, [tasks]);

  const uniqueAssignees = React.useMemo(() => {
    const assignees = new Set<string>();
    tasks.forEach((t) => {
      if (t.assignedTo) {
        assignees.add(t.assignedTo);
      }
    });
    return Array.from(assignees);
  }, [tasks]);

  const handleCreateTask = async () => {
    if (!newTask.title.trim()) {
      toast.error('Task title is required');
      return;
    }
    try {
      await createMutation.mutate({
        title: newTask.title,
        description: newTask.description || undefined,
        priority: newTask.priority,
        due_date: newTask.dueDate || undefined,
        status: 'todo',
      });
      toast.success('Task created');
      setCreateOpen(false);
      setNewTask({ title: '', description: '', priority: 'medium', dueDate: '' });
      await refetch();
    } catch {
      toast.error('Failed to create task');
    }
  };

  const handleTaskSelect = (task: Task) => {
    setSelectedTask(task);
    setDetailPanelOpen(true);
  };

  const handleStatusChange = async (task: Task, newStatus: string) => {
    // Map frontend 'completed' to backend 'done'
    const backendStatus = newStatus === 'completed' ? 'done' : newStatus;
    try {
      await updateStatusMutation.mutate({ taskId: task.id, status: backendStatus });
      toast.success('Task status updated');
      await refetch();
    } catch {
      toast.error('Failed to update task status');
    }
  };

  const handleDelete = async (taskId: string) => {
    try {
      await deleteMutation.mutate(taskId);
      toast.success('Task deleted');
      await refetch();
    } catch {
      toast.error('Failed to delete task');
    }
  };

  const draggedTaskRef = React.useRef<Task | null>(null);

  const handleDragStart = (_e: React.DragEvent, task: Task) => {
    draggedTaskRef.current = task;
  };

  const handleDrop = async (targetStatus: string) => {
    const task = draggedTaskRef.current;
    if (!task) return;
    draggedTaskRef.current = null;

    // Don't do anything if dropped on same column
    const currentMapped = (task.status as string) === 'done' ? 'completed' : task.status;
    if (currentMapped === targetStatus) return;

    await handleStatusChange(task, targetStatus);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Tasks</h1>
          <p className="text-sm text-muted-foreground">Manage team tasks and assignments</p>
        </div>
        <Button className="gap-1.5" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Add Task
        </Button>
      </div>

      {/* Filter Bar */}
      <div className="px-6 py-3 border-b bg-muted/30 space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 pl-10"
            />
          </div>
          <Filter className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={selectedAssignee} onValueChange={setSelectedAssignee}>
            <SelectTrigger className="w-40 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Assignees</SelectItem>
              {uniqueAssignees.map((assignee: any) => (
                <SelectItem key={assignee} value={assignee}>
                  {assignee}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedPriority} onValueChange={setSelectedPriority}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>

          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="todo">To Do</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
            <p className="text-muted-foreground">{error.message}</p>
            <Button size="sm" onClick={() => refetch()} className="mt-4">Retry</Button>
          </div>
        </div>
      )}

      {/* Kanban Board */}
      {!loading && !error && (
        <div className="flex-1 overflow-hidden p-6">
          <div className="flex gap-6 h-full overflow-x-auto">
            <KanbanColumn
              title="To Do"
              status="todo"
              tasks={filteredTasks}
              onTaskSelect={handleTaskSelect}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
              onDragStart={handleDragStart}
              onDrop={handleDrop}
            />
            <KanbanColumn
              title="In Progress"
              status="in_progress"
              tasks={filteredTasks}
              onTaskSelect={handleTaskSelect}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
              onDragStart={handleDragStart}
              onDrop={handleDrop}
            />
            <KanbanColumn
              title="Completed"
              status="completed"
              tasks={filteredTasks}
              onTaskSelect={handleTaskSelect}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
              onDragStart={handleDragStart}
              onDrop={handleDrop}
            />
          </div>
        </div>
      )}

      {/* Task Detail Panel */}
      <TaskDetailPanel task={selectedTask} open={detailPanelOpen} onOpenChange={setDetailPanelOpen} />

      {/* Create Task Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="taskTitle">Title <span className="text-destructive">*</span></Label>
              <Input id="taskTitle" placeholder="Enter task title" value={newTask.title} onChange={(e) => setNewTask((p) => ({ ...p, title: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="taskDesc">Description</Label>
              <Textarea id="taskDesc" placeholder="Task details..." value={newTask.description} onChange={(e) => setNewTask((p) => ({ ...p, description: e.target.value }))} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={newTask.priority} onValueChange={(v) => setNewTask((p) => ({ ...p, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="taskDue">Due Date</Label>
                <Input id="taskDue" type="date" value={newTask.dueDate} onChange={(e) => setNewTask((p) => ({ ...p, dueDate: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateTask} disabled={createMutation.loading}>
              {createMutation.loading && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Create Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
