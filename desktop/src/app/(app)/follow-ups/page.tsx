'use client';

import * as React from 'react';
import {
  Plus, Search, Filter, MoreHorizontal, Clock, CheckCircle2, AlertCircle,
  Loader2, Calendar, Trash2, Phone, Mail, MessageCircle, MapPin,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useApiQuery } from '@/hooks/use-api';
import { followUpsApi } from '@/lib/api/follow-ups';
import { leadsApi } from '@/lib/api/leads';
import { DateTimePicker } from '@/components/ui/date-picker';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

function FollowUpCard({
  followUp,
  onComplete,
  onDelete,
}: {
  followUp: any;
  onComplete: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const router = useRouter();
  const scheduledAt = followUp.scheduledAt || followUp.scheduled_at;
  const completedAt = followUp.completedAt || followUp.completed_at;
  const isCompleted = followUp.status === 'completed' || !!completedAt;
  const isOverdue = !isCompleted && scheduledAt && new Date(scheduledAt) < new Date();
  const fuType = followUp.type || 'call';

  const typeIcons: Record<string, React.ReactNode> = {
    call: <Phone className="h-4 w-4" />,
    email: <Mail className="h-4 w-4" />,
    whatsapp: <MessageCircle className="h-4 w-4" />,
    visit: <MapPin className="h-4 w-4" />,
    sms: <Mail className="h-4 w-4" />,
  };

  const typeColors: Record<string, string> = {
    call: 'text-purple-600 bg-purple-50 dark:bg-purple-900/30 dark:text-purple-400',
    email: 'text-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400',
    whatsapp: 'text-green-600 bg-green-50 dark:bg-green-900/30 dark:text-green-400',
    visit: 'text-orange-600 bg-orange-50 dark:bg-orange-900/30 dark:text-orange-400',
    sms: 'text-cyan-600 bg-cyan-50 dark:bg-cyan-900/30 dark:text-cyan-400',
  };

  return (
    <Card className={cn('hover:shadow-md transition-shadow group', isCompleted && 'opacity-70')}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={cn(
            'h-10 w-10 rounded-full flex items-center justify-center shrink-0 mt-0.5',
            isCompleted ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
            isOverdue ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
            'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
          )}>
            {isCompleted ? <CheckCircle2 className="h-4 w-4" /> :
             isOverdue ? <AlertCircle className="h-4 w-4" /> :
             typeIcons[fuType] || <Clock className="h-4 w-4" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-sm capitalize">{fuType} Follow-up</h3>
              <Badge className={cn('text-[10px]', typeColors[fuType] ?? 'bg-gray-100 text-gray-700')}>
                {fuType}
              </Badge>
              <Badge variant="outline" className={cn('text-[10px] border-transparent',
                isCompleted ? 'bg-green-100 text-green-700' :
                isOverdue ? 'bg-red-100 text-red-700' :
                'bg-amber-100 text-amber-700',
              )}>
                {isCompleted ? 'Completed' : isOverdue ? 'Overdue' : 'Pending'}
              </Badge>
            </div>
            {followUp.leadTitle && (
              <p className="text-xs text-muted-foreground mb-1">
                Lead: <button className="text-primary hover:underline" onClick={() => router.push(`/leads/${followUp.leadId}`)}>{followUp.leadTitle}</button>
                {followUp.contactName && <span> · {followUp.contactName}</span>}
              </p>
            )}
            {followUp.notes && <p className="text-xs text-muted-foreground line-clamp-2">{followUp.notes}</p>}
            <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span className={cn(isOverdue && 'text-red-600 font-medium')}>
                {scheduledAt ? new Date(scheduledAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
              </span>
              {followUp.createdByName && <><span>·</span><span>by {followUp.createdByName}</span></>}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!isCompleted && <DropdownMenuItem onClick={onComplete}>Mark Complete</DropdownMenuItem>}
              {followUp.leadId && <DropdownMenuItem onClick={() => router.push(`/leads/${followUp.leadId}`)}>View Lead</DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600" onClick={onDelete}>Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}

export default function FollowUpsPage() {
  const [filter, setFilter] = React.useState<string>('all');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
  const [fuForm, setFuForm] = React.useState({
    scheduledAt: undefined as Date | undefined,
    type: 'call' as string,
    notes: '',
    leadId: '',
  });
  const [fuSaving, setFuSaving] = React.useState(false);

  const { data: response, loading, error, refetch } = useApiQuery(
    () => followUpsApi.list({
      ...(filter !== 'all' ? { status: filter as any } : {}),
      ...(searchQuery ? { search: searchQuery } : {}),
    }),
    [filter, searchQuery],
  );

  // Fetch leads for dropdown
  const { data: leadsResponse } = useApiQuery(() => leadsApi.list({ limit: 100 }), []);
  const leadsList: any[] = Array.isArray(leadsResponse?.data) ? leadsResponse!.data : (leadsResponse?.data?.data ?? []);

  const followUps = Array.isArray(response?.data) ? response!.data : (response?.data?.data ?? []);

  async function handleComplete(id: string) {
    try {
      await followUpsApi.complete(id);
      toast.success('Follow-up completed');
      refetch();
    } catch {
      toast.error('Failed to complete follow-up');
    }
  }

  async function handleDelete(id: string) {
    try {
      await followUpsApi.delete(id);
      toast.success('Follow-up deleted');
      refetch();
    } catch {
      toast.error('Failed to delete follow-up');
    }
  }

  async function handleCreate() {
    if (!fuForm.scheduledAt || !fuForm.leadId) {
      toast.error('Please select a lead and date');
      return;
    }
    setFuSaving(true);
    try {
      await followUpsApi.create({
        leadId: fuForm.leadId,
        scheduledAt: fuForm.scheduledAt.toISOString(),
        type: fuForm.type as any,
        notes: fuForm.notes || undefined,
      });
      toast.success('Follow-up scheduled');
      setCreateDialogOpen(false);
      setFuForm({ scheduledAt: undefined, type: 'call', notes: '', leadId: '' });
      refetch();
    } catch {
      toast.error('Failed to create follow-up');
    } finally {
      setFuSaving(false);
    }
  }

  // Stats
  const totalPending = followUps.filter((f: any) => f.status === 'pending').length;
  const totalOverdue = followUps.filter((f: any) => {
    const sa = f.scheduledAt || f.scheduled_at;
    return f.status === 'pending' && sa && new Date(sa) < new Date();
  }).length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Follow-ups</h1>
          <p className="text-sm text-muted-foreground">
            {totalPending} pending{totalOverdue > 0 && <span className="text-red-600 font-medium"> · {totalOverdue} overdue</span>}
          </p>
        </div>
        <Button className="gap-1.5" onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Schedule Follow-up
        </Button>
      </div>

      {/* Filter Bar */}
      <div className="px-6 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search follow-ups..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 pl-10"
            />
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-40 h-9 text-xs">
              <Filter className="h-3.5 w-3.5 mr-1.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Follow-ups</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
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
            <p className="text-muted-foreground">Failed to load follow-ups</p>
            <Button size="sm" onClick={() => refetch()} className="mt-4">Retry</Button>
          </div>
        </div>
      )}

      {/* Follow-ups List */}
      {!loading && !error && (
        <div className="flex-1 overflow-auto p-6">
          {followUps.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No follow-ups yet</p>
              <p className="text-sm">Schedule one to get started</p>
            </div>
          ) : (
            <div className="grid gap-3 max-w-3xl">
              {followUps.map((fu: any) => (
                <FollowUpCard
                  key={fu.id}
                  followUp={fu}
                  onComplete={() => handleComplete(fu.id)}
                  onDelete={() => handleDelete(fu.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Follow-up Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule Follow-up</DialogTitle>
            <DialogDescription>Schedule a new follow-up for a lead.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Lead <span className="text-destructive">*</span></Label>
              <Select value={fuForm.leadId} onValueChange={(v) => setFuForm({ ...fuForm, leadId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a lead" />
                </SelectTrigger>
                <SelectContent>
                  {leadsList.map((lead: any) => (
                    <SelectItem key={lead.id} value={lead.id}>
                      {lead.title} {lead.contactName ? `(${lead.contactName})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date & Time <span className="text-destructive">*</span></Label>
                <DateTimePicker
                  value={fuForm.scheduledAt}
                  onChange={(d) => setFuForm({ ...fuForm, scheduledAt: d })}
                  placeholder="Pick date & time"
                  minDate={new Date()}
                />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={fuForm.type} onValueChange={(v) => setFuForm({ ...fuForm, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="call">Call</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="visit">Visit</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="What to follow up on..."
                value={fuForm.notes}
                onChange={(e) => setFuForm({ ...fuForm, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)} disabled={fuSaving}>Cancel</Button>
            <Button disabled={fuSaving || !fuForm.scheduledAt || !fuForm.leadId} onClick={handleCreate}>
              {fuSaving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
