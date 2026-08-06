'use client';

import * as React from 'react';
import { use } from 'react';
import {
  ArrowLeft, Calendar, CheckSquare, Flag, Link2, MessageSquare,
  Send, Loader2, Trash2, Plus, AlertCircle, User,
  Activity, Edit,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { tasksApi, type Task, type Subtask, type TaskComment } from '@/lib/api/tasks';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const REF_DATE = Date.now();

const PRIORITY_COLORS: Record<string, string> = {
  high: 'text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-400',
  medium: 'text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400',
  low: 'text-blue-700 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400',
};

const STATUS_LABELS: Record<string, string> = {
  todo: 'To Do', in_progress: 'In Progress', done: 'Done',
};

const STATUS_COLORS: Record<string, string> = {
  todo: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  done: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
};

function normalizeTask(t: any): Task {
  return {
    ...t,
    dueDate: t.dueDate || t.due_date,
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
    status: (t.status === 'done' ? 'done' : t.status === 'in_progress' ? 'in_progress' : 'todo') as Task['status'],
  };
}

function formatDate(date: string | undefined): string {
  if (!date) return '--';
  return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatRelativeDate(date: string | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return diffMins <= 1 ? 'just now' : `${diffMins} minutes ago`;
    }
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  }
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return formatDate(date);
}

export default function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  // Fetch task
  const { data: taskResp, loading: taskLoading, error: taskError, refetch: refetchTask } = useApiQuery(
    () => tasksApi.getById(id),
    [id],
  );
  const task = React.useMemo(() => {
    const raw = (taskResp as any)?.data;
    return raw ? normalizeTask(raw) : null;
  }, [taskResp]);

  // Fetch subtasks
  const { data: subtasksResp, refetch: refetchSubtasks } = useApiQuery(
    () => tasksApi.getSubtasks(id),
    [id],
  );
  const subtasks: Subtask[] = React.useMemo(() => {
    const raw = (subtasksResp as any)?.data;
    return Array.isArray(raw) ? raw : [];
  }, [subtasksResp]);

  // Fetch comments
  const { data: commentsResp, refetch: refetchComments } = useApiQuery(
    () => tasksApi.getComments(id),
    [id],
  );
  const comments: TaskComment[] = React.useMemo(() => {
    const raw = (commentsResp as any)?.data?.data ?? (commentsResp as any)?.data ?? [];
    return Array.isArray(raw) ? raw : [];
  }, [commentsResp]);

  // State
  const [commentText, setCommentText] = React.useState('');
  const [newSubtask, setNewSubtask] = React.useState('');
  const [showSubtaskInput, setShowSubtaskInput] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [editingCommentId, setEditingCommentId] = React.useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = React.useState('');
  const [activeTab, setActiveTab] = React.useState('details');

  // Mutations
  const updateStatusMutation = useApiMutation((status: string) =>
    tasksApi.updateStatus(id, { status: status as 'todo' | 'in_progress' | 'done' }),
  );
  const deleteMutation = useApiMutation(() => tasksApi.delete(id));
  const createCommentMutation = useApiMutation((content: string) => tasksApi.createComment(id, content));
  const updateCommentMutation = useApiMutation(({ commentId, content }: { commentId: string; content: string }) =>
    tasksApi.updateComment(id, commentId, content),
  );
  const deleteCommentMutation = useApiMutation((commentId: string) => tasksApi.deleteComment(id, commentId));
  const createSubtaskMutation = useApiMutation((title: string) =>
    tasksApi.create({ title, parent_task_id: id, status: 'todo', priority: task?.priority || 'medium' }),
  );
  const updateSubtaskStatusMutation = useApiMutation(({ subtaskId, status }: { subtaskId: string; status: string }) =>
    tasksApi.updateStatus(subtaskId, { status: status as 'todo' | 'in_progress' | 'done' }),
  );

  const handleStatusChange = async (newStatus: string) => {
    try {
      await updateStatusMutation.mutate(newStatus);
      toast.success('Status updated');
      refetchTask();
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutate(undefined);
      toast.success('Task deleted');
      router.push('/tasks');
    } catch {
      toast.error('Failed to delete task');
    }
  };

  const handleAddComment = async () => {
    if (!commentText.trim()) return;
    try {
      const result = await createCommentMutation.mutate(commentText.trim());
      // Check if the API returned an error in the response body
      if (result && (result as any).error) {
        toast.error((result as any).message || 'Failed to add comment');
        return;
      }
      setCommentText('');
      toast.success('Comment added');
      refetchComments();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add comment');
    }
  };

  const handleUpdateComment = async (commentId: string) => {
    if (!editingCommentText.trim()) return;
    try {
      await updateCommentMutation.mutate({ commentId, content: editingCommentText.trim() });
      setEditingCommentId(null);
      toast.success('Comment updated');
      refetchComments();
    } catch {
      toast.error('Failed to update comment');
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await deleteCommentMutation.mutate(commentId);
      toast.success('Comment deleted');
      refetchComments();
    } catch {
      toast.error('Failed to delete comment');
    }
  };

  const handleAddSubtask = async () => {
    if (!newSubtask.trim()) return;
    try {
      await createSubtaskMutation.mutate(newSubtask.trim());
      setNewSubtask('');
      setShowSubtaskInput(false);
      toast.success('Subtask added');
      refetchSubtasks();
      refetchTask();
    } catch {
      toast.error('Failed to add subtask');
    }
  };

  const handleSubtaskToggle = async (subtask: Subtask) => {
    const newStatus = subtask.status === 'done' ? 'todo' : 'done';
    try {
      await updateSubtaskStatusMutation.mutate({ subtaskId: subtask.id, status: newStatus });
      refetchSubtasks();
      refetchTask();
    } catch {
      toast.error('Failed to update subtask');
    }
  };

  // Loading state
  if (taskLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-4">
            <Skeleton className="h-8 w-8 rounded" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-64" />
              <Skeleton className="h-4 w-40" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4 px-6 py-4 border-b">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
        <div className="p-6 space-y-4">
          <Skeleton className="h-10 w-80" />
          <Skeleton className="h-48 rounded-lg" />
          <Skeleton className="h-48 rounded-lg" />
        </div>
      </div>
    );
  }

  // Error state
  if (taskError || !task) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-muted-foreground">Task not found</p>
        <Button variant="outline" onClick={() => router.push('/tasks')}>Back to Tasks</Button>
      </div>
    );
  }

  const dueDate = task.dueDate ? new Date(task.dueDate) : null;
  const isOverdue = dueDate && dueDate < new Date(REF_DATE) && task.status !== 'done';
  const daysUntilDue = dueDate ? Math.ceil((dueDate.getTime() - REF_DATE) / (1000 * 60 * 60 * 24)) : null;
  const assigneeName = task.assignee_name || task.assignedTo || 'Unassigned';
  const leadDisplay = task.lead_title || (task.leadId ? `Lead #${task.leadId.slice(0, 8)}` : null);
  const subtaskCompleted = subtasks.filter((s) => s.status === 'done').length;
  const subtaskProgress = subtasks.length > 0 ? Math.round((subtaskCompleted / subtasks.length) * 100) : 0;

  // Build activity timeline from available data
  const timelineEvents: Array<{
    id: string;
    icon: React.ReactNode;
    title: string;
    description?: string;
    date: string;
    color: string;
  }> = [];

  // Task creation
  if (task.createdAt) {
    timelineEvents.push({
      id: 'created',
      icon: <Plus className="h-4 w-4" />,
      title: 'Task Created',
      description: `"${task.title}" was created`,
      date: task.createdAt,
      color: 'border-primary bg-primary/10',
    });
  }

  // Comments as timeline events
  comments.forEach((comment) => {
    const commentDate = comment.createdAt || comment.created_at || '';
    const userName = comment.user_name || comment.createdBy || comment.created_by || 'User';
    timelineEvents.push({
      id: `comment-${comment.id}`,
      icon: <MessageSquare className="h-4 w-4" />,
      title: `${userName} commented`,
      description: comment.content.length > 100 ? comment.content.slice(0, 100) + '...' : comment.content,
      date: commentDate,
      color: 'border-blue-500 bg-blue-50 dark:bg-blue-900/20',
    });
  });

  // Task completed
  if (task.completedAt || task.completed_at) {
    timelineEvents.push({
      id: 'completed',
      icon: <CheckSquare className="h-4 w-4" />,
      title: 'Task Completed',
      date: (task.completedAt || task.completed_at) as string,
      color: 'border-green-500 bg-green-50 dark:bg-green-900/20',
    });
  }

  // Last updated (if different from created)
  if (task.updatedAt && task.updatedAt !== task.createdAt) {
    timelineEvents.push({
      id: 'updated',
      icon: <Edit className="h-4 w-4" />,
      title: 'Task Updated',
      date: task.updatedAt,
      color: 'border-amber-500 bg-amber-50 dark:bg-amber-900/20',
    });
  }

  // Sort by date descending (most recent first)
  timelineEvents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
                {task.title}
              </h1>
              <Badge className={cn('text-xs capitalize', STATUS_COLORS[task.status])}>
                {STATUS_LABELS[task.status]}
              </Badge>
              <Badge className={cn('text-[10px]', PRIORITY_COLORS[task.priority])}>
                <Flag className="h-2.5 w-2.5 mr-1" />
                {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
              </Badge>
              {isOverdue && <Badge variant="destructive" className="text-[10px]">OVERDUE</Badge>}
            </div>
            {task.description && (
              <p className="text-sm text-muted-foreground mt-0.5 max-w-2xl">{task.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={task.status} onValueChange={handleStatusChange}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todo">To Do</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="done">Done</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="destructive"
            size="sm"
            className="h-8"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-6 py-4 border-b">
        <Card>
          <CardContent className="p-4 text-center">
            <Calendar className="h-5 w-5 mx-auto text-blue-500 mb-1" />
            <p className={cn('text-lg font-bold', isOverdue && 'text-red-600')}>
              {dueDate
                ? dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                : 'No date'}
            </p>
            <p className="text-xs text-muted-foreground">
              {isOverdue && daysUntilDue != null
                ? `Overdue by ${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) === 1 ? '' : 's'}`
                : daysUntilDue === 0 ? 'Due Today'
                : daysUntilDue != null && daysUntilDue > 0 ? `${daysUntilDue} days left`
                : 'Due Date'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <User className="h-5 w-5 mx-auto text-purple-500 mb-1" />
            <p className="text-lg font-bold truncate">{assigneeName}</p>
            <p className="text-xs text-muted-foreground">Assignee</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CheckSquare className="h-5 w-5 mx-auto text-green-500 mb-1" />
            <p className="text-lg font-bold">{subtaskProgress}%</p>
            <p className="text-xs text-muted-foreground">
              {subtasks.length > 0 ? `${subtaskCompleted}/${subtasks.length} subtasks` : 'No subtasks'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <MessageSquare className="h-5 w-5 mx-auto text-amber-500 mb-1" />
            <p className="text-lg font-bold">{comments.length}</p>
            <p className="text-xs text-muted-foreground">Comments</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <div className="px-6 pt-3 border-b">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="subtasks">
              Subtasks {subtasks.length > 0 && `(${subtaskCompleted}/${subtasks.length})`}
            </TabsTrigger>
            <TabsTrigger value="comments">
              Comments {comments.length > 0 && `(${comments.length})`}
            </TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {/* Details Tab */}
          <TabsContent value="details" className="mt-0">
            <div className="max-w-4xl grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle className="text-base">Task Information</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Title</span>
                    <span className="text-sm font-medium text-right max-w-[60%]">{task.title}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <Badge className={cn('text-xs capitalize', STATUS_COLORS[task.status])}>
                      {STATUS_LABELS[task.status]}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Priority</span>
                    <Badge className={cn('text-[10px]', PRIORITY_COLORS[task.priority])}>
                      <Flag className="h-2.5 w-2.5 mr-1" />
                      {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                    </Badge>
                  </div>
                  {task.category && (
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Category</span>
                      <Badge variant="outline" className="text-[10px] capitalize">{task.category.replace('_', ' ')}</Badge>
                    </div>
                  )}
                  {task.description && (
                    <div className="pt-2 border-t">
                      <p className="text-xs text-muted-foreground font-medium mb-1">Description</p>
                      <p className="text-sm whitespace-pre-wrap">{task.description}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Assignment & Schedule</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Assigned To</span>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-[9px]">{assigneeName.substring(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">{assigneeName}</span>
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Due Date</span>
                    <span className={cn('text-sm font-medium', isOverdue && 'text-red-600')}>
                      {dueDate ? formatDate(task.dueDate) : '--'}
                    </span>
                  </div>
                  {leadDisplay && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Linked Lead</span>
                      <Link
                        href={`/leads/${task.leadId || task.related_lead_id}`}
                        className="text-sm text-primary hover:underline flex items-center gap-1"
                      >
                        <Link2 className="h-3.5 w-3.5" /> {leadDisplay}
                      </Link>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader><CardTitle className="text-base">Metadata</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p>Created {formatDate(task.createdAt)}</p>
                  <p>Last updated {formatDate(task.updatedAt)}</p>
                  {(task.completedAt || task.completed_at) && (
                    <p>Completed {formatDate(task.completedAt || task.completed_at)}</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Subtasks Tab */}
          <TabsContent value="subtasks" className="mt-0">
            <div className="max-w-2xl space-y-4">
              {/* Progress bar */}
              {subtasks.length > 0 && (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Progress</span>
                      <span className="text-sm text-muted-foreground">{subtaskCompleted}/{subtasks.length} completed</span>
                    </div>
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${subtaskProgress}%` }}
                      />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Subtask list */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <CheckSquare className="h-4 w-4" />
                      Subtasks
                    </CardTitle>
                    <Button variant="ghost" size="sm" onClick={() => setShowSubtaskInput(true)}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {subtasks.map((subtask) => (
                    <div key={subtask.id} className="flex items-center gap-3 py-2 px-2 rounded-md hover:bg-muted/50 transition-colors group">
                      <button
                        onClick={() => handleSubtaskToggle(subtask)}
                        className={cn(
                          'h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                          subtask.status === 'done'
                            ? 'bg-primary border-primary text-primary-foreground'
                            : 'border-muted-foreground/50 hover:border-primary',
                        )}
                      >
                        {subtask.status === 'done' && (
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                      <span className={cn('text-sm flex-1', subtask.status === 'done' && 'line-through text-muted-foreground')}>
                        {subtask.title}
                      </span>
                      {subtask.assignee_name && (
                        <div className="flex items-center gap-1.5">
                          <Avatar className="h-5 w-5">
                            <AvatarFallback className="text-[8px]">{subtask.assignee_name.substring(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <span className="text-xs text-muted-foreground">{subtask.assignee_name}</span>
                        </div>
                      )}
                      {subtask.due_date && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(subtask.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </span>
                      )}
                    </div>
                  ))}

                  {subtasks.length === 0 && !showSubtaskInput && (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <CheckSquare className="h-8 w-8 opacity-30 mb-2" />
                      <p className="text-sm">No subtasks yet</p>
                      <p className="text-xs">Click &quot;Add&quot; to create a subtask</p>
                    </div>
                  )}

                  {showSubtaskInput && (
                    <div className="flex gap-2 mt-2 pt-2 border-t">
                      <Input
                        placeholder="Subtask title..."
                        value={newSubtask}
                        onChange={(e) => setNewSubtask(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddSubtask()}
                        className="h-8 text-sm"
                        autoFocus
                      />
                      <Button size="sm" className="h-8" onClick={handleAddSubtask} disabled={createSubtaskMutation.loading}>
                        {createSubtaskMutation.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add'}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => { setShowSubtaskInput(false); setNewSubtask(''); }}>
                        Cancel
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Comments Tab */}
          <TabsContent value="comments" className="mt-0">
            <div className="max-w-2xl space-y-4">
              {/* Add comment */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex gap-3">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="text-xs">Me</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 space-y-2">
                      <Textarea
                        placeholder="Add a comment..."
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        rows={3}
                        className="text-sm resize-none"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            handleAddComment();
                          }
                        }}
                      />
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground">
                          Press Ctrl+Enter to submit
                        </span>
                        <Button
                          size="sm"
                          className="h-7"
                          onClick={handleAddComment}
                          disabled={!commentText.trim() || createCommentMutation.loading}
                        >
                          {createCommentMutation.loading
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                            : <Send className="h-3.5 w-3.5 mr-1" />}
                          Post
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Comment list */}
              {comments.length === 0 && (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No comments yet</p>
                    <p className="text-xs">Be the first to comment on this task</p>
                  </CardContent>
                </Card>
              )}

              {comments.map((comment) => {
                const commentDate = comment.createdAt || comment.created_at || '';
                const userName = comment.user_name || comment.createdBy || comment.created_by || 'User';
                const isEditing = editingCommentId === comment.id;
                return (
                  <Card key={comment.id}>
                    <CardContent className="p-4">
                      <div className="flex gap-3">
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarFallback className="text-[10px]">{userName.substring(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">{userName}</span>
                            {commentDate && (
                              <span className="text-xs text-muted-foreground">
                                {formatRelativeDate(commentDate)}
                              </span>
                            )}
                            <div className="ml-auto flex items-center gap-1">
                              <button
                                className="text-xs text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted"
                                onClick={() => {
                                  setEditingCommentId(comment.id);
                                  setEditingCommentText(comment.content);
                                }}
                              >
                                Edit
                              </button>
                              <button
                                className="text-xs text-red-500 hover:text-red-700 transition-colors px-1.5 py-0.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                                onClick={() => handleDeleteComment(comment.id)}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                          {isEditing ? (
                            <div className="space-y-2">
                              <Textarea
                                value={editingCommentText}
                                onChange={(e) => setEditingCommentText(e.target.value)}
                                rows={2}
                                className="text-sm resize-none"
                                autoFocus
                              />
                              <div className="flex gap-2">
                                <Button size="sm" className="h-7 text-xs" onClick={() => handleUpdateComment(comment.id)} disabled={updateCommentMutation.loading}>
                                  {updateCommentMutation.loading && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                                  Save
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingCommentId(null)}>Cancel</Button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* Timeline Tab */}
          <TabsContent value="timeline" className="mt-0">
            <div className="max-w-2xl space-y-0">
              {timelineEvents.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <Activity className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No activity yet</p>
                  </CardContent>
                </Card>
              ) : (
                timelineEvents.map((event, idx) => (
                  <div key={event.id} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className={cn(
                        'h-10 w-10 rounded-full border-2 flex items-center justify-center shrink-0',
                        event.color,
                      )}>
                        {event.icon}
                      </div>
                      {idx < timelineEvents.length - 1 && (
                        <div className="flex-1 w-px bg-border mt-2 mb-2" style={{ minHeight: '24px' }} />
                      )}
                    </div>
                    <div className="pb-6 pt-1 flex-1 min-w-0">
                      <h4 className="text-sm font-semibold">{event.title}</h4>
                      {event.description && (
                        <p className="text-sm text-muted-foreground mt-0.5 break-words">{event.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatRelativeDate(event.date)}
                        <span className="mx-1">-</span>
                        {formatDate(event.date)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </TabsContent>
        </div>
      </Tabs>

      {/* Delete confirmation */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Task</DialogTitle>
            <DialogDescription>
              This will permanently delete the task and all its subtasks and comments. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteMutation.loading}>
              {deleteMutation.loading && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
