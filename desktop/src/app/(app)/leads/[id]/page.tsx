'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Loader2, AlertCircle, Pencil, Trash2, Phone, Plus, FileText, Briefcase, Car,
} from 'lucide-react';
import { DetailPage } from '@/components/domain';
import {
  Button, Tag, SectionCard, Input, Textarea, Label,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, DatePicker, CurrencyInput,
} from '@/components/ui';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { DateTimePicker } from '@/components/ui/date-picker';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { leadsApi, type UpdateLeadStatusRequest } from '@/lib/api/leads';
import { followUpsApi } from '@/lib/api/follow-ups';
import { invoicesApi } from '@/lib/api/invoices';
import { itinerariesApi } from '@/lib/api/itineraries';
import { documentsApi } from '@/lib/api/documents';
import { LEAD_STATUS_LABELS } from '@travelcrm/shared';
import { toast } from 'sonner';
import type { TimelineItem } from '@/components/ui/timeline';
import { unwrapList } from '@/lib/api/envelope';
import { formatDisplayDate, toLocalDateString } from '@/lib/dates';
import {
  leadDestination, leadSourceLabel, passengerSummary, priorityLabel, tripTypeLabel, type LeadRow,
} from '../lead-labels';

interface NoteRow { id: string; content: string; createdByName?: string; createdAt?: string }
interface ActivityRow {
  id?: string; type?: string; content?: string; description?: string;
  createdByName?: string; createdBy?: string; createdAt?: string; created_at?: string;
}
interface FollowUpRow {
  id: string; type?: string; notes?: string; status?: string; completedAt?: string | null;
  scheduled_at?: string; scheduledAt?: string;
}
interface InvoiceRow { id: string; invoiceNumber?: string; invoice_number?: string; status?: string; total?: number }
interface ItineraryRow { id: string; title?: string; status?: string }
interface DocRow { id: string; name?: string; file_name?: string }

function rowsOf<T>(res: unknown): T[] {
  return res ? unwrapList<T>(res).data : [];
}

function formatCurrency(amount: number, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

function statusTone(status: string): 'success' | 'danger' | 'info' | 'warning' | 'neutral' {
  if (status === 'won') return 'success';
  if (status === 'lost') return 'danger';
  if (status === 'proposal_sent' || status === 'negotiation') return 'warning';
  return 'info';
}

/** Short date for a note, or '' when the timestamp is missing/unparseable (never "Invalid Date"). */
function noteDate(value?: string): string {
  return value ? formatDisplayDate(value) : '';
}

export default function LeadDetailPage() {
  const router = useRouter();
  const params = useParams();
  const leadId = params.id as string;

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [isStatusDialogOpen, setIsStatusDialogOpen] = React.useState(false);
  const [isNoteDialogOpen, setIsNoteDialogOpen] = React.useState(false);
  const [isFollowUpDialogOpen, setIsFollowUpDialogOpen] = React.useState(false);
  const [newStatus, setNewStatus] = React.useState('');
  const [lostReason, setLostReason] = React.useState('');
  const [noteContent, setNoteContent] = React.useState('');
  const [followUpForm, setFollowUpForm] = React.useState({
    scheduledAt: undefined as Date | undefined,
    type: 'call' as 'call' | 'email' | 'whatsapp' | 'visit' | 'sms',
    notes: '',
  });

  const [isInvoiceDialogOpen, setIsInvoiceDialogOpen] = React.useState(false);
  const [invoiceForm, setInvoiceForm] = React.useState({
    type: 'proforma' as 'tax_invoice' | 'proforma' | 'receipt',
    dueDate: undefined as Date | undefined,
    items: [{ description: '', quantity: 1, rate: 0 }] as { description: string; quantity: number; rate: number }[],
    notes: '',
  });
  const [isCreatingInvoice, setIsCreatingInvoice] = React.useState(false);

  const [isItineraryDialogOpen, setIsItineraryDialogOpen] = React.useState(false);
  const [itineraryForm, setItineraryForm] = React.useState({ title: '', validityDate: undefined as Date | undefined, notes: '' });
  const [isCreatingItinerary, setIsCreatingItinerary] = React.useState(false);

  const [isDocUploadDialogOpen, setIsDocUploadDialogOpen] = React.useState(false);
  const [docForm, setDocForm] = React.useState({ file: null as File | null, name: '', category: 'general' });
  const [isUploadingDoc, setIsUploadingDoc] = React.useState(false);

  const { data: leadResponse, loading, error, refetch } = useApiQuery(() => leadsApi.getById(leadId), [leadId]);
  const { data: notesResponse, loading: notesLoading, refetch: refetchNotes } = useApiQuery(() => leadsApi.getNotes(leadId), [leadId]);
  const { data: activitiesResponse, loading: activitiesLoading } = useApiQuery(() => leadsApi.getActivities(leadId), [leadId]);
  const { data: followUpsResponse, refetch: refetchFollowUps } = useApiQuery(() => leadsApi.getFollowUps(leadId), [leadId]);
  const { data: invoicesResponse, refetch: refetchInvoices } = useApiQuery(() => invoicesApi.list({ leadId }), [leadId]);
  const { data: itinerariesResponse, refetch: refetchItineraries } = useApiQuery(() => itinerariesApi.list({ leadId }), [leadId]);
  const { data: documentsResponse, refetch: refetchDocuments } = useApiQuery(() => documentsApi.list({ leadId }), [leadId]);

  const { mutate: deleteLead, loading: isDeleting } = useApiMutation(() => leadsApi.delete(leadId));
  const { mutate: updateStatus, loading: isUpdatingStatus, error: statusError, reset: resetStatusError } = useApiMutation((data: UpdateLeadStatusRequest) => leadsApi.updateStatus(leadId, data));

  const lead = leadResponse?.data as LeadRow | undefined;
  const notes = rowsOf<NoteRow>(notesResponse);
  const activities = rowsOf<ActivityRow>(activitiesResponse);
  const followUps = rowsOf<FollowUpRow>(followUpsResponse);
  const invoicesList = rowsOf<InvoiceRow>(invoicesResponse);
  const itinerariesList = rowsOf<ItineraryRow>(itinerariesResponse);
  const documentsList = rowsOf<DocRow>(documentsResponse);
  const hasLiveItinerary = itinerariesList.some((i) => i.status !== 'rejected');
  const needsItinerary = newStatus === 'proposal_sent' && !hasLiveItinerary;

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
    if (newStatus === 'lost' && lostReason) data.reason = lostReason;
    if (needsItinerary) return;
    const result = await updateStatus(data);
    if (result) {
      toast.success('Status updated successfully');
      setIsStatusDialogOpen(false);
      setNewStatus('');
      setLostReason('');
      refetch();
    }
    // On failure the reason is shown inline in the dialog (statusError).
  }

  async function handleAddNote() {
    if (!noteContent.trim()) return;
    try {
      await leadsApi.createNote(leadId, { content: noteContent });
      toast.success('Note added');
      setNoteContent('');
      setIsNoteDialogOpen(false);
      refetchNotes();
    } catch { toast.error('Failed to add note'); }
  }

  async function handleDeleteNote(noteId: string) {
    try {
      await leadsApi.deleteNote(leadId, noteId);
      toast.success('Note deleted');
      refetchNotes();
    } catch { toast.error('Failed to delete note'); }
  }

  const [isCreatingFollowUp, setIsCreatingFollowUp] = React.useState(false);
  async function handleCreateFollowUp() {
    if (!followUpForm.scheduledAt) return;
    setIsCreatingFollowUp(true);
    try {
      await followUpsApi.create({
        leadId,
        scheduledAt: followUpForm.scheduledAt.toISOString(),
        type: followUpForm.type,
        notes: followUpForm.notes || undefined,
      });
      toast.success('Follow-up scheduled');
      setIsFollowUpDialogOpen(false);
      setFollowUpForm({ scheduledAt: undefined, type: 'call', notes: '' });
      refetchFollowUps();
    } catch { toast.error('Failed to create follow-up'); }
    finally { setIsCreatingFollowUp(false); }
  }

  async function handleCreateInvoice() {
    const validItems = invoiceForm.items.filter((i) => i.description && i.rate > 0);
    if (validItems.length === 0 || !lead) return;
    setIsCreatingInvoice(true);
    try {
      await invoicesApi.create({
        contactId: lead.contactId,
        leadId,
        type: invoiceForm.type,
        items: validItems,
        dueDate: invoiceForm.dueDate ? toLocalDateString(invoiceForm.dueDate) : undefined,
        notes: invoiceForm.notes || undefined,
      });
      toast.success('Invoice created');
      setIsInvoiceDialogOpen(false);
      setInvoiceForm({ type: 'proforma', dueDate: undefined, items: [{ description: '', quantity: 1, rate: 0 }], notes: '' });
      refetchInvoices();
    } catch { toast.error('Failed to create invoice'); }
    finally { setIsCreatingInvoice(false); }
  }

  async function handleCreateItinerary() {
    if (!itineraryForm.title) return;
    setIsCreatingItinerary(true);
    try {
      await itinerariesApi.create({
        leadId,
        title: itineraryForm.title,
        validityDate: itineraryForm.validityDate ? toLocalDateString(itineraryForm.validityDate) : undefined,
        notes: itineraryForm.notes || undefined,
        days: [{ dayNumber: 1, title: 'Day 1' }],
      });
      toast.success('Itinerary created');
      setIsItineraryDialogOpen(false);
      setItineraryForm({ title: '', validityDate: undefined, notes: '' });
      refetchItineraries();
    } catch { toast.error('Failed to create itinerary'); }
    finally { setIsCreatingItinerary(false); }
  }

  async function handleUploadDocument() {
    if (!docForm.file) return;
    setIsUploadingDoc(true);
    try {
      await documentsApi.upload({ file: docForm.file, name: docForm.name || docForm.file.name, category: docForm.category, leadId });
      toast.success('Document uploaded');
      setIsDocUploadDialogOpen(false);
      setDocForm({ file: null, name: '', category: 'general' });
      refetchDocuments();
    } catch { toast.error('Failed to upload document'); }
    finally { setIsUploadingDoc(false); }
  }

  if (loading) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-ds-foreground-muted" />
        <p className="text-ds-foreground-muted">Loading lead...</p>
      </div>
    );
  }

  if (error || !lead) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-4">
        <AlertCircle className="h-12 w-12 text-ds-danger" />
        <p className="text-ds-danger">Failed to load lead</p>
        <Button variant="outline" onClick={() => router.push('/leads')}>Back to Leads</Button>
      </div>
    );
  }

  const contactName = lead.contactName || lead.contact?.name || '—';
  const contactEmail = lead.contactEmail || lead.contact?.email || undefined;
  const contactPhone = lead.contactPhone || lead.contact?.phone || undefined;

  const activityItems: TimelineItem[] = activities.map((a, idx) => ({
    id: a.id || String(idx),
    title: a.content || a.description || `${a.type || 'activity'}`,
    description: a.createdByName || a.createdBy || undefined,
    timestamp: (a.createdAt || a.created_at) ? new Date((a.createdAt || a.created_at) as string).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '',
    tone: a.type === 'status_change' ? 'primary' : 'neutral',
  }));

  return (
    <>
      <DetailPage
        entity={lead}
        title={lead.title}
        subtitle={`${contactName} · ${leadDestination(lead)}`}
        status={<Tag tone={statusTone(lead.status)}>{LEAD_STATUS_LABELS[lead.status as keyof typeof LEAD_STATUS_LABELS] || lead.status}</Tag>}
        onBack={() => router.push('/leads')}
        primaryActions={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsStatusDialogOpen(true)}>Change Status</Button>
            <Button variant="outline" size="sm" onClick={() => router.push(`/fleet/trips/new?leadId=${leadId}&tripType=airport_pickup`)}>
              <Car aria-hidden="true" /> Book transfer
            </Button>
            {contactPhone && (
              <Button variant="outline" size="sm" onClick={() => router.push(`/communication/calls/dial?phone=${encodeURIComponent(contactPhone)}`)}>
                <Phone aria-hidden="true" /> Call
              </Button>
            )}
          </>
        }
        actions={[
          { label: 'Edit', icon: <Pencil aria-hidden="true" />, onSelect: () => router.push(`/leads/${leadId}/edit`) },
          { label: 'Add note', icon: <Plus aria-hidden="true" />, onSelect: () => setIsNoteDialogOpen(true) },
          { label: 'Schedule follow-up', icon: <Plus aria-hidden="true" />, onSelect: () => setIsFollowUpDialogOpen(true) },
          { label: 'Delete', icon: <Trash2 aria-hidden="true" />, destructive: true, separatorBefore: true, onSelect: () => setIsDeleteDialogOpen(true) },
        ]}
        messaging={{ recipientId: lead.contactId || '', recipientName: contactName, email: contactEmail, phone: contactPhone }}
        overview={
          <div className="flex flex-col gap-ds-4">
            <SectionCard title="Trip Details">
              <div className="grid gap-ds-6 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-ds-foreground-muted font-semibold">Destination</p>
                  <p className="text-sm font-medium mt-1">{leadDestination(lead)}</p>
                </div>
                <div>
                  <p className="text-xs text-ds-foreground-muted font-semibold">Trip Type</p>
                  <p className="text-sm font-medium mt-1">{tripTypeLabel(lead.tripType)}</p>
                </div>
                <div>
                  <p className="text-xs text-ds-foreground-muted font-semibold">Travel Date</p>
                  <p className="text-sm font-medium mt-1">{formatDisplayDate(lead.travelDate) || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-ds-foreground-muted font-semibold">Return Date</p>
                  <p className="text-sm font-medium mt-1">{formatDisplayDate(lead.returnDate) || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-ds-foreground-muted font-semibold">Passengers</p>
                  <p className="text-sm font-medium mt-1">{passengerSummary(lead.paxAdults, lead.paxChildren, lead.paxInfants)}</p>
                </div>
                <div>
                  <p className="text-xs text-ds-foreground-muted font-semibold">Budget</p>
                  <p className="text-sm font-medium mt-1">{lead.budget ? formatCurrency(lead.budget, lead.currency || 'INR') : '—'}</p>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Lead Details">
              <div className="grid gap-ds-6 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-ds-foreground-muted font-semibold">Priority</p>
                  <p className="text-sm font-medium mt-1">{priorityLabel(lead.priority)}</p>
                </div>
                <div>
                  <p className="text-xs text-ds-foreground-muted font-semibold">Source</p>
                  <p className="text-sm font-medium mt-1">{leadSourceLabel(lead.source)}</p>
                </div>
                <div>
                  <p className="text-xs text-ds-foreground-muted font-semibold">Assigned To</p>
                  <p className="text-sm font-medium mt-1">{lead.assignedUser?.name || lead.assignedToName || 'Unassigned'}</p>
                </div>
                <div>
                  <p className="text-xs text-ds-foreground-muted font-semibold">Created</p>
                  <p className="text-sm font-medium mt-1">{formatDisplayDate(lead.createdAt) || '—'}</p>
                </div>
              </div>
            </SectionCard>

            {lead.specialRequirements && (
              <SectionCard title="Special Requirements">
                <p className="text-sm text-ds-foreground-muted">{lead.specialRequirements}</p>
              </SectionCard>
            )}

            <SectionCard title="Notes" actions={<Button size="sm" variant="outline" onClick={() => setIsNoteDialogOpen(true)}><Plus aria-hidden="true" /> Add note</Button>}>
              {notesLoading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-ds-foreground-muted" /></div>
              ) : notes.length === 0 ? (
                <p className="text-sm text-ds-foreground-muted text-center py-4">No notes yet</p>
              ) : (
                <div className="flex flex-col gap-ds-3">
                  {notes.map((note) => (
                    <div key={note.id} className="flex items-start justify-between gap-ds-3 border-b border-ds-border pb-ds-3 last:border-0 last:pb-0">
                      <div>
                        <p className="text-sm">{note.content}</p>
                        <p className="text-xs text-ds-foreground-muted mt-1">{note.createdByName ?? 'Unknown'}{noteDate(note.createdAt) ? ` · ${noteDate(note.createdAt)}` : ''}</p>
                      </div>
                      <Button variant="ghost" size="icon-sm" aria-label="Delete note" onClick={() => handleDeleteNote(note.id)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Follow-ups" actions={<Button size="sm" variant="outline" onClick={() => setIsFollowUpDialogOpen(true)}><Plus aria-hidden="true" /> Schedule</Button>}>
              {followUps.length === 0 ? (
                <p className="text-sm text-ds-foreground-muted text-center py-4">No follow-ups scheduled</p>
              ) : (
                <div className="flex flex-col gap-ds-2">
                  {followUps.map((fu) => {
                    const scheduledAt = fu.scheduled_at || fu.scheduledAt;
                    const isCompleted = fu.status === 'completed' || !!fu.completedAt;
                    return (
                      <div key={fu.id} className="flex items-center justify-between text-sm">
                        <span className="capitalize">{fu.type} follow-up{fu.notes ? ` — ${fu.notes}` : ''}</span>
                        <div className="flex items-center gap-ds-2">
                          <span className="text-xs text-ds-foreground-muted">{scheduledAt ? formatDisplayDate(scheduledAt, 'short') : '—'}</span>
                          {isCompleted && <Tag tone="success">Done</Tag>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>
          </div>
        }
        activity={activityItems}
        activityLoading={activitiesLoading}
        related={[
          {
            title: 'Invoices',
            action: <Button size="sm" variant="outline" onClick={() => setIsInvoiceDialogOpen(true)}><Plus aria-hidden="true" /> Create invoice</Button>,
            content: invoicesList.length === 0 ? (
              <p className="text-sm text-ds-foreground-muted text-center py-4">No invoices linked to this lead yet</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoicesList.map((inv) => (
                    <TableRow key={inv.id} className="cursor-pointer hover:bg-ds-surface-sunken" onClick={() => router.push(`/invoices/${inv.id}`)}>
                      <TableCell className="text-sm font-medium">{inv.invoiceNumber || inv.invoice_number || '—'}</TableCell>
                      <TableCell><Tag tone="neutral">{inv.status || 'draft'}</Tag></TableCell>
                      <TableCell className="text-right text-sm">{inv.total ? formatCurrency(inv.total) : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ),
          },
          {
            title: 'Itineraries',
            action: <Button size="sm" variant="outline" onClick={() => setIsItineraryDialogOpen(true)}><Plus aria-hidden="true" /> Create itinerary</Button>,
            content: itinerariesList.length === 0 ? (
              <p className="text-sm text-ds-foreground-muted text-center py-4">No itineraries linked to this lead yet</p>
            ) : (
              <div className="flex flex-col gap-ds-2">
                {itinerariesList.map((itin) => (
                  <div key={itin.id} className="flex items-center justify-between p-ds-2 rounded-ds-md hover:bg-ds-surface-sunken cursor-pointer" onClick={() => router.push(`/itineraries/${itin.id}/edit`)}>
                    <div className="flex items-center gap-ds-2">
                      <Briefcase className="size-4 text-ds-foreground-muted" />
                      <span className="text-sm font-medium">{itin.title || 'Untitled'}</span>
                    </div>
                    <Tag tone="neutral">{itin.status || 'draft'}</Tag>
                  </div>
                ))}
              </div>
            ),
          },
        ]}
        documents={
          <div className="flex flex-col gap-ds-3">
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setIsDocUploadDialogOpen(true)}><Plus aria-hidden="true" /> Upload document</Button>
            </div>
            {documentsList.length === 0 ? (
              <p className="text-sm text-ds-foreground-muted text-center py-4">No documents attached</p>
            ) : (
              <div className="flex flex-col gap-ds-2">
                {documentsList.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between p-ds-2 rounded-ds-md hover:bg-ds-surface-sunken">
                    <div className="flex items-center gap-ds-2">
                      <FileText className="size-4 text-ds-foreground-muted" />
                      <span className="text-sm">{doc.name || doc.file_name || 'Document'}</span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={async () => {
                      try {
                        const blob = await documentsApi.download(doc.id);
                        const url = URL.createObjectURL(blob as Blob);
                        const a = document.createElement('a'); a.href = url; a.download = doc.name || 'document'; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
                      } catch { toast.error('Failed to download'); }
                    }}>Download</Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        }
      />

      {/* Status Change Dialog */}
      <Dialog open={isStatusDialogOpen} onOpenChange={(o) => { setIsStatusDialogOpen(o); if (!o) { resetStatusError(); setNewStatus(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Change Lead Status</DialogTitle>
            <DialogDescription>Current status: {LEAD_STATUS_LABELS[lead.status as keyof typeof LEAD_STATUS_LABELS] || lead.status}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>New Status</Label>
              <Select value={newStatus} onValueChange={(v) => { setNewStatus(v); resetStatusError(); }}>
                <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(LEAD_STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {needsItinerary && (
              <div role="alert" className="rounded-ds-md border border-ds-warning bg-ds-warning-subtle p-ds-3 text-sm text-ds-warning-on-subtle">
                <p>Create an itinerary before moving to Proposal Sent. The proposal is the itinerary you send to the customer.</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-ds-2"
                  onClick={() => { setIsStatusDialogOpen(false); setIsItineraryDialogOpen(true); }}
                >
                  <Plus aria-hidden="true" /> Create itinerary
                </Button>
              </div>
            )}
            {statusError && !needsItinerary && (
              <p role="alert" className="text-sm text-ds-danger">{statusError.message || 'Failed to update status'}</p>
            )}
            {newStatus === 'lost' && (
              <div className="space-y-2">
                <Label>Reason for Loss</Label>
                <Textarea placeholder="Why was this lead lost?" value={lostReason} onChange={(e) => setLostReason(e.target.value)} rows={3} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsStatusDialogOpen(false)} disabled={isUpdatingStatus}>Cancel</Button>
            <Button onClick={handleStatusChange} disabled={isUpdatingStatus || !newStatus || needsItinerary}>
              {isUpdatingStatus && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Update Status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Note Dialog */}
      <Dialog open={isNoteDialogOpen} onOpenChange={setIsNoteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Note</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Note Content</Label>
            <Textarea placeholder="Write your note..." value={noteContent} onChange={(e) => setNoteContent(e.target.value)} rows={4} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNoteDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddNote} disabled={!noteContent.trim()}>Add Note</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule Follow-up Dialog */}
      <Dialog open={isFollowUpDialogOpen} onOpenChange={setIsFollowUpDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Schedule Follow-up</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date & Time <span className="text-ds-danger">*</span></Label>
                <DateTimePicker value={followUpForm.scheduledAt} onChange={(d) => setFollowUpForm({ ...followUpForm, scheduledAt: d })} placeholder="Pick date & time" minDate={new Date()} />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={followUpForm.type} onValueChange={(v) => setFollowUpForm({ ...followUpForm, type: v as typeof followUpForm.type })}>
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
              <Textarea placeholder="What to discuss, follow up on..." value={followUpForm.notes} onChange={(e) => setFollowUpForm({ ...followUpForm, notes: e.target.value })} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFollowUpDialogOpen(false)} disabled={isCreatingFollowUp}>Cancel</Button>
            <Button onClick={handleCreateFollowUp} disabled={isCreatingFollowUp || !followUpForm.scheduledAt}>
              {isCreatingFollowUp && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
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
            <DialogDescription>Are you sure you want to delete &quot;{lead.title}&quot;? This action cannot be undone and will remove all associated notes, follow-ups, and activity history.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} disabled={isDeleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Delete Lead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Create Invoice Dialog */}
      <Dialog open={isInvoiceDialogOpen} onOpenChange={setIsInvoiceDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Invoice</DialogTitle>
            <DialogDescription>Create an invoice for {contactName}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Invoice Type</Label>
                <Select value={invoiceForm.type} onValueChange={(v) => setInvoiceForm({ ...invoiceForm, type: v as typeof invoiceForm.type })}>
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
                <DatePicker value={invoiceForm.dueDate} onChange={(d) => setInvoiceForm({ ...invoiceForm, dueDate: d })} placeholder="Pick due date" minDate={new Date()} />
              </div>
            </div>
            {invoiceForm.items.map((item, idx) => (
              <div key={idx} className="border border-ds-border rounded-ds-lg p-3 space-y-3">
                <Input placeholder="Description" value={item.description} onChange={(e) => {
                  const items = invoiceForm.items.map((it, i) => i === idx ? { ...it, description: e.target.value } : it);
                  setInvoiceForm({ ...invoiceForm, items });
                }} />
                <div className="grid grid-cols-2 gap-3">
                  <Input type="number" min={1} placeholder="Qty" value={item.quantity} onChange={(e) => {
                    const items = invoiceForm.items.map((it, i) => i === idx ? { ...it, quantity: Number(e.target.value) || 1 } : it);
                    setInvoiceForm({ ...invoiceForm, items });
                  }} />
                  <CurrencyInput placeholder="Rate" aria-label="Rate" value={item.rate || undefined} onChange={(v) => {
                    const items = invoiceForm.items.map((it, i) => i === idx ? { ...it, rate: v ?? 0 } : it);
                    setInvoiceForm({ ...invoiceForm, items });
                  }} />
                </div>
              </div>
            ))}
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={invoiceForm.notes} onChange={(e) => setInvoiceForm({ ...invoiceForm, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsInvoiceDialogOpen(false)} disabled={isCreatingInvoice}>Cancel</Button>
            <Button onClick={handleCreateInvoice} disabled={isCreatingInvoice || !invoiceForm.items.some((i) => i.description && i.rate > 0)}>
              {isCreatingInvoice && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Create Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Create Itinerary Dialog */}
      <Dialog open={isItineraryDialogOpen} onOpenChange={setIsItineraryDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Itinerary</DialogTitle>
            <DialogDescription>Create an itinerary for this lead.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title <span className="text-ds-danger">*</span></Label>
              <Input placeholder="e.g., Bali Family Trip 5N/6D" value={itineraryForm.title} onChange={(e) => setItineraryForm({ ...itineraryForm, title: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Valid Until</Label>
              <DatePicker value={itineraryForm.validityDate} onChange={(d) => setItineraryForm({ ...itineraryForm, validityDate: d })} placeholder="Pick validity date" minDate={new Date()} />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={itineraryForm.notes} onChange={(e) => setItineraryForm({ ...itineraryForm, notes: e.target.value })} rows={3} />
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
              <Label>File <span className="text-ds-danger">*</span></Label>
              <Input type="file" onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setDocForm({ ...docForm, file, name: file?.name || '' });
              }} />
            </div>
            <div className="space-y-2">
              <Label>Document Name</Label>
              <Input placeholder="e.g., Passport Copy" value={docForm.name} onChange={(e) => setDocForm({ ...docForm, name: e.target.value })} />
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
    </>
  );
}
