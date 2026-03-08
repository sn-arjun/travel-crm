'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft, Edit, Trash2, Loader2, AlertCircle, Phone, Mail, Calendar,
  DollarSign, TrendingUp, Clock, Users, MapPin, Briefcase, Plus,
  MessageSquare, CheckCircle2, XCircle, FileText, ArrowUpRight,
  MoreHorizontal, Eye, MessageCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { LEAD_STATUS_LABELS, LEAD_SOURCES } from '@travelcrm/shared';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { leadsApi, type UpdateLeadStatusRequest } from '@/lib/api/leads';
import { followUpsApi } from '@/lib/api/follow-ups';
import { toast } from 'sonner';
import { SendMessageDialog } from '@/components/communication/send-message-dialog';
import { DateTimePicker, DatePicker } from '@/components/ui/date-picker';
import { invoicesApi } from '@/lib/api/invoices';
import { itinerariesApi } from '@/lib/api/itineraries';
import { documentsApi } from '@/lib/api/documents';

function formatCurrency(amount: number, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

function getInitials(name: string) {
  if (!name) return '??';
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
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
    <Badge variant="outline" className={cn('border-transparent text-xs font-medium', colorMap[status])}>
      {LEAD_STATUS_LABELS[status as keyof typeof LEAD_STATUS_LABELS] || status}
    </Badge>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const colorMap: Record<string, string> = {
    hot: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    warm: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    cold: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  };
  return (
    <Badge variant="outline" className={cn('border-transparent text-xs font-medium capitalize', colorMap[priority])}>
      {priority}
    </Badge>
  );
}

export default function LeadDetailPage() {
  const router = useRouter();
  const params = useParams();
  const leadId = params.id as string;

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [isStatusDialogOpen, setIsStatusDialogOpen] = React.useState(false);
  const [isNoteDialogOpen, setIsNoteDialogOpen] = React.useState(false);
  const [isFollowUpDialogOpen, setIsFollowUpDialogOpen] = React.useState(false);
  const [msgDialogOpen, setMsgDialogOpen] = React.useState(false);
  const [msgChannel, setMsgChannel] = React.useState<'email' | 'whatsapp' | 'sms'>('email');

  const [newStatus, setNewStatus] = React.useState('');
  const [lostReason, setLostReason] = React.useState('');
  const [noteContent, setNoteContent] = React.useState('');
  const [followUpForm, setFollowUpForm] = React.useState({
    scheduledAt: undefined as Date | undefined,
    type: 'call' as 'call' | 'email' | 'whatsapp' | 'visit' | 'sms',
    notes: '',
  });

  // Invoice quick-create dialog
  const [isInvoiceDialogOpen, setIsInvoiceDialogOpen] = React.useState(false);
  const [invoiceForm, setInvoiceForm] = React.useState({
    type: 'proforma' as 'tax_invoice' | 'proforma' | 'receipt',
    dueDate: undefined as Date | undefined,
    items: [{ description: '', quantity: 1, rate: 0 }] as { description: string; quantity: number; rate: number }[],
    notes: '',
  });
  const [isCreatingInvoice, setIsCreatingInvoice] = React.useState(false);

  // Itinerary quick-create dialog
  const [isItineraryDialogOpen, setIsItineraryDialogOpen] = React.useState(false);
  const [itineraryForm, setItineraryForm] = React.useState({
    title: '',
    validityDate: undefined as Date | undefined,
    notes: '',
    days: [{ dayNumber: 1, title: '', city: '' }] as { dayNumber: number; title: string; city: string }[],
  });
  const [isCreatingItinerary, setIsCreatingItinerary] = React.useState(false);

  // Document upload dialog
  const [isDocUploadDialogOpen, setIsDocUploadDialogOpen] = React.useState(false);
  const [docForm, setDocForm] = React.useState({
    file: null as File | null,
    name: '',
    category: 'general' as string,
  });
  const [isUploadingDoc, setIsUploadingDoc] = React.useState(false);

  // Queries
  const { data: leadResponse, loading, error, refetch } = useApiQuery(
    () => leadsApi.getById(leadId),
    [leadId],
  );

  const { data: notesResponse, loading: notesLoading, refetch: refetchNotes } = useApiQuery(
    () => leadsApi.getNotes(leadId),
    [leadId],
  );

  const { data: activitiesResponse, loading: activitiesLoading } = useApiQuery(
    () => leadsApi.getActivities(leadId),
    [leadId],
  );

  const { data: followUpsResponse, loading: followUpsLoading, refetch: refetchFollowUps } = useApiQuery(
    () => leadsApi.getFollowUps(leadId),
    [leadId],
  );

  const { data: invoicesResponse, loading: invoicesLoading, refetch: refetchInvoices } = useApiQuery(
    () => invoicesApi.list({ leadId }),
    [leadId],
  );

  const { data: itinerariesResponse, loading: itinerariesLoading, refetch: refetchItineraries } = useApiQuery(
    () => itinerariesApi.list({ leadId }),
    [leadId],
  );

  const { data: documentsResponse, loading: documentsLoading, refetch: refetchDocuments } = useApiQuery(
    () => documentsApi.list({ leadId }),
    [leadId],
  );

  // Mutations
  const { mutate: deleteLead, loading: isDeleting } = useApiMutation<string, any>(
    () => leadsApi.delete(leadId),
  );

  const { mutate: updateStatus, loading: isUpdatingStatus } = useApiMutation<UpdateLeadStatusRequest, any>(
    (data) => leadsApi.updateStatus(leadId, data),
  );

  const [isCreatingFollowUp, setIsCreatingFollowUp] = React.useState(false);

  const lead = leadResponse?.data;
  const notesData = notesResponse?.data;
  const notes = Array.isArray(notesData) ? notesData : (notesData?.data ?? []);
  const activitiesData = activitiesResponse?.data;
  const activities = Array.isArray(activitiesData) ? activitiesData : (activitiesData?.data ?? []);
  const followUps = Array.isArray(followUpsResponse?.data) ? followUpsResponse!.data : [];
  const invoicesList: any[] = Array.isArray(invoicesResponse?.data) ? invoicesResponse!.data : (invoicesResponse?.data?.data ?? []);
  const itinerariesList: any[] = Array.isArray(itinerariesResponse?.data) ? itinerariesResponse!.data : (itinerariesResponse?.data?.data ?? []);
  const documentsList: any[] = Array.isArray(documentsResponse?.data) ? documentsResponse!.data : (documentsResponse?.data?.data ?? []);

  // Computed
  const daysSinceCreated = lead
    ? Math.floor((Date.now() - new Date(lead.createdAt).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  async function handleDelete() {
    const result = await deleteLead(leadId);
    if (result !== undefined) {
      toast.success('Lead deleted successfully');
      router.push('/leads');
    } else {
      toast.error('Failed to delete lead');
    }
  }

  async function handleStatusChange() {
    if (!newStatus) return;
    const data: UpdateLeadStatusRequest = { status: newStatus };
    if (newStatus === 'lost' && lostReason) {
      data.reason = lostReason;
    }
    const result = await updateStatus(data);
    if (result) {
      toast.success('Status updated successfully');
      setIsStatusDialogOpen(false);
      setNewStatus('');
      setLostReason('');
      refetch();
    } else {
      toast.error('Failed to update status');
    }
  }

  async function handleAddNote() {
    if (!noteContent.trim()) return;
    try {
      await leadsApi.createNote(leadId, { content: noteContent });
      toast.success('Note added');
      setNoteContent('');
      setIsNoteDialogOpen(false);
      refetchNotes();
    } catch {
      toast.error('Failed to add note');
    }
  }

  async function handleCreateFollowUp() {
    if (!followUpForm.scheduledAt) return;
    setIsCreatingFollowUp(true);
    try {
      await followUpsApi.create({
        leadId,
        scheduledAt: followUpForm.scheduledAt.toISOString(),
        type: followUpForm.type,
        notes: followUpForm.notes || undefined,
      } as any);
      toast.success('Follow-up scheduled');
      setIsFollowUpDialogOpen(false);
      setFollowUpForm({ scheduledAt: undefined, type: 'call', notes: '' });
      refetchFollowUps();
    } catch {
      toast.error('Failed to create follow-up');
    } finally {
      setIsCreatingFollowUp(false);
    }
  }

  async function handleCreateInvoice() {
    const validItems = invoiceForm.items.filter(i => i.description && i.rate > 0);
    if (validItems.length === 0 || !lead) return;
    setIsCreatingInvoice(true);
    try {
      await invoicesApi.create({
        contactId: lead.contactId,
        leadId,
        type: invoiceForm.type,
        items: validItems,
        dueDate: invoiceForm.dueDate?.toISOString(),
        notes: invoiceForm.notes || undefined,
      });
      toast.success('Invoice created');
      setIsInvoiceDialogOpen(false);
      setInvoiceForm({ type: 'proforma', dueDate: undefined, items: [{ description: '', quantity: 1, rate: 0 }], notes: '' });
      refetchInvoices();
    } catch {
      toast.error('Failed to create invoice');
    } finally {
      setIsCreatingInvoice(false);
    }
  }

  async function handleCreateItinerary() {
    if (!itineraryForm.title) return;
    setIsCreatingItinerary(true);
    try {
      await itinerariesApi.create({
        leadId,
        title: itineraryForm.title,
        validityDate: itineraryForm.validityDate?.toISOString(),
        notes: itineraryForm.notes || undefined,
        days: itineraryForm.days.map(d => ({
          dayNumber: d.dayNumber,
          title: d.title || `Day ${d.dayNumber}`,
          city: d.city || undefined,
        })),
      });
      toast.success('Itinerary created');
      setIsItineraryDialogOpen(false);
      setItineraryForm({ title: '', validityDate: undefined, notes: '', days: [{ dayNumber: 1, title: '', city: '' }] });
      refetchItineraries();
    } catch {
      toast.error('Failed to create itinerary');
    } finally {
      setIsCreatingItinerary(false);
    }
  }

  async function handleUploadDocument() {
    if (!docForm.file) return;
    setIsUploadingDoc(true);
    try {
      await documentsApi.upload({
        file: docForm.file,
        name: docForm.name || docForm.file.name,
        category: docForm.category,
        leadId,
      });
      toast.success('Document uploaded');
      setIsDocUploadDialogOpen(false);
      setDocForm({ file: null, name: '', category: 'general' });
      refetchDocuments();
    } catch {
      toast.error('Failed to upload document');
    } finally {
      setIsUploadingDoc(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground">Loading lead...</p>
      </div>
    );
  }

  if (error || !lead) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-destructive">Failed to load lead</p>
        <Button variant="outline" onClick={() => router.push('/leads')}>Back to Leads</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
                {lead.title}
              </h1>
              <StatusBadge status={lead.status} />
              <PriorityBadge priority={lead.priority} />
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
              {((lead as any).contactName || lead.contact?.name) && <span>{(lead as any).contactName || lead.contact?.name}</span>}
              {((lead as any).destinations?.length > 0 || lead.destination) && <><span>-</span><span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{(lead as any).destinations?.join(', ') || lead.destination}</span></>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsStatusDialogOpen(true)}>
            Change Status
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.push(`/leads/${leadId}/edit`)}>
            <Edit className="h-4 w-4 mr-1.5" /> Edit
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setIsDeleteDialogOpen(true)}>
            <Trash2 className="h-4 w-4 mr-1.5" /> Delete
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-4 px-6 py-4 border-b">
        <Card>
          <CardContent className="p-4 text-center">
            <DollarSign className="h-5 w-5 mx-auto text-green-500 mb-1" />
            <p className="text-2xl font-bold">{((lead as any).estimatedValue || lead.budget) ? formatCurrency((lead as any).estimatedValue || lead.budget, (lead as any).currency || 'INR') : '--'}</p>
            <p className="text-xs text-muted-foreground">Estimated Value</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <TrendingUp className="h-5 w-5 mx-auto text-blue-500 mb-1" />
            <p className="text-2xl font-bold">{(lead as any).probability ? `${(lead as any).probability}%` : '--'}</p>
            <p className="text-xs text-muted-foreground">Probability</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Calendar className="h-5 w-5 mx-auto text-amber-500 mb-1" />
            <p className="text-2xl font-bold">
              {lead.travelDate
                ? new Date(lead.travelDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                : '--'}
            </p>
            <p className="text-xs text-muted-foreground">Travel Date</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Clock className="h-5 w-5 mx-auto text-purple-500 mb-1" />
            <p className="text-2xl font-bold">{daysSinceCreated}</p>
            <p className="text-xs text-muted-foreground">Days in Pipeline</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="flex-1 flex flex-col">
        <div className="px-6 pt-3 border-b">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="notes">Notes ({notes.length})</TabsTrigger>
            <TabsTrigger value="follow-ups">Follow-ups ({followUps.length})</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="invoices">Invoices</TabsTrigger>
            <TabsTrigger value="itineraries">Itineraries</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {/* Overview Tab */}
          <TabsContent value="overview" className="mt-0">
            <div className="max-w-4xl space-y-6">
              {/* Contact Information */}
              <Card>
                <CardHeader><CardTitle className="text-base">Contact Information</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback>{getInitials((lead as any).contactName || lead.contact?.name || '')}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{(lead as any).contactName || lead.contact?.name || '--'}</p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground mt-0.5">
                        {((lead as any).contactEmail || lead.contact?.email) && (
                          <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{(lead as any).contactEmail || lead.contact?.email}</span>
                        )}
                        {((lead as any).contactPhone || lead.contact?.phone) && (
                          <a href={`tel:${(lead as any).contactPhone || lead.contact?.phone}`} className="flex items-center gap-1 hover:text-primary"><Phone className="h-3 w-3" />{(lead as any).contactPhone || lead.contact?.phone}</a>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {((lead as any).contactPhone || lead.contact?.phone) && (
                        <Button variant="outline" size="sm" onClick={() => router.push(`/communication/calls/dial?phone=${encodeURIComponent((lead as any).contactPhone || lead.contact?.phone)}`)}>
                          <Phone className="h-3.5 w-3.5 mr-1" /> Call
                        </Button>
                      )}
                      {((lead as any).contactPhone || lead.contact?.phone) && (
                        <Button variant="outline" size="sm" onClick={() => { setMsgChannel('whatsapp'); setMsgDialogOpen(true); }}>
                          <MessageCircle className="h-3.5 w-3.5 mr-1" /> WhatsApp
                        </Button>
                      )}
                      {((lead as any).contactEmail || lead.contact?.email) && (
                        <Button variant="outline" size="sm" onClick={() => { setMsgChannel('email'); setMsgDialogOpen(true); }}>
                          <Mail className="h-3.5 w-3.5 mr-1" /> Email
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => lead.contactId && router.push(`/contacts/${lead.contactId}`)}>
                        <Eye className="h-3.5 w-3.5 mr-1" /> View Contact
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Trip Details */}
              <Card>
                <CardHeader><CardTitle className="text-base">Trip Details</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="text-xs text-muted-foreground font-semibold">Destination</label>
                      <p className="text-sm font-medium mt-1">{(lead as any).destinations?.join(', ') || lead.destination || '--'}</p>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground font-semibold">Trip Type</label>
                      <p className="text-sm font-medium mt-1 capitalize">{(lead as any).tripType || '--'}</p>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground font-semibold">Travel Date</label>
                      <p className="text-sm font-medium mt-1">
                        {lead.travelDate ? new Date(lead.travelDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '--'}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground font-semibold">Return Date</label>
                      <p className="text-sm font-medium mt-1">
                        {(lead as any).returnDate ? new Date((lead as any).returnDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '--'}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground font-semibold">Passengers</label>
                      <p className="text-sm font-medium mt-1">
                        {(lead as any).paxAdults ?? 0} Adults
                        {((lead as any).paxChildren ?? 0) > 0 ? `, ${(lead as any).paxChildren} Children` : ''}
                        {((lead as any).paxInfants ?? 0) > 0 ? `, ${(lead as any).paxInfants} Infants` : ''}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground font-semibold">Budget</label>
                      <p className="text-sm font-medium mt-1">
                        {lead.budget ? formatCurrency(lead.budget, (lead as any).currency || 'INR') : '--'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Lead Details */}
              <Card>
                <CardHeader><CardTitle className="text-base">Lead Details</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="text-xs text-muted-foreground font-semibold">Source</label>
                      <p className="text-sm font-medium mt-1 capitalize">{lead.source?.replace('_', ' ') || '--'}</p>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground font-semibold">Assigned To</label>
                      <p className="text-sm font-medium mt-1">{(lead as any).assignedUser?.name || '--'}</p>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground font-semibold">Created</label>
                      <p className="text-sm font-medium mt-1">
                        {new Date(lead.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground font-semibold">Last Updated</label>
                      <p className="text-sm font-medium mt-1">
                        {new Date(lead.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Special Requirements */}
              {(lead as any).specialRequirements && (
                <Card>
                  <CardHeader><CardTitle className="text-base">Special Requirements</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{(lead as any).specialRequirements}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Notes Tab */}
          <TabsContent value="notes" className="mt-0">
            <div className="max-w-3xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Notes</h3>
                <Button size="sm" onClick={() => setIsNoteDialogOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Note
                </Button>
              </div>
              {notesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : notes.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No notes yet</p>
                  </CardContent>
                </Card>
              ) : (
                notes.map((note: any) => (
                  <Card key={note.id}>
                    <CardContent className="p-4">
                      <p className="text-sm">{note.content}</p>
                      <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                        <span>{note.createdBy || 'Unknown'}</span>
                        <span>-</span>
                        <span>{new Date(note.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          {/* Follow-ups Tab */}
          <TabsContent value="follow-ups" className="mt-0">
            <div className="max-w-3xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Follow-ups</h3>
                <Button size="sm" onClick={() => setIsFollowUpDialogOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Schedule Follow-up
                </Button>
              </div>
              {followUpsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : followUps.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No follow-ups scheduled</p>
                  </CardContent>
                </Card>
              ) : (
                followUps.map((fu: any) => {
                  const scheduledAt = fu.scheduled_at || fu.scheduledAt;
                  const completedAt = fu.completed_at || fu.completedAt;
                  const isCompleted = !!completedAt;
                  const isOverdue = !isCompleted && scheduledAt && new Date(scheduledAt) < new Date();
                  const fuType = fu.type || 'call';
                  const fuNotes = fu.notes || fu.content || '';
                  return (
                    <Card key={fu.id} className={cn(isCompleted && 'opacity-75')}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <div className={cn(
                              'h-9 w-9 rounded-full flex items-center justify-center mt-0.5',
                              isCompleted ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                              isOverdue ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                              'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
                            )}>
                              {isCompleted ? <CheckCircle2 className="h-4 w-4" /> :
                               isOverdue ? <XCircle className="h-4 w-4" /> :
                               fuType === 'call' ? <Phone className="h-4 w-4" /> :
                               fuType === 'email' ? <Mail className="h-4 w-4" /> :
                               <Clock className="h-4 w-4" />}
                            </div>
                            <div>
                              <p className="text-sm font-medium capitalize">{fuType} follow-up</p>
                              {fuNotes && <p className="text-xs text-muted-foreground mt-0.5">{fuNotes}</p>}
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className={cn('text-[10px]',
                                  isCompleted ? 'border-green-200 text-green-700' :
                                  isOverdue ? 'border-red-200 text-red-700' :
                                  'border-amber-200 text-amber-700',
                                )}>
                                  {isCompleted ? 'Completed' : isOverdue ? 'Overdue' : 'Pending'}
                                </Badge>
                                {scheduledAt && (
                                  <span className="text-xs text-muted-foreground">
                                    {new Date(scheduledAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          {!isCompleted && (
                            <Button variant="outline" size="sm" className="text-xs" onClick={async () => {
                              try {
                                await followUpsApi.complete(fu.id);
                                toast.success('Follow-up completed');
                                refetchFollowUps();
                              } catch { toast.error('Failed to complete'); }
                            }}>
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Complete
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </TabsContent>

          {/* Timeline Tab */}
          <TabsContent value="timeline" className="mt-0">
            <div className="max-w-2xl space-y-4">
              {activitiesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : activities.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No activity yet</p>
                  </CardContent>
                </Card>
              ) : (
                activities.map((activity: any, idx: number) => {
                  const actType = activity.type || '';
                  const actContent = activity.content || activity.description || `${actType} activity`;
                  const actCreatedBy = activity.created_by_name || activity.createdByName || activity.createdBy || activity.created_by || 'System';
                  const actCreatedAt = activity.created_at || activity.createdAt;
                  const iconMap: Record<string, React.ReactNode> = {
                    note: <MessageSquare className="h-4 w-4" />,
                    call: <Phone className="h-4 w-4" />,
                    email: <Mail className="h-4 w-4" />,
                    whatsapp: <MessageCircle className="h-4 w-4" />,
                    status_change: <ArrowUpRight className="h-4 w-4" />,
                    assignment: <Users className="h-4 w-4" />,
                  };
                  return (
                    <div key={activity.id} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="h-10 w-10 rounded-full border-2 border-primary bg-primary/10 flex items-center justify-center">
                          {iconMap[actType] || <Briefcase className="h-4 w-4" />}
                        </div>
                        {idx < activities.length - 1 && <div className="flex-1 w-px bg-border mt-2 mb-2" />}
                      </div>
                      <div className="pb-4 pt-1">
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

          {/* Invoices Tab */}
          <TabsContent value="invoices" className="mt-0">
            <div className="max-w-5xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Invoices</h3>
                <Button size="sm" onClick={() => setIsInvoiceDialogOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Create Invoice
                </Button>
              </div>
              {invoicesLoading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : invoicesList.length === 0 ? (
                <Card><CardContent className="p-8 text-center text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No invoices linked to this lead yet</p>
                </CardContent></Card>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {invoicesList.map((inv: any) => (
                      <TableRow key={inv.id} className="cursor-pointer hover:bg-muted/50" onClick={() => router.push(`/invoices/${inv.id}`)}>
                        <TableCell className="font-medium text-sm">{inv.invoiceNumber || inv.invoice_number || '—'}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px] capitalize">{inv.type?.replace('_', ' ') || 'Invoice'}</Badge></TableCell>
                        <TableCell><Badge variant="outline" className={cn('text-[10px] capitalize',
                          inv.status === 'paid' ? 'bg-green-100 text-green-700' :
                          inv.status === 'overdue' ? 'bg-red-100 text-red-700' :
                          'bg-amber-100 text-amber-700'
                        )}>{inv.status || 'draft'}</Badge></TableCell>
                        <TableCell className="text-right font-medium">{inv.total ? formatCurrency(inv.total) : '—'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{(inv.dueDate || inv.due_date) ? new Date(inv.dueDate || inv.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{(inv.createdAt || inv.created_at) ? new Date(inv.createdAt || inv.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>

          {/* Itineraries Tab */}
          <TabsContent value="itineraries" className="mt-0">
            <div className="max-w-4xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Itineraries</h3>
                <Button size="sm" onClick={() => setIsItineraryDialogOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Create Itinerary
                </Button>
              </div>
              {itinerariesLoading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : itinerariesList.length === 0 ? (
                <Card><CardContent className="p-8 text-center text-muted-foreground">
                  <Briefcase className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No itineraries linked to this lead yet</p>
                </CardContent></Card>
              ) : (
                itinerariesList.map((itin: any) => (
                  <Card key={itin.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push(`/itineraries/${itin.id}`)}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-semibold">{itin.title}</p>
                          {itin.notes && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{itin.notes}</p>}
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                            {(itin.validityDate || itin.validity_date) && <span>Valid until {new Date(itin.validityDate || itin.validity_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                            <span>{(itin.createdAt || itin.created_at) ? new Date(itin.createdAt || itin.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}</span>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-[10px] capitalize">{itin.status || 'draft'}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents" className="mt-0">
            <div className="max-w-5xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Documents</h3>
                <Button size="sm" onClick={() => setIsDocUploadDialogOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Upload Document
                </Button>
              </div>
              {documentsLoading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : documentsList.length === 0 ? (
                <Card><CardContent className="p-8 text-center text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No documents attached to this lead</p>
                </CardContent></Card>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {documentsList.map((doc: any) => (
                      <TableRow key={doc.id}>
                        <TableCell className="font-medium text-sm">{doc.name || doc.file_name || '—'}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px] capitalize">{doc.category || 'General'}</Badge></TableCell>
                        <TableCell className="text-sm text-muted-foreground">{doc.size ? `${(doc.size / 1024).toFixed(1)} KB` : '—'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{(doc.createdAt || doc.created_at || doc.uploadedAt || doc.uploaded_at) ? new Date(doc.createdAt || doc.created_at || doc.uploadedAt || doc.uploaded_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" className="text-xs" onClick={async () => {
                            try {
                              const blob = await documentsApi.download(doc.id);
                              const url = URL.createObjectURL(blob as any);
                              const a = document.createElement('a'); a.href = url; a.download = doc.name || 'document'; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
                            } catch { toast.error('Failed to download'); }
                          }}>
                            <ArrowUpRight className="h-3.5 w-3.5 mr-1" /> Download
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>
        </div>
      </Tabs>

      {/* Status Change Dialog */}
      <Dialog open={isStatusDialogOpen} onOpenChange={setIsStatusDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Change Lead Status</DialogTitle>
            <DialogDescription>
              Update the status of this lead. Current status: {LEAD_STATUS_LABELS[lead.status as keyof typeof LEAD_STATUS_LABELS] || lead.status}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>New Status</Label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(LEAD_STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {newStatus === 'lost' && (
              <div className="space-y-2">
                <Label>Reason for Loss</Label>
                <Textarea
                  placeholder="Why was this lead lost?"
                  value={lostReason}
                  onChange={(e) => setLostReason(e.target.value)}
                  rows={3}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsStatusDialogOpen(false)} disabled={isUpdatingStatus}>
              Cancel
            </Button>
            <Button onClick={handleStatusChange} disabled={isUpdatingStatus || !newStatus}>
              {isUpdatingStatus ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Update Status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Note Dialog */}
      <Dialog open={isNoteDialogOpen} onOpenChange={setIsNoteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Note Content</Label>
              <Textarea
                placeholder="Write your note..."
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNoteDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddNote} disabled={!noteContent.trim()}>
              Add Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule Follow-up Dialog */}
      <Dialog open={isFollowUpDialogOpen} onOpenChange={setIsFollowUpDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule Follow-up</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date & Time <span className="text-destructive">*</span></Label>
                <DateTimePicker
                  value={followUpForm.scheduledAt}
                  onChange={(d) => setFollowUpForm({ ...followUpForm, scheduledAt: d })}
                  placeholder="Pick date & time"
                  minDate={new Date()}
                />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={followUpForm.type} onValueChange={(v: any) => setFollowUpForm({ ...followUpForm, type: v })}>
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
                placeholder="What to discuss, follow up on..."
                value={followUpForm.notes}
                onChange={(e) => setFollowUpForm({ ...followUpForm, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFollowUpDialogOpen(false)} disabled={isCreatingFollowUp}>
              Cancel
            </Button>
            <Button onClick={handleCreateFollowUp} disabled={isCreatingFollowUp || !followUpForm.scheduledAt}>
              {isCreatingFollowUp ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Lead</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{lead.title}&quot;? This action cannot be undone and will remove all associated notes, follow-ups, and activity history.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Delete Lead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Message Dialog */}
      <SendMessageDialog
        open={msgDialogOpen}
        onOpenChange={setMsgDialogOpen}
        contact={{
          id: lead.contactId || '',
          name: (lead as any).contactName || lead.contact?.name || '',
          email: (lead as any).contactEmail || lead.contact?.email || null,
          phone: (lead as any).contactPhone || lead.contact?.phone || null,
        }}
        defaultChannel={msgChannel}
      />

      {/* Quick Create Invoice Dialog */}
      <Dialog open={isInvoiceDialogOpen} onOpenChange={setIsInvoiceDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Invoice</DialogTitle>
            <DialogDescription>
              Create an invoice for {(lead as any).contactName || lead.contact?.name || 'this lead'}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Invoice Type</Label>
                <Select value={invoiceForm.type} onValueChange={(v: any) => setInvoiceForm({ ...invoiceForm, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="proforma">Proforma</SelectItem>
                    <SelectItem value="tax_invoice">Tax Invoice</SelectItem>
                    <SelectItem value="receipt">Receipt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Due Date</Label>
                <DatePicker
                  value={invoiceForm.dueDate}
                  onChange={(d) => setInvoiceForm({ ...invoiceForm, dueDate: d })}
                  placeholder="Pick due date"
                  minDate={new Date()}
                />
              </div>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground">Line Items</p>
              <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setInvoiceForm({
                ...invoiceForm,
                items: [...invoiceForm.items, { description: '', quantity: 1, rate: 0 }],
              })}>
                <Plus className="h-3 w-3 mr-1" /> Add Item
              </Button>
            </div>
            {invoiceForm.items.map((item, idx) => (
              <div key={idx} className="border rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Item {idx + 1}</span>
                  {invoiceForm.items.length > 1 && (
                    <Button variant="ghost" size="icon-sm" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => {
                      setInvoiceForm({ ...invoiceForm, items: invoiceForm.items.filter((_, i) => i !== idx) });
                    }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                <div className="space-y-2">
                  <Input
                    placeholder="Description (e.g., Bali Tour Package 5N/6D)"
                    value={item.description}
                    onChange={(e) => {
                      const items = invoiceForm.items.map((it, i) => i === idx ? { description: e.target.value, quantity: it.quantity, rate: it.rate } : it);
                      setInvoiceForm({ ...invoiceForm, items });
                    }}
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Qty</Label>
                    <Input type="number" min={1} value={item.quantity} onChange={(e) => {
                      const items = invoiceForm.items.map((it, i) => i === idx ? { description: it.description, quantity: Number(e.target.value) || 1, rate: it.rate } : it);
                      setInvoiceForm({ ...invoiceForm, items });
                    }} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Rate</Label>
                    <Input type="number" min={0} placeholder="0" value={item.rate || ''} onChange={(e) => {
                      const items = invoiceForm.items.map((it, i) => i === idx ? { description: it.description, quantity: it.quantity, rate: Number(e.target.value) || 0 } : it);
                      setInvoiceForm({ ...invoiceForm, items });
                    }} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Subtotal</Label>
                    <p className="text-sm font-medium h-9 flex items-center">{formatCurrency(item.quantity * item.rate)}</p>
                  </div>
                </div>
              </div>
            ))}
            {invoiceForm.items.some(i => i.rate > 0) && (
              <div className="text-right">
                <span className="text-sm font-semibold">Grand Total: {formatCurrency(invoiceForm.items.reduce((sum, i) => sum + i.quantity * i.rate, 0))}</span>
              </div>
            )}
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Any additional notes..."
                value={invoiceForm.notes}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, notes: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsInvoiceDialogOpen(false)} disabled={isCreatingInvoice}>Cancel</Button>
            <Button onClick={handleCreateInvoice} disabled={isCreatingInvoice || !invoiceForm.items.some(i => i.description && i.rate > 0)}>
              {isCreatingInvoice && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Create Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Create Itinerary Dialog */}
      <Dialog open={isItineraryDialogOpen} onOpenChange={setIsItineraryDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Itinerary</DialogTitle>
            <DialogDescription>Create a multi-day itinerary for this lead.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Title <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="e.g., Bali Family Trip 5N/6D"
                  value={itineraryForm.title}
                  onChange={(e) => setItineraryForm({ ...itineraryForm, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Valid Until</Label>
                <DatePicker
                  value={itineraryForm.validityDate}
                  onChange={(d) => setItineraryForm({ ...itineraryForm, validityDate: d })}
                  placeholder="Pick validity date"
                  minDate={new Date()}
                />
              </div>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground">Days</p>
              <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setItineraryForm({
                ...itineraryForm,
                days: [...itineraryForm.days, { dayNumber: itineraryForm.days.length + 1, title: '', city: '' }],
              })}>
                <Plus className="h-3 w-3 mr-1" /> Add Day
              </Button>
            </div>
            {itineraryForm.days.map((day, idx) => (
              <div key={idx} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">Day {day.dayNumber}</span>
                  {itineraryForm.days.length > 1 && (
                    <Button variant="ghost" size="icon-sm" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => {
                      const days = itineraryForm.days.filter((_, i) => i !== idx).map((d, i) => ({ ...d, dayNumber: i + 1 }));
                      setItineraryForm({ ...itineraryForm, days });
                    }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    placeholder="Day title (e.g., Arrival & City Tour)"
                    value={day.title}
                    onChange={(e) => {
                      const days = itineraryForm.days.map((d, i) => i === idx ? { dayNumber: d.dayNumber, title: e.target.value, city: d.city } : d);
                      setItineraryForm({ ...itineraryForm, days });
                    }}
                  />
                  <Input
                    placeholder="City (e.g., Bali)"
                    value={day.city}
                    onChange={(e) => {
                      const days = itineraryForm.days.map((d, i) => i === idx ? { dayNumber: d.dayNumber, title: d.title, city: e.target.value } : d);
                      setItineraryForm({ ...itineraryForm, days });
                    }}
                  />
                </div>
              </div>
            ))}
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Any initial notes for this itinerary..."
                value={itineraryForm.notes}
                onChange={(e) => setItineraryForm({ ...itineraryForm, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsItineraryDialogOpen(false)} disabled={isCreatingItinerary}>Cancel</Button>
            <Button onClick={handleCreateItinerary} disabled={isCreatingItinerary || !itineraryForm.title}>
              {isCreatingItinerary && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Create Itinerary
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Document Dialog */}
      <Dialog open={isDocUploadDialogOpen} onOpenChange={setIsDocUploadDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
            <DialogDescription>Attach a document to this lead.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>File <span className="text-destructive">*</span></Label>
              <Input
                type="file"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setDocForm({ ...docForm, file, name: file?.name || '' });
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Document Name</Label>
              <Input
                placeholder="e.g., Passport Copy"
                value={docForm.name}
                onChange={(e) => setDocForm({ ...docForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={docForm.category} onValueChange={(v) => setDocForm({ ...docForm, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="passport">Passport</SelectItem>
                  <SelectItem value="visa">Visa</SelectItem>
                  <SelectItem value="ticket">Ticket</SelectItem>
                  <SelectItem value="voucher">Voucher</SelectItem>
                  <SelectItem value="contract">Contract</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDocUploadDialogOpen(false)} disabled={isUploadingDoc}>Cancel</Button>
            <Button onClick={handleUploadDocument} disabled={isUploadingDoc || !docForm.file}>
              {isUploadingDoc && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
