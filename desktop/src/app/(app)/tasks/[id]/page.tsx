'use client';

import * as React from 'react';
import { use } from 'react';
import {
  ArrowLeft, Calendar, CheckSquare, Flag, Link2, MessageSquare,
  Send, Loader2, Trash2, Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
      await createCommentMutation.mutate(commentText.trim());
      setCommentText('');
      toast.success('Comment added');
      refetchComments();
    } catch {
      toast.error('Failed to add comment');
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
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (taskError || !task) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-muted-foreground">Task not found</p>
        <Button onClick={() => router.push('/tasks')}>Back to Tasks</Button>
      </div>
    );
  }

  const dueDate = task.dueDate ? new Date(task.dueDate) : null;
  const isOverdue = dueDate && dueDate < new Date(REF_DATE) && task.status !== 'done';
  const assigneeName = task.assignee_name || task.assignedTo || 'Unassigned';
  const leadDisplay = task.lead_title || (task.leadId ? `Lead #${task.leadId.slice(0, 8)}` : null);
  const subtaskCompleted = subtasks.filter((s) => s.status === 'done').length;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Back + Actions */}
      <div className="flex items-center justify-between gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/tasks')}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Tasks
        </Button>
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

      {/* Title + Status */}
      <div className="space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <Badge variant={task.status === 'done' ? 'default' : task.status === 'in_progress' ? 'secondary' : 'outline'}>
            {STATUS_LABELS[task.status]}
          </Badge>
          <Badge className={cn('text-[10px]', PRIORITY_COLORS[task.priority])}>
            <Flag className="h-2.5 w-2.5 mr-1" />
            {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
          </Badge>
          {isOverdue && <Badge variant="destructive">OVERDUE</Badge>}
        </div>
        <h1 className="text-2xl font-bold">{task.title}</h1>
        {task.description && <p className="text-muted-foreground">{task.description}</p>}
      </div>

      {/* Meta grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {dueDate && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium">Due Date</p>
            <div className="flex items-center gap-1.5 text-sm">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <span className={cn(isOverdue && 'text-red-600 font-semibold')}>
                {dueDate.toLocaleDateString('en-IN')}
              </span>
            </div>
          </div>
        )}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground font-medium">Assigned To</p>
          <div className="flex items-center gap-1.5">
            <Avatar className="h-5 w-5">
              <AvatarFallback className="text-[9px]">{assigneeName.substring(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <span className="text-sm">{assigneeName}</span>
          </div>
        </div>
        {task.category && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium">Category</p>
            <span className="text-sm capitalize">{task.category.replace('_', ' ')}</span>
          </div>
        )}
        {leadDisplay && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium">Linked Lead</p>
            <Link
              href={`/leads/${task.leadId || task.related_lead_id}`}
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              <Link2 className="h-3.5 w-3.5" /> {leadDisplay}
            </Link>
          </div>
        )}
      </div>

      {/* Subtasks */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckSquare className="h-4 w-4" />
              Subtasks
              {subtasks.length > 0 && (
                <span className="text-sm font-normal text-muted-foreground">
                  ({subtaskCompleted}/{subtasks.length})
                </span>
              )}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setShowSubtaskInput(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add
            </Button>
          </div>
          {subtasks.length > 0 && (
            <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-2">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${subtasks.length > 0 ? (subtaskCompleted / subtasks.length) * 100 : 0}%` }}
              />
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {subtasks.map((subtask) => (
            <div key={subtask.id} className="flex items-center gap-3 py-1">
              <button
                onClick={() => handleSubtaskToggle(subtask)}
                className={cn(
                  'h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                  subtask.status === 'done'
                    ? 'bg-primary border-primary text-primary-foreground'
                    : 'border-muted-foreground/50 hover:border-primary',
                )}
              >
                {subtask.status === 'done' && (
                  <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
              <span className={cn('text-sm flex-1', subtask.status === 'done' && 'line-through text-muted-foreground')}>
                {subtask.title}
              </span>
              {subtask.assignee_name && (
                <span className="text-xs text-muted-foreground">{subtask.assignee_name}</span>
              )}
            </div>
          ))}

          {subtasks.length === 0 && !showSubtaskInput && (
            <p className="text-xs text-muted-foreground text-center py-2">No subtasks yet</p>
          )}

          {showSubtaskInput && (
            <div className="flex gap-2 mt-2">
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

      {/* Comments */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Comments
            {comments.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground">({comments.length})</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add comment */}
          <div className="flex gap-3">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback className="text-xs">Me</AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-2">
              <Textarea
                placeholder="Add a comment..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                rows={2}
                className="text-sm resize-none"
              />
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

          {/* Comment list */}
          {comments.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">No comments yet. Be the first!</p>
          )}

          {comments.map((comment) => {
            const commentDate = comment.createdAt || comment.created_at || '';
            const userName = comment.user_name || comment.createdBy || comment.created_by || 'User';
            const isEditing = editingCommentId === comment.id;
            return (
              <div key={comment.id} className="flex gap-3">
                <Avatar className="h-7 w-7 shrink-0">
                  <AvatarFallback className="text-[10px]">{userName.substring(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold">{userName}</span>
                    {commentDate && (
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(commentDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                    <button
                      className="ml-auto text-[10px] text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setEditingCommentId(comment.id);
                        setEditingCommentText(comment.content);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="text-[10px] text-red-500 hover:text-red-700"
                      onClick={() => handleDeleteComment(comment.id)}
                    >
                      Delete
                    </button>
                  </div>
                  {isEditing ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editingCommentText}
                        onChange={(e) => setEditingCommentText(e.target.value)}
                        rows={2}
                        className="text-sm resize-none"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" className="h-6 text-xs" onClick={() => handleUpdateComment(comment.id)}>Save</Button>
                        <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditingCommentId(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm">{comment.content}</p>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

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
