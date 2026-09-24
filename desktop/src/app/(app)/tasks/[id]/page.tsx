'use client';

import * as React from 'react';
import { use } from 'react';
import {
  CheckSquare, Link2, MessageSquare, Send, Loader2, Trash2, Plus, AlertCircle, Edit,
} from 'lucide-react';
import { DetailPage, RelationCombobox } from '@/components/domain';
import { Button } from '@/components/ui/button';
import { Tag } from '@/components/ui/tag';
import { SectionCard } from '@/components/ui/section-card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import type { TimelineItem } from '@/components/ui/timeline';
import { cn } from '@/lib/utils';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { tasksApi, type Task, type Subtask, type TaskComment } from '@/lib/api/tasks';
import { usersApi } from '@/lib/api/users';
import { leadsApi } from '@/lib/api/leads';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const STATUS_LABELS: Record<string, string> = { todo: 'To Do', in_progress: 'In Progress', done: 'Done' };

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
  return new Date(date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const { data: taskResp, loading: taskLoading, error: taskError, refetch: refetchTask } = useApiQuery(
    () => tasksApi.getById(id),
    [id],
  );
  const task = React.useMemo(() => {
    const raw = (taskResp as any)?.data;
    return raw ? normalizeTask(raw) : null;
  }, [taskResp]);

  const { data: subtasksResp, refetch: refetchSubtasks } = useApiQuery(() => tasksApi.getSubtasks(id), [id]);
  const subtasks: Subtask[] = React.useMemo(() => {
    const raw = (subtasksResp as any)?.data;
    return Array.isArray(raw) ? raw : [];
  }, [subtasksResp]);

  const { data: commentsResp, refetch: refetchComments } = useApiQuery(() => tasksApi.getComments(id), [id]);
  const comments: TaskComment[] = React.useMemo(() => {
    const raw = (commentsResp as any)?.data?.data ?? (commentsResp as any)?.data ?? [];
    return Array.isArray(raw) ? raw : [];
  }, [commentsResp]);

  const [commentText, setCommentText] = React.useState('');
  const [newSubtask, setNewSubtask] = React.useState('');
  const [showSubtaskInput, setShowSubtaskInput] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [editDialogOpen, setEditDialogOpen] = React.useState(false);
  const [editingCommentId, setEditingCommentId] = React.useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = React.useState('');
  const [editForm, setEditForm] = React.useState<{
    title: string; description: string; priority: string; category: string;
    dueDate: Date | undefined; assignedTo: string; leadId: string;
  } | null>(null);

  const updateStatusMutation = useApiMutation((status: string) =>
    tasksApi.updateStatus(id, { status: status as 'todo' | 'in_progress' | 'done' }),
  );
  const updateTaskMutation = useApiMutation((data: any) => tasksApi.update(id, data));
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

  const openEdit = () => {
    if (!task) return;
    setEditForm({
      title: task.title,
      description: task.description || '',
      priority: task.priority,
      category: task.category || 'general',
      dueDate: task.dueDate ? new Date(task.dueDate) : undefined,
      assignedTo: task.assignedTo || '',
      leadId: task.leadId || '',
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editForm || !editForm.title.trim()) {
      toast.error('Task title is required');
      return;
    }
    try {
      await updateTaskMutation.mutate({
        title: editForm.title,
        description: editForm.description || undefined,
        priority: editForm.priority as 'low' | 'medium' | 'high',
        category: editForm.category,
        due_date: editForm.dueDate ? editForm.dueDate.toISOString() : undefined,
        assigned_to: editForm.assignedTo || undefined,
        related_lead_id: editForm.leadId || undefined,
      });
      toast.success('Task updated');
      setEditDialogOpen(false);
      refetchTask();
    } catch {
      toast.error('Failed to update task');
    }
  };

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

  if (taskLoading) {
    return (
      <div className="flex flex-col gap-ds-4">
        <div className="flex items-center gap-ds-4">
          <Skeleton className="h-8 w-8 rounded-ds-sm" />
          <div className="space-y-ds-2">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-ds-4 lg:grid-cols-2">
          <Skeleton className="h-48 rounded-ds-md" />
          <Skeleton className="h-48 rounded-ds-md" />
        </div>
      </div>
    );
  }

  if (taskError || !task) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-ds-4">
        <AlertCircle className="size-12 text-ds-danger" />
        <p className="text-ds-foreground-muted">Task not found</p>
        <Button variant="outline" onClick={() => router.push('/tasks')}>Back to tasks</Button>
      </div>
    );
  }

  const dueDate = task.dueDate ? new Date(task.dueDate) : null;
  const isOverdue = !!dueDate && dueDate < new Date() && task.status !== 'done';
  const subtaskCompleted = subtasks.filter((s) => s.status === 'done').length;
  const subtaskProgress = subtasks.length > 0 ? Math.round((subtaskCompleted / subtasks.length) * 100) : 0;

  const timelineItems: TimelineItem[] = [];
  if (task.createdAt) {
    timelineItems.push({
      id: 'created', icon: <Plus className="size-4" />, title: 'Task created',
      description: `"${task.title}" was created`, timestamp: task.createdAt,
    });
  }
  comments.forEach((comment) => {
    const commentDate = comment.createdAt || comment.created_at || '';
    const userName = comment.user_name || comment.createdBy || comment.created_by || 'User';
    timelineItems.push({
      id: `comment-${comment.id}`, icon: <MessageSquare className="size-4" />,
      title: `${userName} commented`,
      description: comment.content.length > 100 ? comment.content.slice(0, 100) + '...' : comment.content,
      timestamp: commentDate,
    });
  });
  if (task.completedAt || task.completed_at) {
    timelineItems.push({
      id: 'completed', icon: <CheckSquare className="size-4" />, title: 'Task completed',
      timestamp: (task.completedAt || task.completed_at) as string,
    });
  }
  if (task.updatedAt && task.updatedAt !== task.createdAt) {
    timelineItems.push({
      id: 'updated', icon: <Edit className="size-4" />, title: 'Task updated', timestamp: task.updatedAt,
    });
  }
  timelineItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <>
      <DetailPage<Task>
        entity={task}
        title={task.title}
        subtitle={task.description}
        onBack={() => router.push('/tasks')}
        status={
          <div className="flex items-center gap-ds-2">
            <Select value={task.status} onValueChange={handleStatusChange}>
              <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todo">To Do</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="done">Done</SelectItem>
              </SelectContent>
            </Select>
            {isOverdue && <Tag tone="danger">Overdue</Tag>}
          </div>
        }
        primaryActions={
          <Button variant="outline" size="sm" onClick={openEdit} className="gap-ds-2">
            <Edit className="size-4" /> Edit
          </Button>
        }
        actions={[
          { label: 'Delete', icon: <Trash2 className="size-4" />, onSelect: () => setDeleteDialogOpen(true), destructive: true },
        ]}
        overview={
          <div className="grid grid-cols-1 gap-ds-4 lg:grid-cols-2">
            <SectionCard title="Task information">
              <div className="space-y-ds-3">
                <div className="flex justify-between">
                  <span className="text-sm text-ds-foreground-muted">Status</span>
                  <Tag tone={task.status === 'done' ? 'success' : task.status === 'in_progress' ? 'info' : 'neutral'}>
                    {STATUS_LABELS[task.status]}
                  </Tag>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-ds-foreground-muted">Priority</span>
                  <span className="text-sm font-medium capitalize">{task.priority}</span>
                </div>
                {task.category && (
                  <div className="flex justify-between">
                    <span className="text-sm text-ds-foreground-muted">Category</span>
                    <Tag tone="neutral">{task.category.replace('_', ' ')}</Tag>
                  </div>
                )}
                {task.description && (
                  <div className="border-t border-ds-border pt-ds-2">
                    <p className="mb-ds-1 text-xs font-medium text-ds-foreground-muted">Description</p>
                    <p className="whitespace-pre-wrap text-sm">{task.description}</p>
                  </div>
                )}
              </div>
            </SectionCard>

            <SectionCard title="Assignment & schedule">
              <div className="space-y-ds-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-ds-foreground-muted">Assigned to</span>
                  <div className="flex items-center gap-ds-2">
                    <Avatar className="size-6">
                      <AvatarFallback className="text-[9px]">
                        {(task.assignee_name || 'U').substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium">{task.assignee_name || 'Unassigned'}</span>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-ds-foreground-muted">Due date</span>
                  <span className={cn('text-sm font-medium', isOverdue && 'text-ds-danger')}>
                    {dueDate ? formatDate(task.dueDate) : '--'}
                  </span>
                </div>
                {task.lead_title && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-ds-foreground-muted">Linked lead</span>
                    <Link href={`/leads/${task.leadId}`} className="flex items-center gap-ds-1 text-sm text-ds-primary hover:underline">
                      <Link2 className="size-3.5" /> {task.lead_title}
                    </Link>
                  </div>
                )}
              </div>
            </SectionCard>

            <SectionCard title="Subtasks" className="lg:col-span-2" actions={
              <Button variant="ghost" size="sm" onClick={() => setShowSubtaskInput(true)} className="gap-ds-1">
                <Plus className="size-3.5" /> Add
              </Button>
            }>
              <div className="space-y-ds-2">
                {subtasks.length > 0 && (
                  <div className="mb-ds-2 flex items-center gap-ds-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-ds-full bg-ds-surface-sunken">
                      <div className="h-full rounded-ds-full bg-ds-primary transition-all" style={{ width: `${subtaskProgress}%` }} />
                    </div>
                    <span className="text-xs text-ds-foreground-muted">{subtaskCompleted}/{subtasks.length}</span>
                  </div>
                )}

                {subtasks.map((subtask) => (
                  <div key={subtask.id} className="flex items-center gap-ds-3 rounded-ds-sm px-ds-2 py-ds-2 hover:bg-ds-surface-sunken">
                    <button
                      onClick={() => handleSubtaskToggle(subtask)}
                      className={cn(
                        'flex size-5 shrink-0 items-center justify-center rounded-ds-sm border-2 transition-colors',
                        subtask.status === 'done' ? 'border-ds-primary bg-ds-primary text-ds-primary-foreground' : 'border-ds-border hover:border-ds-primary',
                      )}
                    >
                      {subtask.status === 'done' && (
                        <svg className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                    <span className={cn('flex-1 text-sm', subtask.status === 'done' && 'text-ds-foreground-muted line-through')}>
                      {subtask.title}
                    </span>
                    {subtask.assignee_name && (
                      <span className="text-xs text-ds-foreground-muted">{subtask.assignee_name}</span>
                    )}
                  </div>
                ))}

                {subtasks.length === 0 && !showSubtaskInput && (
                  <EmptyState title="No subtasks yet" description='Click "Add" to create a subtask.' />
                )}

                {showSubtaskInput && (
                  <div className="mt-ds-2 flex gap-ds-2 border-t border-ds-border pt-ds-2">
                    <Input
                      placeholder="Subtask title..."
                      value={newSubtask}
                      onChange={(e) => setNewSubtask(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddSubtask()}
                      className="h-8 text-sm"
                      autoFocus
                    />
                    <Button size="sm" className="h-8" onClick={handleAddSubtask} disabled={createSubtaskMutation.loading}>
                      {createSubtaskMutation.loading ? <Loader2 className="size-3.5 animate-spin" /> : 'Add'}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => { setShowSubtaskInput(false); setNewSubtask(''); }}>
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            </SectionCard>
          </div>
        }
        activity={timelineItems}
        related={[
          {
            title: 'Comments',
            content: (
              <div className="space-y-ds-4">
                <div className="flex gap-ds-3">
                  <Avatar className="size-8 shrink-0"><AvatarFallback className="text-xs">Me</AvatarFallback></Avatar>
                  <div className="flex-1 space-y-ds-2">
                    <Textarea
                      placeholder="Add a comment..."
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      rows={3}
                      className="resize-none text-sm"
                      onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddComment(); }}
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-ds-foreground-muted">Ctrl+Enter to submit</span>
                      <Button size="sm" className="h-7 gap-ds-1" onClick={handleAddComment} disabled={!commentText.trim() || createCommentMutation.loading}>
                        {createCommentMutation.loading ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                        Post
                      </Button>
                    </div>
                  </div>
                </div>

                {comments.length === 0 && (
                  <EmptyState title="No comments yet" description="Be the first to comment on this task." />
                )}

                {comments.map((comment) => {
                  const commentDate = comment.createdAt || comment.created_at || '';
                  const userName = comment.user_name || comment.createdBy || comment.created_by || 'User';
                  const isEditing = editingCommentId === comment.id;
                  return (
                    <div key={comment.id} className="flex gap-ds-3 border-t border-ds-border pt-ds-3">
                      <Avatar className="size-8 shrink-0">
                        <AvatarFallback className="text-[10px]">{userName.substring(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 space-y-ds-1">
                        <div className="flex items-center gap-ds-2">
                          <span className="text-sm font-semibold">{userName}</span>
                          {commentDate && <span className="text-xs text-ds-foreground-muted">{formatDate(commentDate)}</span>}
                          <div className="ml-auto flex items-center gap-ds-1">
                            <button
                              className="rounded-ds-sm px-1.5 py-0.5 text-xs text-ds-foreground-muted hover:bg-ds-surface-sunken hover:text-ds-foreground"
                              onClick={() => { setEditingCommentId(comment.id); setEditingCommentText(comment.content); }}
                            >
                              Edit
                            </button>
                            <button
                              className="rounded-ds-sm px-1.5 py-0.5 text-xs text-ds-danger hover:bg-ds-danger-subtle"
                              onClick={() => handleDeleteComment(comment.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                        {isEditing ? (
                          <div className="space-y-ds-2">
                            <Textarea value={editingCommentText} onChange={(e) => setEditingCommentText(e.target.value)} rows={2} className="resize-none text-sm" autoFocus />
                            <div className="flex gap-ds-2">
                              <Button size="sm" className="h-7 text-xs" onClick={() => handleUpdateComment(comment.id)} disabled={updateCommentMutation.loading}>
                                {updateCommentMutation.loading && <Loader2 className="mr-1 size-3 animate-spin" />}
                                Save
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingCommentId(null)}>Cancel</Button>
                            </div>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap text-sm">{comment.content}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ),
          },
        ]}
      />

      {/* Delete confirmation */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete task</DialogTitle>
            <DialogDescription>
              This will permanently delete the task and all its subtasks and comments. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteMutation.loading}>
              {deleteMutation.loading && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit task</DialogTitle>
          </DialogHeader>
          {editForm && (
            <div className="space-y-ds-4">
              <div className="space-y-ds-1">
                <label className="text-sm font-medium" htmlFor="editTitle">Title <span className="text-ds-danger">*</span></label>
                <Input id="editTitle" value={editForm.title} onChange={(e) => setEditForm((p) => p && { ...p, title: e.target.value })} />
              </div>
              <div className="space-y-ds-1">
                <label className="text-sm font-medium" htmlFor="editDesc">Description</label>
                <Textarea id="editDesc" value={editForm.description} onChange={(e) => setEditForm((p) => p && { ...p, description: e.target.value })} rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-ds-4">
                <div className="space-y-ds-1">
                  <label className="text-sm font-medium">Priority</label>
                  <Select value={editForm.priority} onValueChange={(v) => setEditForm((p) => p && { ...p, priority: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-ds-1">
                  <label className="text-sm font-medium">Category</label>
                  <Select value={editForm.category} onValueChange={(v) => setEditForm((p) => p && { ...p, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">General</SelectItem>
                      <SelectItem value="follow_up">Follow Up</SelectItem>
                      <SelectItem value="documentation">Documentation</SelectItem>
                      <SelectItem value="meeting">Meeting</SelectItem>
                      <SelectItem value="payment">Payment</SelectItem>
                      <SelectItem value="visa">Visa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-ds-1">
                <label className="text-sm font-medium">Assign to</label>
                <RelationCombobox
                  value={editForm.assignedTo || null}
                  onChange={(v) => setEditForm((p) => p && { ...p, assignedTo: v ?? '' })}
                  fetcher={async (q, page) => {
                    const r = await usersApi.list({ search: q, page, limit: 20 });
                    const data = (r as any)?.data;
                    return { items: data?.data ?? [], total: data?.pagination?.total ?? 0 };
                  }}
                  getOptionId={(u: any) => u.id}
                  getOptionLabel={(u: any) => u.name || u.email}
                  getOptionDescription={(u: any) => u.email}
                  resolveSelected={async (uid) => (await usersApi.getById(uid)).data as any}
                  placeholder="Search team members…"
                />
              </div>
              <div className="space-y-ds-1">
                <label className="text-sm font-medium">Linked lead</label>
                <RelationCombobox
                  value={editForm.leadId || null}
                  onChange={(v) => setEditForm((p) => p && { ...p, leadId: v ?? '' })}
                  fetcher={async (q, page) => {
                    const r = await leadsApi.list({ search: q, page, limit: 20 } as any);
                    const data = (r as any)?.data;
                    return { items: data?.data ?? [], total: data?.pagination?.total ?? 0 };
                  }}
                  getOptionId={(l: any) => l.id}
                  getOptionLabel={(l: any) => l.title || l.name || l.id}
                  resolveSelected={async (lid) => (await leadsApi.getById(lid)).data as any}
                  placeholder="Search leads…"
                />
              </div>
              <div className="space-y-ds-1">
                <label className="text-sm font-medium">Due date</label>
                <DatePicker value={editForm.dueDate} onChange={(d) => setEditForm((p) => p && { ...p, dueDate: d })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={updateTaskMutation.loading}>
              {updateTaskMutation.loading && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
