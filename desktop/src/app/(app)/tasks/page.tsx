'use client';

import * as React from 'react';
import {
  Plus, Link2, Calendar, AlertCircle, Loader2, CheckSquare, Eye, Pencil,
  MoreHorizontal, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { FilterBar } from '@/components/domain/filter-bar';
import { Combobox } from '@/components/ui/combobox';
import { cn } from '@/lib/utils';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { tasksApi, type Task } from '@/lib/api/tasks';
import { usersApi } from '@/lib/api/users';
import { toast } from 'sonner';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

const REF_DATE = Date.now();

const CATEGORY_OPTIONS = [
  { value: 'general', label: 'General' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'documentation', label: 'Documentation' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'payment', label: 'Payment' },
  { value: 'visa', label: 'Visa' },
];

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  low: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
};

const STATUS_MAP: Record<string, string> = {
  todo: 'todo',
  in_progress: 'in_progress',
  done: 'done',
  // legacy aliases
  pending: 'todo',
  completed: 'done',
  cancelled: 'todo',
};

function normalizeTask(t: any): Task {
  return {
    ...t,
    dueDate: t.dueDate || t.due_date,
    due_date: t.due_date || t.dueDate,
    assignedTo: t.assignedTo || t.assigned_to,
    assignee_name: t.assignee_name,
    leadId: t.leadId || t.related_lead_id,
    lead_title: t.lead_title,
    related_lead_id: t.related_lead_id || t.leadId,
    createdBy: t.createdBy || t.created_by,
    createdAt: t.createdAt || t.created_at || '',
    updatedAt: t.updatedAt || t.updated_at || '',
    subtask_count: t.subtask_count ?? 0,
    completed_subtask_count: t.completed_subtask_count ?? 0,
    status: (STATUS_MAP[t.status ?? 'todo'] || 'todo') as Task['status'],
  };
}

/* ─── Kanban Card ─── */
function TaskCard({ task, onSelect, onStatusChange, onDelete, onDragStart }: {
  task: Task
  onSelect: (task: Task) => void
  onStatusChange: (status: string) => Promise<void>
  onDelete: () => Promise<void>
  onDragStart?: (e: React.DragEvent, task: Task) => void
}) {
  const dueDate = task.dueDate ? new Date(task.dueDate) : null;
  const isOverdue = dueDate && dueDate < new Date(REF_DATE) && task.status !== 'done';
  const daysUntilDue = dueDate ? Math.ceil((dueDate.getTime() - REF_DATE) / (1000 * 60 * 60 * 24)) : null;
  const assigneeName = task.assignee_name || task.assignedTo || 'Unassigned';
  const leadDisplay = task.lead_title || (task.leadId ? `Lead #${task.leadId.slice(0, 8)}` : null);
  const subtaskCount = task.subtask_count ?? 0;
  const completedSubtasks = task.completed_subtask_count ?? 0;

  return (
    <Card
      className={cn(
        'hover:shadow-md transition-shadow group cursor-grab active:cursor-grabbing',
        isOverdue && 'ring-2 ring-red-200 dark:ring-red-900/50 bg-red-50/30 dark:bg-red-950/10',
      )}
      draggable
      onDragStart={(e) => onDragStart?.(e, task)}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-sm flex-1 leading-snug">{task.title}</h3>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="opacity-0 group-hover:opacity-100 shrink-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onSelect(task)}>
                <Eye className="h-4 w-4 mr-2" /> View Details
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onStatusChange('done')}>
                <CheckSquare className="h-4 w-4 mr-2" /> Mark Complete
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600" onClick={onDelete}>Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {isOverdue && (
          <Badge variant="destructive" className="text-[9px] px-1.5 py-0">OVERDUE</Badge>
        )}

        {task.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>
        )}

        {task.category && task.category !== 'general' && (
          <Badge variant="outline" className="text-[10px] capitalize">{task.category.replace('_', ' ')}</Badge>
        )}

        {leadDisplay && (
          <Link
            href={`/leads/${task.leadId || task.related_lead_id}`}
            className="flex items-center gap-1.5 text-xs text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            <Link2 className="h-3 w-3" />
            {leadDisplay}
          </Link>
        )}

        {subtaskCount > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckSquare className="h-3 w-3" />
            <span>{completedSubtasks}/{subtaskCount} subtasks</span>
            <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full"
                style={{ width: `${subtaskCount > 0 ? (completedSubtasks / subtaskCount) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Avatar className="h-6 w-6">
              <AvatarFallback className="text-[9px]">
                {assigneeName.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs text-muted-foreground truncate max-w-[80px]">{assigneeName}</span>
          </div>
          <Badge variant="outline" className={cn('text-[10px] font-medium border-transparent', PRIORITY_COLORS[task.priority])}>
            {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
          </Badge>
        </div>

        {dueDate && (
          <div className="flex items-center gap-1.5 text-xs">
            <Calendar className="h-3 w-3 text-muted-foreground" />
            <span className={cn(isOverdue ? 'text-red-600 font-semibold' : 'text-muted-foreground')}>
              {isOverdue && daysUntilDue != null
                ? `Overdue by ${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) === 1 ? '' : 's'}`
                : daysUntilDue === 0 ? 'Today'
                : daysUntilDue != null && daysUntilDue > 0 ? `${daysUntilDue} days left`
                : dueDate.toLocaleDateString()}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Kanban Column ─── */
function KanbanColumn({
  title, status, tasks, onTaskSelect, onStatusChange, onDelete, onDragStart, onDrop,
}: {
  title: string
  status: 'todo' | 'in_progress' | 'done'
  tasks: Task[]
  onTaskSelect: (task: Task) => void
  onStatusChange: (task: Task, newStatus: string) => Promise<void>
  onDelete: (taskId: string) => Promise<void>
  onDragStart: (e: React.DragEvent, task: Task) => void
  onDrop: (status: string) => void
}) {
  const [dragOver, setDragOver] = React.useState(false);
  const columnTasks = tasks.filter((t) => t.status === status);

  return (
    <div
      className={cn(
        'flex flex-col flex-1 min-w-0 bg-muted/30 rounded-lg p-4 space-y-3 transition-colors min-w-[280px]',
        dragOver && 'bg-primary/10 ring-2 ring-primary/30',
      )}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); onDrop(status); }}
    >
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm">{title}</h2>
        <Badge variant="secondary" className="text-xs">{columnTasks.length}</Badge>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {columnTasks.length > 0 ? (
          columnTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onSelect={onTaskSelect}
              onStatusChange={(s) => onStatusChange(task, s)}
              onDelete={() => onDelete(task.id)}
              onDragStart={onDragStart}
            />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground">
            <CheckSquare className="h-8 w-8 opacity-30" />
            <p className="text-xs">No tasks here</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Task Detail Panel ─── */
function TaskDetailPanel({ task, open, onOpenChange, onRefetch }: {
  task: Task | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onRefetch: () => void
}) {
  const STATUS_LABELS: Record<string, string> = {
    todo: 'To Do',
    in_progress: 'In Progress',
    done: 'Done',
  };

  const updateStatusMutation = useApiMutation((s: string) =>
    tasksApi.updateStatus(task!.id, { status: s as 'todo' | 'in_progress' | 'done' }),
  );

  const deleteMutation = useApiMutation(() => tasksApi.delete(task!.id));

  if (!task) return null;

  const dueDate = task.dueDate ? new Date(task.dueDate) : null;
  const leadDisplay = task.lead_title || (task.leadId ? `Lead #${task.leadId.slice(0, 8)}` : null);
  const assigneeName = task.assignee_name || task.assignedTo || 'Unassigned';

  const handleStatusChange = async (newStatus: string) => {
    try {
      await updateStatusMutation.mutate(newStatus);
      toast.success('Status updated');
      onRefetch();
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutate(undefined);
      toast.success('Task deleted');
      onOpenChange(false);
      onRefetch();
    } catch {
      toast.error('Failed to delete task');
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:w-[420px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-left pr-4">{task.title}</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {/* Actions */}
          <div className="flex gap-2">
            <Select value={task.status} onValueChange={handleStatusChange}>
              <SelectTrigger className="h-8 text-xs flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todo">To Do</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="done">Done</SelectItem>
              </SelectContent>
            </Select>
            <Link href={`/tasks/${task.id}`}>
              <Button variant="outline" size="sm" className="h-8">
                <Eye className="h-3.5 w-3.5 mr-1" /> Full View
              </Button>
            </Link>
            <Button variant="destructive" size="sm" className="h-8" onClick={handleDelete} disabled={deleteMutation.loading}>
              Delete
            </Button>
          </div>

          {/* Status */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Status</p>
            <Badge variant={task.status === 'done' ? 'default' : task.status === 'in_progress' ? 'secondary' : 'outline'}>
              {STATUS_LABELS[task.status] ?? task.status}
            </Badge>
          </div>

          {/* Priority */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Priority</p>
            <Badge className={cn('text-[10px]', PRIORITY_COLORS[task.priority])}>
              {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
            </Badge>
          </div>

          {/* Category */}
          {task.category && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Category</p>
              <p className="text-sm capitalize">{task.category.replace('_', ' ')}</p>
            </div>
          )}

          {/* Description */}
          {task.description && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Description</p>
              <p className="text-sm">{task.description}</p>
            </div>
          )}

          {/* Due Date */}
          {dueDate && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Due Date</p>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>{dueDate.toLocaleDateString('en-IN')}</span>
              </div>
            </div>
          )}

          {/* Assignee */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Assigned To</p>
            <div className="flex items-center gap-2">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="text-xs">{assigneeName.substring(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <span className="text-sm">{assigneeName}</span>
            </div>
          </div>

          {/* Linked Lead */}
          {leadDisplay && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Linked Lead</p>
              <Link
                href={`/leads/${task.leadId || task.related_lead_id}`}
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                <Link2 className="h-3.5 w-3.5" />
                {leadDisplay}
              </Link>
            </div>
          )}

          {/* Subtasks progress */}
          {(task.subtask_count ?? 0) > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Subtasks</p>
              <div className="flex items-center gap-2 text-sm">
                <span>{task.completed_subtask_count}/{task.subtask_count} completed</span>
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: `${((task.completed_subtask_count ?? 0) / (task.subtask_count ?? 1)) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ─── Skeleton Cards ─── */
function KanbanSkeleton() {
  return (
    <div className="flex gap-6 h-full overflow-x-auto p-6">
      {['todo', 'in_progress', 'done'].map((col) => (
        <div key={col} className="flex flex-col flex-1 min-w-[280px] bg-muted/30 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-5 w-8 rounded-full" />
          </div>
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg border bg-card p-4 space-y-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <div className="flex items-center justify-between">
                <Skeleton className="h-6 w-6 rounded-full" />
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ─── Main Page ─── */
export default function TasksPage() {
  const searchParams = useSearchParams();
  const prefillLeadId = searchParams.get('leadId');
  const prefillLeadTitle = searchParams.get('leadTitle');

  const [filterSearch, setFilterSearch] = React.useState('');
  const [filterStatus, setFilterStatus] = React.useState('all');
  const [filterPriority, setFilterPriority] = React.useState('all');
  const [viewMode, setViewMode] = React.useState<'all' | 'my'>('my');
  const [selectedTask, setSelectedTask] = React.useState<Task | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);

  // Create form state
  const [newTask, setNewTask] = React.useState({
    title: '',
    description: '',
    priority: 'medium',
    category: 'general',
    dueDate: '',
    assignedTo: '',
    leadId: prefillLeadId || '',
    leadTitle: prefillLeadTitle || '',
  });

  // Users for assignee combobox
  const { data: usersResp } = useApiQuery(
    () => usersApi.list({ limit: 100 }),
    [],
  );
  const users = React.useMemo(() => {
    const raw = (usersResp as any)?.data?.data ?? (usersResp as any)?.data ?? [];
    return Array.isArray(raw) ? raw : [];
  }, [usersResp]);
  const userOptions = users.map((u: any) => ({ value: u.id, label: u.name || u.email }));

  // Leads for lead combobox
  const [leadSearch, setLeadSearch] = React.useState('');
  const { data: leadsResp } = useApiQuery(
    () => import('@/lib/api/leads').then((m) => m.leadsApi.list({ search: leadSearch || undefined, limit: 30 })),
    [leadSearch],
  );
  const leads = React.useMemo(() => {
    const raw = (leadsResp as any)?.data?.data ?? (leadsResp as any)?.data ?? [];
    return Array.isArray(raw) ? raw : [];
  }, [leadsResp]);
  const leadOptions = leads.map((l: any) => ({ value: l.id, label: l.title || l.name || l.id }));

  // Stable fetcher — only changes when filters actually change
  const taskFetcher = React.useCallback(
    (page: number, limit: number) => tasksApi.list({
      page,
      limit,
      search: filterSearch || undefined,
      status: filterStatus !== 'all' ? filterStatus : undefined,
      priority: filterPriority !== 'all' ? filterPriority : undefined,
      view: viewMode === 'my' ? 'my' : 'all',
    }),
    [filterSearch, filterStatus, filterPriority, viewMode],
  );

  // Infinite scroll for tasks
  const { items: tasks, loading, error, sentinelRef, refetch, total } = useInfiniteScroll<Task>({
    fetcher: taskFetcher,
  });

  const normalizedTasks = React.useMemo(() => tasks.map(normalizeTask), [tasks]);

  const createMutation = useApiMutation((data: any) => tasksApi.create(data));
  const updateStatusMutation = useApiMutation((input: { taskId: string; status: string }) =>
    tasksApi.updateStatus(input.taskId, { status: input.status as 'todo' | 'in_progress' | 'done' }),
  );
  const deleteMutation = useApiMutation((taskId: string) => tasksApi.delete(taskId));
  const draggedTaskRef = React.useRef<Task | null>(null);

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
        category: newTask.category,
        due_date: newTask.dueDate || undefined,
        assigned_to: newTask.assignedTo || undefined,
        related_lead_id: newTask.leadId || undefined,
        status: 'todo',
      });
      toast.success('Task created');
      setCreateOpen(false);
      setNewTask({ title: '', description: '', priority: 'medium', category: 'general', dueDate: '', assignedTo: '', leadId: '', leadTitle: '' });
      refetch();
    } catch {
      toast.error('Failed to create task');
    }
  };

  const handleStatusChange = async (task: Task, newStatus: string) => {
    try {
      await updateStatusMutation.mutate({ taskId: task.id, status: newStatus });
      toast.success('Status updated');
      refetch();
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleDelete = async (taskId: string) => {
    try {
      await deleteMutation.mutate(taskId);
      toast.success('Task deleted');
      refetch();
    } catch {
      toast.error('Failed to delete task');
    }
  };

  const handleDragStart = (_e: React.DragEvent, task: Task) => {
    draggedTaskRef.current = task;
  };

  const handleDrop = async (targetStatus: string) => {
    const task = draggedTaskRef.current;
    if (!task) return;
    draggedTaskRef.current = null;
    if (task.status === targetStatus) return;
    await handleStatusChange(task, targetStatus);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            Tasks {!loading && <span className="text-muted-foreground font-normal text-base">({total})</span>}
          </h1>
          <p className="text-sm text-muted-foreground">Manage team tasks and assignments</p>
        </div>
        <div className="flex items-center gap-2">
          {/* My Tasks / All Tasks toggle */}
          <div className="flex rounded-md border overflow-hidden text-xs font-medium">
            <button
              className={cn('px-3 py-1.5 transition-colors', viewMode === 'my' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
              onClick={() => setViewMode('my')}
            >
              My Tasks
            </button>
            <button
              className={cn('px-3 py-1.5 transition-colors', viewMode === 'all' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
              onClick={() => setViewMode('all')}
            >
              All Tasks
            </button>
          </div>
          <Button className="gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Task
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="px-6 py-3 border-b bg-muted/30 space-y-2">
        <FilterBar
          searchValue={filterSearch}
          onSearchChange={setFilterSearch}
          searchPlaceholder="Search tasks..."
          activeFilters={[
            ...(filterStatus !== 'all' ? [{ id: 'status', label: 'Status', value: filterStatus }] : []),
            ...(filterPriority !== 'all' ? [{ id: 'priority', label: 'Priority', value: filterPriority }] : []),
          ]}
          onRemoveFilter={(filterId) => {
            if (filterId === 'status') setFilterStatus('all');
            if (filterId === 'priority') setFilterPriority('all');
          }}
          onClearFilters={() => { setFilterStatus('all'); setFilterPriority('all'); }}
        />
        <div className="flex gap-2 flex-wrap">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="todo">To Do</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="done">Done</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterPriority} onValueChange={setFilterPriority}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Error */}
      {error && !loading && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
            <p className="text-muted-foreground">{error.message}</p>
            <Button size="sm" onClick={() => refetch()} className="mt-4">Retry</Button>
          </div>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && <KanbanSkeleton />}

      {/* Kanban Board */}
      {!loading && !error && (
        <div className="flex-1 overflow-hidden">
          <div className="flex gap-6 h-full overflow-x-auto p-6">
            <KanbanColumn
              title="To Do"
              status="todo"
              tasks={normalizedTasks}
              onTaskSelect={(t) => { setSelectedTask(t); setDetailOpen(true); }}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
              onDragStart={handleDragStart}
              onDrop={handleDrop}
            />
            <KanbanColumn
              title="In Progress"
              status="in_progress"
              tasks={normalizedTasks}
              onTaskSelect={(t) => { setSelectedTask(t); setDetailOpen(true); }}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
              onDragStart={handleDragStart}
              onDrop={handleDrop}
            />
            <KanbanColumn
              title="Done"
              status="done"
              tasks={normalizedTasks}
              onTaskSelect={(t) => { setSelectedTask(t); setDetailOpen(true); }}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
              onDragStart={handleDragStart}
              onDrop={handleDrop}
            />
          </div>
          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-1" />
        </div>
      )}

      {/* Task Detail Panel */}
      <TaskDetailPanel
        task={selectedTask}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onRefetch={refetch}
      />

      {/* Create Task Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="taskTitle">Title <span className="text-destructive">*</span></Label>
              <Input
                id="taskTitle"
                placeholder="Enter task title"
                value={newTask.title}
                onChange={(e) => setNewTask((p) => ({ ...p, title: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="taskDesc">Description</Label>
              <Textarea
                id="taskDesc"
                placeholder="Task details..."
                value={newTask.description}
                onChange={(e) => setNewTask((p) => ({ ...p, description: e.target.value }))}
                rows={3}
              />
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
                <Label>Category</Label>
                <Select value={newTask.category} onValueChange={(v) => setNewTask((p) => ({ ...p, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Assign To</Label>
              <Combobox
                options={userOptions}
                value={newTask.assignedTo}
                onValueChange={(v) => setNewTask((p) => ({ ...p, assignedTo: v }))}
                placeholder="Search team members..."
                searchPlaceholder="Search by name..."
              />
            </div>

            <div className="space-y-2">
              <Label>Linked Lead</Label>
              <Combobox
                options={[
                  ...(newTask.leadId && newTask.leadTitle ? [{ value: newTask.leadId, label: newTask.leadTitle }] : []),
                  ...leadOptions.filter((o: any) => o.value !== newTask.leadId),
                ]}
                value={newTask.leadId}
                onValueChange={(v) => {
                  const lead = leads.find((l: any) => l.id === v);
                  setNewTask((p) => ({ ...p, leadId: v, leadTitle: lead?.title || lead?.name || '' }));
                }}
                onSearch={setLeadSearch}
                placeholder="Search leads..."
                searchPlaceholder="Search by lead title..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="taskDue">Due Date</Label>
              <Input
                id="taskDue"
                type="date"
                value={newTask.dueDate}
                onChange={(e) => setNewTask((p) => ({ ...p, dueDate: e.target.value }))}
              />
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
