'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Plus, Link2, Calendar, CheckSquare, Eye, Pencil, Trash2,
  LayoutGrid, List as ListIcon, Loader2,
} from 'lucide-react';
import { ListPage, RelationCombobox } from '@/components/domain';
import { KanbanBoard } from '@/components/domain/kanban-board';
import { Button } from '@/components/ui/button';
import { Tag } from '@/components/ui/tag';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import type { DataTableColumn } from '@/components/ui/data-table';
import { cn } from '@/lib/utils';
import { useApiMutation } from '@/hooks/use-api';
import { tasksApi, type Task } from '@/lib/api/tasks';
import { usersApi } from '@/lib/api/users';
import { leadsApi } from '@/lib/api/leads';
import { toast } from 'sonner';
import Link from 'next/link';

const CATEGORY_OPTIONS = [
  { value: 'general', label: 'General' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'documentation', label: 'Documentation' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'payment', label: 'Payment' },
  { value: 'visa', label: 'Visa' },
];

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-ds-danger-subtle text-ds-danger-on-subtle',
  medium: 'bg-ds-warning-subtle text-ds-warning-on-subtle',
  low: 'bg-ds-info-subtle text-ds-info-on-subtle',
};

const STATUS_LABELS: Record<string, string> = { todo: 'To Do', in_progress: 'In Progress', done: 'Done' };
const STATUS_MAP: Record<string, string> = {
  todo: 'todo', in_progress: 'in_progress', done: 'done',
  pending: 'todo', completed: 'done', cancelled: 'todo',
};

/** The tasks client already returns camelCase rows; only the legacy status names need mapping. */
function normalizeTask(t: Task): Task {
  return {
    ...t,
    status: (STATUS_MAP[t.status ?? 'todo'] || 'todo') as Task['status'],
  };
}

function TaskCard({ task, onSelect, onDragStart }: {
  task: Task;
  onSelect: (task: Task) => void;
  onDragStart: (e: React.DragEvent, task: Task) => void;
}) {
  const dueDate = task.dueDate ? new Date(task.dueDate) : null;
  const isOverdue = !!dueDate && dueDate < new Date() && task.status !== 'done';
  const assigneeName = task.assigneeName || 'Unassigned';
  const leadDisplay = task.leadTitle || null;
  const subtaskCount = task.subtaskCount ?? 0;
  const completedSubtasks = task.completedSubtaskCount ?? 0;

  return (
    <Card
      className={cn(
        'cursor-grab transition-shadow hover:shadow-ds-2 active:cursor-grabbing',
        isOverdue && 'ring-2 ring-ds-danger',
      )}
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      onClick={() => onSelect(task)}
    >
      <CardContent className="space-y-ds-2 p-ds-4">
        <div className="flex items-start justify-between gap-ds-2">
          <h3 className="flex-1 text-sm font-semibold leading-snug">{task.title}</h3>
          {isOverdue && <Tag tone="danger">Overdue</Tag>}
        </div>

        {task.description && (
          <p className="line-clamp-2 text-xs text-ds-foreground-muted">{task.description}</p>
        )}

        {leadDisplay && (
          <Link
            href={`/leads/${task.leadId}`}
            className="flex items-center gap-ds-1 text-xs text-ds-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            <Link2 className="size-3" />
            {leadDisplay}
          </Link>
        )}

        {subtaskCount > 0 && (
          <div className="flex items-center gap-ds-2 text-xs text-ds-foreground-muted">
            <CheckSquare className="size-3" />
            <span>{completedSubtasks}/{subtaskCount} subtasks</span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-ds-2">
            <Avatar className="size-6">
              <AvatarFallback className="text-[9px]">{assigneeName.substring(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <span className="max-w-[80px] truncate text-xs text-ds-foreground-muted">{assigneeName}</span>
          </div>
          <span className={cn('rounded-ds-sm px-ds-2 py-0.5 text-[10px] font-medium', PRIORITY_COLORS[task.priority])}>
            {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
          </span>
        </div>

        {dueDate && (
          <div className="flex items-center gap-ds-1 text-xs">
            <Calendar className="size-3 text-ds-foreground-muted" />
            <span className={cn(isOverdue ? 'font-semibold text-ds-danger' : 'text-ds-foreground-muted')}>
              {dueDate.toLocaleDateString()}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function KanbanSkeleton() {
  return (
    <div className="flex gap-ds-4 overflow-x-auto">
      {['todo', 'in_progress', 'done'].map((col) => (
        <div key={col} className="w-80 shrink-0 space-y-ds-3 rounded-ds-md border border-dashed border-ds-border bg-ds-surface-sunken p-ds-3">
          <Skeleton className="h-4 w-20" />
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full rounded-ds-md" />)}
        </div>
      ))}
    </div>
  );
}

export default function TasksPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillLeadId = searchParams.get('leadId');
  const prefillLeadTitle = searchParams.get('leadTitle');

  const [layoutView, setLayoutView] = React.useState<'kanban' | 'table'>('table');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [priorityFilter, setPriorityFilter] = React.useState('all');
  const [createOpen, setCreateOpen] = React.useState(false);
  const [kanbanTasks, setKanbanTasks] = React.useState<Task[]>([]);
  const [kanbanLoading, setKanbanLoading] = React.useState(true);
  const [listKey, setListKey] = React.useState(0);
  const draggedTaskRef = React.useRef<Task | null>(null);

  const [newTask, setNewTask] = React.useState({
    title: '',
    description: '',
    priority: 'medium',
    category: 'general',
    dueDate: undefined as Date | undefined,
    assignedTo: '',
    leadId: prefillLeadId || '',
    leadTitle: prefillLeadTitle || '',
  });

  const createMutation = useApiMutation((data: any) => tasksApi.create(data));
  const updateStatusMutation = useApiMutation((input: { taskId: string; status: string }) =>
    tasksApi.updateStatus(input.taskId, { status: input.status as 'todo' | 'in_progress' | 'done' }),
  );
  const deleteMutation = useApiMutation((taskId: string) => tasksApi.delete(taskId));

  const loadKanban = React.useCallback(async () => {
    setKanbanLoading(true);
    try {
      // The board shows every task, so walk all pages (capped) rather than truncating at one page.
      const all: any[] = [];
      for (let pageNum = 1; pageNum <= 10; pageNum++) {
        const res = (await tasksApi.list({ page: pageNum, limit: 200, view: 'all' })) as any;
        const raw = res?.data?.data ?? res?.data ?? [];
        const items = Array.isArray(raw) ? raw : [];
        all.push(...items);
        const total = res?.pagination?.total ?? res?.data?.pagination?.total ?? 0;
        if (items.length === 0 || all.length >= total) break;
      }
      setKanbanTasks(all.map(normalizeTask));
    } catch {
      toast.error('Failed to load tasks');
    } finally {
      setKanbanLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (layoutView === 'kanban') void loadKanban();
  }, [layoutView, loadKanban]);

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
        dueDate: newTask.dueDate ? newTask.dueDate.toISOString() : undefined,
        assignedTo: newTask.assignedTo || undefined,
        relatedLeadId: newTask.leadId || undefined,
        status: 'todo',
      });
      toast.success('Task created');
      setCreateOpen(false);
      setNewTask({ title: '', description: '', priority: 'medium', category: 'general', dueDate: undefined, assignedTo: '', leadId: '', leadTitle: '' });
      setListKey((k) => k + 1);
      if (layoutView === 'kanban') void loadKanban();
    } catch {
      toast.error('Failed to create task');
    }
  };

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    try {
      await updateStatusMutation.mutate({ taskId, status: newStatus });
      toast.success('Status updated');
      setListKey((k) => k + 1);
      if (layoutView === 'kanban') void loadKanban();
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleDelete = async (taskId: string) => {
    try {
      await deleteMutation.mutate(taskId);
      toast.success('Task deleted');
      setListKey((k) => k + 1);
      if (layoutView === 'kanban') void loadKanban();
    } catch {
      toast.error('Failed to delete task');
    }
  };

  const handleDragStart = (_e: React.DragEvent, task: Task) => {
    draggedTaskRef.current = task;
  };

  const handleDrop = async (status: string) => {
    const task = draggedTaskRef.current;
    draggedTaskRef.current = null;
    if (!task || task.status === status) return;
    setKanbanTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: status as Task['status'] } : t)));
    await handleStatusChange(task.id, status);
  };

  const columns: DataTableColumn<Task>[] = [
    { key: 'title', header: 'Title', sortable: true,
      cell: (t) => (
        <div className="flex min-w-0 items-center gap-ds-2">
          <span className="max-w-[280px] truncate text-sm font-medium">{t.title}</span>
          {(t.subtaskCount ?? 0) > 0 && (
            <span className="shrink-0 text-[10px] text-ds-foreground-muted">
              {t.completedSubtaskCount}/{t.subtaskCount}
            </span>
          )}
        </div>
      ) },
    { key: 'status', header: 'Status', sortable: true,
      cell: (t) => (
        <Tag tone={t.status === 'done' ? 'success' : t.status === 'in_progress' ? 'info' : 'neutral'}>
          {STATUS_LABELS[t.status]}
        </Tag>
      ) },
    { key: 'priority', header: 'Priority', sortable: true,
      cell: (t) => (
        <span className={cn('rounded-ds-sm px-ds-2 py-0.5 text-[10px] font-medium', PRIORITY_COLORS[t.priority])}>
          {t.priority.charAt(0).toUpperCase() + t.priority.slice(1)}
        </span>
      ) },
    { key: 'dueDate', header: 'Due Date', sortable: true,
      cell: (t) => {
        const dueDate = t.dueDate ? new Date(t.dueDate) : null;
        const isOverdue = !!dueDate && dueDate < new Date() && t.status !== 'done';
        return dueDate ? (
          <span className={cn('text-sm', isOverdue ? 'font-semibold text-ds-danger' : 'text-ds-foreground-muted')}>
            {dueDate.toLocaleDateString()}
          </span>
        ) : <span className="text-sm text-ds-foreground-muted">--</span>;
      } },
    { key: 'assignee', header: 'Assignee',
      cell: (t) => (
        <div className="flex items-center gap-ds-2">
          <Avatar className="size-6">
            <AvatarFallback className="text-[9px]">
              {(t.assigneeName || 'U').substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="max-w-[120px] truncate text-sm">{t.assigneeName || 'Unassigned'}</span>
        </div>
      ) },
    { key: 'category', header: 'Category', hideable: true,
      cell: (t) => t.category
        ? <Tag tone="neutral">{t.category.replace('_', ' ')}</Tag>
        : <span className="text-sm text-ds-foreground-muted">--</span> },
  ];

  return (
    <div className="flex flex-col gap-ds-4">
      <div className="flex items-center justify-end gap-ds-2">
        <div className="flex items-center gap-ds-1 rounded-ds-md border border-ds-border p-0.5">
          <Button variant={layoutView === 'table' ? 'secondary' : 'ghost'} size="icon-sm" onClick={() => setLayoutView('table')} aria-label="Table view">
            <ListIcon className="size-4" />
          </Button>
          <Button variant={layoutView === 'kanban' ? 'secondary' : 'ghost'} size="icon-sm" onClick={() => setLayoutView('kanban')} aria-label="Kanban view">
            <LayoutGrid className="size-4" />
          </Button>
        </div>
      </div>

      {layoutView === 'table' ? (
        <ListPage<Task>
          key={listKey}
          title="Tasks"
          description="Manage team tasks and assignments."
          getRowId={(t) => t.id}
          fetcher={({ page, limit, search, filters }) => {
            const status = filters.find((f) => f.id === 'status')?.value;
            const priority = filters.find((f) => f.id === 'priority')?.value;
            return tasksApi.list({ page, limit, search, status, priority, view: 'all' });
          }}
          extractItems={(r: any) => (r?.data?.data ?? r?.data ?? []).map(normalizeTask)}
          extractTotal={(r: any) => r?.pagination?.total ?? r?.data?.pagination?.total ?? 0}
          columns={columns}
          primaryAction={
            <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-ds-2">
              <Plus aria-hidden="true" /> Add task
            </Button>
          }
          searchPlaceholder="Search tasks…"
          filters={[
            ...(statusFilter !== 'all' ? [{ id: 'status', label: 'Status', value: statusFilter }] : []),
            ...(priorityFilter !== 'all' ? [{ id: 'priority', label: 'Priority', value: priorityFilter }] : []),
          ]}
          onRemoveFilter={(id) => {
            if (id === 'status') setStatusFilter('all');
            if (id === 'priority') setPriorityFilter('all');
          }}
          onClearFilters={() => { setStatusFilter('all'); setPriorityFilter('all'); }}
          headerActions={
            <div className="flex gap-ds-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="todo">To Do</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                </SelectContent>
              </Select>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          }
          rowActions={(t) => (
            <>
              <Button variant="ghost" size="icon-sm" aria-label="View" onClick={() => router.push(`/tasks/${t.id}`)}>
                <Eye />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => router.push(`/tasks/${t.id}`)}>
                <Pencil />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={() => handleDelete(t.id)}>
                <Trash2 />
              </Button>
            </>
          )}
          onRowClick={(t) => router.push(`/tasks/${t.id}`)}
          bulkActions={[{
            label: 'Delete', destructive: true,
            onSelect: (rows) => Promise.all(rows.map((r) => tasksApi.delete(r.id))).then(() => { setListKey((k) => k + 1); toast.success('Tasks deleted'); }),
          }, {
            label: 'Mark complete',
            onSelect: (rows) => Promise.all(rows.map((r) => tasksApi.updateStatus(r.id, { status: 'done' }))).then(() => { setListKey((k) => k + 1); toast.success('Tasks marked complete'); }),
          }]}
          onExport={async (rows) => {
            const header = ['Title', 'Status', 'Priority', 'Due Date', 'Assignee', 'Category'];
            const lines = rows.map((t) => [
              t.title, STATUS_LABELS[t.status], t.priority,
              t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '',
              t.assigneeName || '', t.category || '',
            ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
            const csv = [header.join(','), ...lines].join('\n');
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'tasks.csv'; a.click();
            URL.revokeObjectURL(url);
          }}
          emptyTitle="No tasks yet"
          emptyDescription="Create your first task to start tracking work."
        />
      ) : (
        <div className="flex flex-col gap-ds-4">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold text-ds-foreground">Tasks</h1>
            <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-ds-2">
              <Plus aria-hidden="true" /> Add task
            </Button>
          </div>
          {kanbanLoading ? (
            <KanbanSkeleton />
          ) : (
            <KanbanBoard
              columns={[
                { id: 'todo', title: 'To Do', color: 'var(--ds-color-foreground-muted)', count: kanbanTasks.filter((t) => t.status === 'todo').length,
                  children: (
                    <div className="min-h-32 space-y-ds-3" onDragOver={(e) => e.preventDefault()} onDrop={() => handleDrop('todo')}>
                      {kanbanTasks.filter((t) => t.status === 'todo').map((t) => (
                        <TaskCard key={t.id} task={t} onSelect={(task) => router.push(`/tasks/${task.id}`)} onDragStart={handleDragStart} />
                      ))}
                    </div>
                  ) },
                { id: 'in_progress', title: 'In Progress', color: 'var(--ds-color-info)', count: kanbanTasks.filter((t) => t.status === 'in_progress').length,
                  children: (
                    <div className="min-h-32 space-y-ds-3" onDragOver={(e) => e.preventDefault()} onDrop={() => handleDrop('in_progress')}>
                      {kanbanTasks.filter((t) => t.status === 'in_progress').map((t) => (
                        <TaskCard key={t.id} task={t} onSelect={(task) => router.push(`/tasks/${task.id}`)} onDragStart={handleDragStart} />
                      ))}
                    </div>
                  ) },
                { id: 'done', title: 'Done', color: 'var(--ds-color-success)', count: kanbanTasks.filter((t) => t.status === 'done').length,
                  children: (
                    <div className="min-h-32 space-y-ds-3" onDragOver={(e) => e.preventDefault()} onDrop={() => handleDrop('done')}>
                      {kanbanTasks.filter((t) => t.status === 'done').map((t) => (
                        <TaskCard key={t.id} task={t} onSelect={(task) => router.push(`/tasks/${task.id}`)} onDragStart={handleDragStart} />
                      ))}
                    </div>
                  ) },
              ]}
            />
          )}
        </div>
      )}

      {/* Create Task Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create task</DialogTitle>
          </DialogHeader>
          <div className="space-y-ds-4">
            <div className="space-y-ds-1">
              <Label htmlFor="taskTitle">Title <span className="text-ds-danger">*</span></Label>
              <Input
                id="taskTitle"
                placeholder="Enter task title"
                value={newTask.title}
                onChange={(e) => setNewTask((p) => ({ ...p, title: e.target.value }))}
              />
            </div>
            <div className="space-y-ds-1">
              <Label htmlFor="taskDesc">Description</Label>
              <Textarea
                id="taskDesc"
                placeholder="Task details..."
                value={newTask.description}
                onChange={(e) => setNewTask((p) => ({ ...p, description: e.target.value }))}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-ds-4">
              <div className="space-y-ds-1">
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
              <div className="space-y-ds-1">
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

            <div className="space-y-ds-1">
              <Label>Assign to</Label>
              <RelationCombobox
                value={newTask.assignedTo || null}
                onChange={(id) => setNewTask((p) => ({ ...p, assignedTo: id ?? '' }))}
                fetcher={async (q, page) => {
                  const r = await usersApi.list({ search: q, page, limit: 20 });
                  const body = r as any;
                  const items = Array.isArray(body?.data) ? body.data : (body?.data?.data ?? []);
                  return { items, total: body?.pagination?.total ?? body?.data?.pagination?.total ?? items.length };
                }}
                getOptionId={(u: any) => u.id}
                getOptionLabel={(u: any) => u.name || u.email}
                getOptionDescription={(u: any) => u.email}
                resolveSelected={async (id) => (await usersApi.getById(id)).data as any}
                placeholder="Search team members…"
              />
            </div>

            <div className="space-y-ds-1">
              <Label>Linked lead</Label>
              <RelationCombobox
                value={newTask.leadId || null}
                onChange={(id, item: any) => setNewTask((p) => ({ ...p, leadId: id ?? '', leadTitle: item?.title || item?.name || '' }))}
                fetcher={async (q, page) => {
                  const r = await leadsApi.list({ search: q, page, limit: 20 } as any);
                  const body = r as any;
                  const items = Array.isArray(body?.data) ? body.data : (body?.data?.data ?? []);
                  return { items, total: body?.pagination?.total ?? body?.data?.pagination?.total ?? items.length };
                }}
                getOptionId={(l: any) => l.id}
                getOptionLabel={(l: any) => l.title || l.name || l.id}
                resolveSelected={async (id) => (await leadsApi.getById(id)).data as any}
                placeholder="Search leads…"
              />
            </div>

            <div className="space-y-ds-1">
              <Label>Due date</Label>
              <DatePicker
                value={newTask.dueDate}
                onChange={(d) => setNewTask((p) => ({ ...p, dueDate: d }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateTask} disabled={createMutation.loading}>
              {createMutation.loading && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              Create task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
