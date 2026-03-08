'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, Search, Filter, LayoutGrid, List, MoreHorizontal,
  Phone, Mail, Calendar, ArrowUpRight, Clock,
  Briefcase, ChevronDown, X, Download, Trash2, UserPlus, AlertCircle, Loader2,
  MessageCircle, MessageSquare, Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useLeadStore } from '@/stores/lead-store';
import { LEAD_STATUS_LABELS, LEAD_STATUS_COLORS } from '@travelcrm/shared';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { leadsApi } from '@/lib/api/leads';
import { exportsApi } from '@/lib/api/exports';
import { followUpsApi } from '@/lib/api/follow-ups';
import { SendMessageDialog } from '@/components/communication/send-message-dialog';
import { toast } from 'sonner';
import {
  DndContext, rectIntersection, DragEndEvent,
  PointerSensor, useSensor, useSensors, useDroppable, useDraggable,
} from '@dnd-kit/core';
import { usersApi } from '@/lib/api/users';
import { DateTimePicker } from '@/components/ui/date-picker';

function formatCurrency(amount: number, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

function getInitials(name: string) {
  return name.split(' ').map((n: any) => n[0]).join('').toUpperCase().slice(0, 2);
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    new: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
    contacted: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    qualified: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
    proposal_sent: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    negotiation: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    won: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    lost: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    on_hold: 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400',
  };
  return (
    <Badge variant="outline" className={cn('border-transparent text-[11px] font-medium', colorMap[status])}>
      {LEAD_STATUS_LABELS[status as keyof typeof LEAD_STATUS_LABELS] || status}
    </Badge>
  );
}

function PriorityDot({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    hot: 'bg-red-500',
    warm: 'bg-amber-500',
    cold: 'bg-blue-500',
  };
  return (
    <span className={cn('inline-block h-2 w-2 rounded-full', colors[priority])} title={priority} />
  );
}

/* ─── Lead Detail Panel ─── */
function LeadDetailPanel({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const router = useRouter();
  const { data: lead, loading, error } = useApiQuery(() => leadsApi.getById(leadId), [leadId]);
  const [msgDialogOpen, setMsgDialogOpen] = React.useState(false);
  const [msgChannel, setMsgChannel] = React.useState<'email' | 'whatsapp' | 'sms'>('email');
  const [fuDialogOpen, setFuDialogOpen] = React.useState(false);
  const [fuForm, setFuForm] = React.useState({ scheduledAt: undefined as Date | undefined, type: 'call' as string, notes: '' });
  const [fuSaving, setFuSaving] = React.useState(false);
  const { data: fuResponse, refetch: refetchFu } = useApiQuery(() => leadsApi.getFollowUps(leadId), [leadId]);
  const { data: activitiesResponse } = useApiQuery(() => leadsApi.getActivities(leadId), [leadId]);

  if (loading) {
    return (
      <SheetContent className="w-[560px] sm:max-w-[560px] overflow-y-auto p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>Loading lead...</SheetTitle>
        </SheetHeader>
        <div className="p-6 flex items-center justify-center h-screen">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </SheetContent>
    );
  }

  if (error || !lead?.data) {
    return (
      <SheetContent className="w-[560px] sm:max-w-[560px] overflow-y-auto p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>Lead details</SheetTitle>
        </SheetHeader>
        <div className="p-6 flex items-center justify-center h-screen">
          <p className="text-sm text-muted-foreground">Failed to load lead</p>
        </div>
      </SheetContent>
    );
  }

  const leadData = lead.data;
  const followUps: any[] = Array.isArray(fuResponse?.data) ? fuResponse!.data : [];
  const activitiesData = activitiesResponse?.data;
  const activities: any[] = Array.isArray(activitiesData) ? activitiesData : (activitiesData?.data ?? []);

  return (
    <SheetContent className="w-[560px] sm:max-w-[560px] overflow-y-auto p-0">
      <div className="p-6 pb-3">
        <SheetHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <SheetTitle className="text-lg">{leadData.title}</SheetTitle>
              <p className="text-sm text-muted-foreground">{(leadData as any).contactName || leadData.contact?.name} · {(leadData as any).destinations?.join(', ') || leadData.destination || '—'}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={leadData.status} />
              <PriorityDot priority={leadData.priority} />
            </div>
          </div>
        </SheetHeader>

        {/* Action Buttons */}
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" variant="outline" className="flex-1" onClick={() => router.push(`/leads/${leadData.id}`)}>
            <ArrowUpRight className="h-3.5 w-3.5 mr-1.5" />
            View Details
          </Button>
          <Button size="sm" variant="outline" onClick={() => router.push(`/leads/${leadData.id}/edit`)}>
            Edit
          </Button>
        </div>

        {/* AI Score Bar */}
        {(leadData as any).aiScore && (
          <div className="mt-3 p-2 rounded-lg bg-muted/50 flex items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground">AI Score</span>
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-green-500" style={{ width: `${(leadData as any).aiScore}%` }} />
            </div>
            <span className="text-xs font-bold">{(leadData as any).aiScore}/100</span>
          </div>
        )}
      </div>

      <Tabs defaultValue="overview" className="flex-1">
        <div className="px-6 border-b">
          <TabsList className="h-9">
            <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
            <TabsTrigger value="timeline" className="text-xs">Timeline</TabsTrigger>
            <TabsTrigger value="itineraries" className="text-xs">Itineraries</TabsTrigger>
            <TabsTrigger value="documents" className="text-xs">Documents</TabsTrigger>
          </TabsList>
        </div>

        <div className="p-6">
          {/* Overview Tab */}
          <TabsContent value="overview" className="mt-0 space-y-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><p className="text-muted-foreground text-xs mb-1">Destination</p><p className="font-medium">{(leadData as any).destinations?.join(', ') || leadData.destination || '—'}</p></div>
              <div><p className="text-muted-foreground text-xs mb-1">Budget</p><p className="font-medium">{leadData.budget ? formatCurrency(leadData.budget) : '—'}</p></div>
              <div><p className="text-muted-foreground text-xs mb-1">Travel Date</p><p className="font-medium">{leadData.travelDate || '—'}</p></div>
              <div><p className="text-muted-foreground text-xs mb-1">Passengers</p><p className="font-medium">{(leadData as any).paxAdults ?? 0}A {((leadData as any).paxChildren ?? 0) > 0 ? `${(leadData as any).paxChildren}C ` : ''}{((leadData as any).paxInfants ?? 0) > 0 ? `${(leadData as any).paxInfants}I` : ''}</p></div>
              <div><p className="text-muted-foreground text-xs mb-1">Priority</p><div className="flex items-center gap-2"><PriorityDot priority={leadData.priority} /><span className="font-medium capitalize">{leadData.priority}</span></div></div>
              <div><p className="text-muted-foreground text-xs mb-1">Source</p><p className="font-medium capitalize">{leadData.source?.replace('_', ' ') || '—'}</p></div>
              <div><p className="text-muted-foreground text-xs mb-1">Assigned To</p><p className="font-medium">{(leadData as any).assignedUser?.name || '—'}</p></div>
              <div><p className="text-muted-foreground text-xs mb-1">Created</p><p className="font-medium">{new Date(leadData.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p></div>
            </div>

            <Separator />

            {/* Contact Info */}
            <div>
              <h4 className="text-sm font-semibold mb-3">Contact</h4>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Avatar><AvatarFallback>{getInitials((leadData as any).contactName || leadData.contact?.name || '')}</AvatarFallback></Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{(leadData as any).contactName || leadData.contact?.name || '—'}</p>
                  <p className="text-xs text-muted-foreground truncate">{(leadData as any).contactEmail || leadData.contact?.email} · {(leadData as any).contactPhone || leadData.contact?.phone}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-8 w-8" title="Call" onClick={(e) => { e.stopPropagation(); router.push(`/communication/calls/dial?phone=${encodeURIComponent((leadData as any).contactPhone || leadData.contact?.phone || '')}`); }}>
                    <Phone className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-8 w-8" title="WhatsApp" onClick={(e) => { e.stopPropagation(); setMsgChannel('whatsapp'); setMsgDialogOpen(true); }}>
                    <MessageCircle className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-8 w-8" title="Email" onClick={(e) => { e.stopPropagation(); setMsgChannel('email'); setMsgDialogOpen(true); }}>
                    <Mail className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            <Separator />

            {/* Follow-ups */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold">Follow-ups</h4>
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setFuDialogOpen(true)}><Plus className="h-3 w-3 mr-1" /> Add</Button>
              </div>
              <div className="space-y-2">
                {followUps.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No follow-ups yet</p>}
                {followUps.slice(0, 5).map((fu: any) => {
                  const sa = fu.scheduled_at || fu.scheduledAt;
                  const ca = fu.completed_at || fu.completedAt;
                  const isCompleted = fu.status === 'completed' || !!ca;
                  const isOverdue = !isCompleted && sa && new Date(sa) < new Date();
                  return (
                    <div key={fu.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 text-sm">
                      <div className={cn('h-8 w-8 rounded-full flex items-center justify-center text-xs',
                        isCompleted ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                        isOverdue ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                        'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400')}>
                        {fu.type === 'call' ? <Phone className="h-3.5 w-3.5" /> : fu.type === 'email' ? <Mail className="h-3.5 w-3.5" /> : <Calendar className="h-3.5 w-3.5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium capitalize">{fu.type} follow-up</p>
                        {fu.notes && <p className="text-xs text-muted-foreground truncate">{fu.notes}</p>}
                      </div>
                      <span className="text-[11px] text-muted-foreground shrink-0">{sa ? new Date(sa).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}</span>
                      {isCompleted && <Badge variant="secondary" className="text-[10px]">Done</Badge>}
                      {isOverdue && <Badge variant="outline" className="text-[10px] border-red-200 text-red-700">Overdue</Badge>}
                    </div>
                  );
                })}
              </div>
            </div>

            {(leadData as any).specialRequirements && (<><Separator /><div><h4 className="text-sm font-semibold mb-2">Special Requirements</h4><p className="text-sm text-muted-foreground">{(leadData as any).specialRequirements}</p></div></>)}
          </TabsContent>

          {/* SendMessageDialog for detail panel */}
          <SendMessageDialog
            open={msgDialogOpen}
            onOpenChange={setMsgDialogOpen}
            contact={{
              id: leadData.contactId || '',
              name: (leadData as any).contactName || leadData.contact?.name || '',
              email: (leadData as any).contactEmail || leadData.contact?.email || null,
              phone: (leadData as any).contactPhone || leadData.contact?.phone || null,
            }}
            defaultChannel={msgChannel}
          />

          {/* Timeline Tab */}
          <TabsContent value="timeline" className="mt-0">
            <div className="space-y-4">
              {activities.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No activity yet</p>
                </div>
              ) : (
                activities.map((activity: any, idx: number) => {
                  const actType = activity.type || '';
                  const actContent = activity.content || activity.description || `${actType} activity`;
                  const actCreatedBy = activity.created_by_name || activity.createdByName || activity.createdBy || activity.created_by || 'System';
                  const actCreatedAt = activity.created_at || activity.createdAt;
                  const iconMap: Record<string, React.ReactNode> = {
                    note: <MessageSquare className="h-3.5 w-3.5" />,
                    call: <Phone className="h-3.5 w-3.5" />,
                    email: <Mail className="h-3.5 w-3.5" />,
                    whatsapp: <MessageCircle className="h-3.5 w-3.5" />,
                    status_change: <ArrowUpRight className="h-3.5 w-3.5" />,
                    assignment: <Users className="h-3.5 w-3.5" />,
                  };
                  return (
                    <div key={activity.id || idx} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="h-8 w-8 rounded-full border-2 border-primary bg-primary/10 flex items-center justify-center">
                          {iconMap[actType] || <Briefcase className="h-3.5 w-3.5" />}
                        </div>
                        {idx < activities.length - 1 && <div className="flex-1 w-px bg-border mt-1 mb-1" />}
                      </div>
                      <div className="pb-4">
                        <p className="text-sm font-medium">{actContent}</p>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <span>{actCreatedBy}</span>
                          <span>·</span>
                          <span>{actCreatedAt ? new Date(actCreatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                          {actType && <Badge variant="outline" className="text-[10px] capitalize">{actType.replace('_', ' ')}</Badge>}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </TabsContent>

          {/* Itineraries Tab */}
          <TabsContent value="itineraries" className="mt-0">
            <div className="text-center py-8">
              <Briefcase className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No itineraries linked yet</p>
              <Button variant="outline" size="sm" className="mt-3"><Plus className="h-3.5 w-3.5 mr-1" />Create Itinerary</Button>
            </div>
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents" className="mt-0">
            <div className="text-center py-8">
              <ArrowUpRight className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No documents attached</p>
              <Button variant="outline" size="sm" className="mt-3"><Plus className="h-3.5 w-3.5 mr-1" />Upload Document</Button>
            </div>
          </TabsContent>
        </div>
      </Tabs>

      {/* Schedule Follow-up Dialog */}
      <Dialog open={fuDialogOpen} onOpenChange={setFuDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule Follow-up</DialogTitle>
            <DialogDescription>Schedule a follow-up for this lead.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
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
            <Button variant="outline" onClick={() => setFuDialogOpen(false)} disabled={fuSaving}>Cancel</Button>
            <Button disabled={fuSaving || !fuForm.scheduledAt} onClick={async () => {
              setFuSaving(true);
              try {
                await followUpsApi.create({
                  leadId: leadData.id,
                  scheduledAt: fuForm.scheduledAt!.toISOString(),
                  type: fuForm.type,
                  notes: fuForm.notes || undefined,
                } as any);
                toast.success('Follow-up scheduled');
                setFuDialogOpen(false);
                setFuForm({ scheduledAt: undefined, type: 'call', notes: '' });
                refetchFu();
              } catch { toast.error('Failed to schedule follow-up'); }
              finally { setFuSaving(false); }
            }}>
              {fuSaving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SheetContent>
  );
}

/* ─── Draggable Kanban Card ─── */
function DraggableKanbanCard({ lead }: { lead: any }) {
  const { openDetail } = useLeadStore();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead.id,
    data: { status: lead.status, leadId: lead.id },
  });

  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
    position: isDragging ? 'relative' as const : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Card
        className="cursor-grab hover:shadow-md transition-shadow active:cursor-grabbing"
        onClick={() => { if (!isDragging) openDetail(lead.id); }}
      >
        <CardContent className="p-3 space-y-2.5">
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{lead.title}</p>
              <p className="text-xs text-muted-foreground truncate">{lead.contactName || lead.contact?.name}</p>
            </div>
            <PriorityDot priority={lead.priority} />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{lead.destinations?.join(', ') || lead.destination}</span>
            <span className="font-medium text-foreground">{lead.budget ? formatCurrency(lead.budget) : '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Avatar className="h-5 w-5">
                <AvatarFallback className="text-[9px]">{getInitials(lead.assignedUser?.name || '')}</AvatarFallback>
              </Avatar>
              <span className="text-[11px] text-muted-foreground">{lead.assignedUser?.name?.split(' ')[0]}</span>
            </div>
            {lead.travelDate && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {new Date(lead.travelDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Kanban Column (droppable) ─── */
function KanbanColumn({ status, leads: columnLeads }: { status: string; leads: any[] }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column-${status}`,
    data: { status },
  });
  const label = LEAD_STATUS_LABELS[status as keyof typeof LEAD_STATUS_LABELS] || status;
  const color = LEAD_STATUS_COLORS[status as keyof typeof LEAD_STATUS_COLORS] || '#6B7280';

  return (
    <div className="flex flex-col w-72 shrink-0">
      <div className="flex items-center gap-2 mb-3 px-1">
        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        <h3 className="text-sm font-semibold">{label}</h3>
        <Badge variant="secondary" className="text-[10px] ml-auto">{columnLeads.length}</Badge>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 space-y-2 overflow-y-auto max-h-[calc(100vh-260px)] pr-1 min-h-[100px] rounded-lg transition-colors',
          isOver && 'bg-primary/5 ring-2 ring-primary/20',
        )}
      >
        {columnLeads.map((lead: any) => (
          <DraggableKanbanCard key={lead.id} lead={lead} />
        ))}
        {columnLeads.length === 0 && (
          <div className={cn(
            'text-center py-8 text-sm text-muted-foreground border-2 border-dashed rounded-lg transition-colors',
            isOver && 'border-primary/40 text-primary',
          )}>
            Drop leads here
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main Leads Page ─── */
export default function LeadsPage() {
  const router = useRouter();
  const {
    viewMode, setViewMode, filters, setFilter, selectedLeads,
    toggleLeadSelection, selectAllLeads, clearSelection,
    isDetailOpen, detailLeadId, openDetail, closeDetail,
  } = useLeadStore();

  // Message dialog state
  const [msgDialogOpen, setMsgDialogOpen] = React.useState(false);
  const [msgChannel, setMsgChannel] = React.useState<'email' | 'whatsapp' | 'sms'>('email');
  const [msgContact, setMsgContact] = React.useState<{ id: string; name: string; email?: string | null; phone?: string | null }>({ id: '', name: '' });

  // Bulk operations state
  const [isBulkDeleting, setIsBulkDeleting] = React.useState(false);
  const [isBulkExporting, setIsBulkExporting] = React.useState(false);
  const [bulkAssignDialogOpen, setBulkAssignDialogOpen] = React.useState(false);
  const [bulkAssignUserId, setBulkAssignUserId] = React.useState('');
  const [isBulkAssigning, setIsBulkAssigning] = React.useState(false);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = React.useState(false);

  // Follow-up dialog from 3-dot menu
  const [fuMenuDialogOpen, setFuMenuDialogOpen] = React.useState(false);
  const [fuMenuLeadId, setFuMenuLeadId] = React.useState<string | null>(null);
  const [fuMenuForm, setFuMenuForm] = React.useState({ scheduledAt: undefined as Date | undefined, type: 'call' as string, notes: '' });
  const [fuMenuSaving, setFuMenuSaving] = React.useState(false);

  // Lost reason dialog for kanban drag to 'lost'
  const [lostReasonDialogOpen, setLostReasonDialogOpen] = React.useState(false);
  const [lostReasonLeadId, setLostReasonLeadId] = React.useState<string | null>(null);
  const [lostReason, setLostReason] = React.useState('');

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  function openSendMessage(lead: any, channel: 'email' | 'whatsapp' | 'sms') {
    setMsgContact({
      id: lead.contactId || lead.contact?.id || '',
      name: lead.contactName || lead.contact?.name || '',
      email: lead.contactEmail || lead.contact?.email || null,
      phone: lead.contactPhone || lead.contact?.phone || null,
    });
    setMsgChannel(channel);
    setMsgDialogOpen(true);
  }

  async function handleBulkDelete() {
    setIsBulkDeleting(true);
    try {
      await leadsApi.bulkDelete({ leadIds: [...selectedLeads] });
      toast.success(`${selectedLeads.length} lead(s) deleted`);
      clearSelection();
      setBulkDeleteConfirmOpen(false);
      refetch();
    } catch {
      toast.error('Failed to delete leads');
    } finally {
      setIsBulkDeleting(false);
    }
  }

  // Fetch team users for bulk assign dropdown
  const { data: usersResponse } = useApiQuery(() => usersApi.list({ limit: 100 }), []);
  const usersData = usersResponse?.data;
  const teamUsers: any[] = Array.isArray(usersData) ? usersData : ((usersData as any)?.data ?? []);

  async function handleBulkAssign() {
    if (!bulkAssignUserId) {
      toast.error('Please select a team member');
      return;
    }
    setIsBulkAssigning(true);
    try {
      await leadsApi.bulkAssign({ leadIds: [...selectedLeads], assignedTo: bulkAssignUserId });
      toast.success(`${selectedLeads.length} lead(s) assigned`);
      clearSelection();
      setBulkAssignDialogOpen(false);
      setBulkAssignUserId('');
      refetch();
    } catch {
      toast.error('Failed to assign leads');
    } finally {
      setIsBulkAssigning(false);
    }
  }

  async function handleBulkExport() {
    setIsBulkExporting(true);
    try {
      const response = await exportsApi.leads();
      const blob = response instanceof Blob ? response : new Blob([response as any], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leads_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Leads exported successfully');
    } catch {
      toast.error('Failed to export leads');
    } finally {
      setIsBulkExporting(false);
    }
  }

  async function handleKanbanDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || !active) return;

    const leadId = active.id as string;
    const draggedLead = displayLeads.find((l: any) => l.id === leadId) as any;
    if (!draggedLead) return;

    let targetStatus: string | null = null;

    // Check if dropped on a column droppable zone (id format: "column-{status}")
    const overId = String(over.id);
    if (overId.startsWith('column-')) {
      targetStatus = overId.replace('column-', '');
    } else {
      // Dropped on another card — find its column
      const overData = over.data?.current as any;
      if (overData?.status) {
        targetStatus = overData.status;
      }
    }

    if (!targetStatus || targetStatus === draggedLead.status) return;

    // If target is 'lost', show lost reason dialog
    if (targetStatus === 'lost') {
      setLostReasonLeadId(leadId);
      setLostReason('');
      setLostReasonDialogOpen(true);
      return;
    }

    try {
      await leadsApi.updateStatus(leadId, { status: targetStatus });
      toast.success(`Lead moved to ${LEAD_STATUS_LABELS[targetStatus as keyof typeof LEAD_STATUS_LABELS] || targetStatus}`);
      refetch();
    } catch {
      toast.error('Failed to update lead status');
    }
  }

  async function handleLostReasonSubmit() {
    if (!lostReasonLeadId) return;
    try {
      await leadsApi.updateStatus(lostReasonLeadId, { status: 'lost', reason: lostReason });
      toast.success('Lead marked as lost');
      setLostReasonDialogOpen(false);
      setLostReasonLeadId(null);
      setLostReason('');
      refetch();
    } catch {
      toast.error('Failed to update lead status');
    }
  }

  const fetcher = React.useCallback((p: number, limit: number) =>
    leadsApi.list({
      page: p,
      limit,
      search: filters.search || undefined,
      status: filters.status.length > 0 ? filters.status[0] : undefined,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    }),
    [filters.search, filters.status],
  );

  const { items: allLeads, loading, loadingMore, hasMore, total, error, sentinelRef, refetch } = useInfiniteScroll({
    fetcher,
    limit: 30,
  });

  const filteredLeads = React.useMemo(() => {
    let result = [...allLeads];
    if (filters.priority.length > 0) {
      result = result.filter((l: any) => filters.priority.includes(l.priority));
    }
    return result;
  }, [allLeads, filters.priority]);

  const displayLeads = filteredLeads;

  const pipelineStatuses = ['new', 'contacted', 'qualified', 'proposal_sent', 'negotiation', 'won'];

  return (
    <div className="flex flex-col h-full">
      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-3 px-6 py-3 bg-amber-50 border-b border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-500 shrink-0" />
          <p className="text-sm text-amber-600 dark:text-amber-500">Using sample data — connect to backend for real data</p>
          <Button variant="ghost" size="sm" className="ml-auto h-6 text-xs" onClick={() => refetch()}>Retry</Button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Leads</h1>
          <p className="text-sm text-muted-foreground">{displayLeads.length} leads total</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => router.push('/leads/new')}>
            <Plus className="h-4 w-4 mr-1.5" /> New Lead
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search leads, contacts, destinations..."
            value={filters.search}
            onChange={(e) => setFilter('search', e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <Select
          value={filters.status.length === 1 ? filters.status[0] : 'all'}
          onValueChange={(v) => setFilter('status', v && v !== 'all' ? [v] : [])}
        >
          <SelectTrigger className="w-40 h-9">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(LEAD_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.priority.length === 1 ? filters.priority[0] : 'all'}
          onValueChange={(v) => setFilter('priority', v && v !== 'all' ? [v] : [])}
        >
          <SelectTrigger className="w-32 h-9">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="hot">Hot</SelectItem>
            <SelectItem value="warm">Warm</SelectItem>
            <SelectItem value="cold">Cold</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-1 border rounded-md p-0.5">
          <Button
            variant={viewMode === 'table' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 px-2"
            onClick={() => setViewMode('table')}
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'kanban' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 px-2"
            onClick={() => setViewMode('kanban')}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedLeads.length > 0 && (
        <div className="flex items-center gap-3 px-6 py-2 bg-primary/5 border-b">
          <span className="text-sm font-medium">{selectedLeads.length} selected</span>
          <Button variant="outline" size="sm" className="h-7" onClick={() => setBulkAssignDialogOpen(true)}>
            <UserPlus className="h-3.5 w-3.5 mr-1" /> Assign
          </Button>
          <Button variant="outline" size="sm" className="h-7" onClick={handleBulkExport} disabled={isBulkExporting}>
            {isBulkExporting ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1" />} Export
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-destructive hover:text-destructive" onClick={() => setBulkDeleteConfirmOpen(true)}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
          </Button>
          <Button variant="ghost" size="sm" className="h-7 ml-auto" onClick={clearSelection}>
            <X className="h-3.5 w-3.5 mr-1" /> Clear
          </Button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading leads...</p>
          </div>
        </div>
      )}

      {/* Content */}
      {!loading && (
        <div className="flex-1 overflow-auto">
          {viewMode === 'table' ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selectedLeads.length === displayLeads.length && displayLeads.length > 0}
                      onCheckedChange={(checked) =>
                        checked ? selectAllLeads(displayLeads.map((l: any) => l.id)) : clearSelection()
                      }
                    />
                  </TableHead>
                  <TableHead>Lead</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Travel Date</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayLeads.map((lead: any) => (
                  <TableRow
                    key={lead.id}
                    className="cursor-pointer group"
                    onClick={() => openDetail(lead.id)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedLeads.includes(lead.id)}
                        onCheckedChange={() => toggleLeadSelection(lead.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{lead.title}</p>
                        <p className="text-xs text-muted-foreground">{lead.destinations?.join(', ') || lead.destination}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-[10px]">{getInitials(lead.contactName || lead.contact?.name || '')}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{lead.contactName || lead.contact?.name}</span>
                      </div>
                    </TableCell>
                    <TableCell><StatusBadge status={lead.status} /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <PriorityDot priority={lead.priority} />
                        <span className="text-sm capitalize">{lead.priority}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium text-sm">
                      {lead.budget ? formatCurrency(lead.budget) : '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {lead.travelDate ? new Date(lead.travelDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Avatar className="h-5 w-5">
                          <AvatarFallback className="text-[9px]">{getInitials((lead as any).assignedUser?.name ?? '')}</AvatarFallback>
                        </Avatar>
                        <span className="text-xs">{(lead as any).assignedUser?.name?.split(' ')[0] ?? '—'}</span>
                      </div>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-0.5">
                        {/* Inline hover action icons */}
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          {(lead.contactPhone || lead.contact?.phone) && (
                            <Button variant="ghost" size="icon-sm" className="h-7 w-7" onClick={() => router.push(`/communication/calls/dial?phone=${encodeURIComponent(lead.contactPhone || lead.contact?.phone)}`)}>
                              <Phone className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {(lead.contactPhone || lead.contact?.phone) && (
                            <Button variant="ghost" size="icon-sm" className="h-7 w-7" onClick={() => openSendMessage(lead, 'whatsapp')}>
                              <MessageCircle className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {(lead.contactEmail || lead.contact?.email) && (
                            <Button variant="ghost" size="icon-sm" className="h-7 w-7" onClick={() => openSendMessage(lead, 'email')}>
                              <Mail className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openDetail(lead.id)}>View details</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => router.push(`/leads/${lead.id}/edit`)}>Edit</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setFuMenuLeadId(lead.id); setFuMenuDialogOpen(true); }}>Schedule follow-up</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={async () => {
                              try {
                                await leadsApi.delete(lead.id);
                                toast.success('Lead deleted');
                                refetch();
                              } catch { toast.error('Failed to delete lead'); }
                            }}>Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <DndContext sensors={sensors} collisionDetection={rectIntersection} onDragEnd={handleKanbanDragEnd}>
              <div className="flex gap-4 p-6 overflow-x-auto">
                {pipelineStatuses.map((status: any) => (
                  <KanbanColumn
                    key={status}
                    status={status}
                    leads={displayLeads.filter((l: any) => l.status === status)}
                  />
                ))}
              </div>
            </DndContext>
          )}
          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-4" />
          {loadingMore && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading more...</span>
            </div>
          )}
        </div>
      )}

      {/* Detail Sheet */}
      <Sheet open={isDetailOpen} onOpenChange={(open) => !open && closeDetail()}>
        {detailLeadId && <LeadDetailPanel leadId={detailLeadId} onClose={closeDetail} />}
      </Sheet>

      {/* Send Message Dialog */}
      <SendMessageDialog
        open={msgDialogOpen}
        onOpenChange={setMsgDialogOpen}
        contact={msgContact}
        defaultChannel={msgChannel}
      />

      {/* Bulk Delete Confirmation */}
      <Dialog open={bulkDeleteConfirmOpen} onOpenChange={setBulkDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selectedLeads.length} Lead(s)</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedLeads.length} selected lead(s)? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteConfirmOpen(false)} disabled={isBulkDeleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={isBulkDeleting}>
              {isBulkDeleting && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Delete {selectedLeads.length} Lead(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Assign Dialog */}
      <Dialog open={bulkAssignDialogOpen} onOpenChange={setBulkAssignDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign {selectedLeads.length} Lead(s)</DialogTitle>
            <DialogDescription>
              Select a team member to assign the selected leads to.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Assign To</Label>
              <Select value={bulkAssignUserId} onValueChange={setBulkAssignUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select team member" />
                </SelectTrigger>
                <SelectContent>
                  {teamUsers.map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkAssignDialogOpen(false)} disabled={isBulkAssigning}>Cancel</Button>
            <Button onClick={handleBulkAssign} disabled={isBulkAssigning || !bulkAssignUserId}>
              {isBulkAssigning && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lost Reason Dialog (for kanban drag to lost) */}
      <Dialog open={lostReasonDialogOpen} onOpenChange={setLostReasonDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mark Lead as Lost</DialogTitle>
            <DialogDescription>Please provide a reason for losing this lead.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Reason</Label>
              <Input
                placeholder="e.g., Budget too high, chose competitor..."
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setLostReasonDialogOpen(false); setLostReasonLeadId(null); }}>Cancel</Button>
            <Button onClick={handleLostReasonSubmit}>Mark as Lost</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule Follow-up Dialog (from 3-dot menu) */}
      <Dialog open={fuMenuDialogOpen} onOpenChange={setFuMenuDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule Follow-up</DialogTitle>
            <DialogDescription>Schedule a follow-up for this lead.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date & Time <span className="text-destructive">*</span></Label>
                <DateTimePicker
                  value={fuMenuForm.scheduledAt}
                  onChange={(d) => setFuMenuForm({ ...fuMenuForm, scheduledAt: d })}
                  placeholder="Pick date & time"
                  minDate={new Date()}
                />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={fuMenuForm.type} onValueChange={(v) => setFuMenuForm({ ...fuMenuForm, type: v })}>
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
                value={fuMenuForm.notes}
                onChange={(e) => setFuMenuForm({ ...fuMenuForm, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFuMenuDialogOpen(false)} disabled={fuMenuSaving}>Cancel</Button>
            <Button disabled={fuMenuSaving || !fuMenuForm.scheduledAt} onClick={async () => {
              if (!fuMenuLeadId || !fuMenuForm.scheduledAt) return;
              setFuMenuSaving(true);
              try {
                await followUpsApi.create({
                  leadId: fuMenuLeadId,
                  scheduledAt: fuMenuForm.scheduledAt.toISOString(),
                  type: fuMenuForm.type,
                  notes: fuMenuForm.notes || undefined,
                } as any);
                toast.success('Follow-up scheduled');
                setFuMenuDialogOpen(false);
                setFuMenuLeadId(null);
                setFuMenuForm({ scheduledAt: undefined, type: 'call', notes: '' });
              } catch { toast.error('Failed to schedule follow-up'); }
              finally { setFuMenuSaving(false); }
            }}>
              {fuMenuSaving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
