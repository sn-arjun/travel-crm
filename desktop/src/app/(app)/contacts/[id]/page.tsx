'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft, Phone, Mail, MessageSquare, FileText, MessageCircle, Building2, MapPin, Tag, Zap, User, TrendingUp, Clock,
  DollarSign, Eye, Send, Edit, Trash2, Loader2, AlertCircle, Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { cn } from '@/lib/utils';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { contactsApi, type UpdateContactRequest } from '@/lib/api/contacts';
import { leadsApi } from '@/lib/api/leads';
import { followUpsApi } from '@/lib/api/follow-ups';
import { invoicesApi } from '@/lib/api/invoices';
import { SendMessageDialog } from '@/components/communication/send-message-dialog';
import { toast } from 'sonner';
import { toLocalDateString } from '@/lib/dates';

const REF_DATE = Date.now();

function getInitials(name: string) {
  return name.split(' ').map((n: any) => n[0]).join('').toUpperCase().slice(0, 2);
}

function getStatusColor(status: string) {
  const colors: Record<string, string> = {
    new: 'bg-blue-100 text-blue-900',
    contacted: 'bg-purple-100 text-purple-900',
    qualified: 'bg-cyan-100 text-cyan-900',
    proposal_sent: 'bg-amber-100 text-amber-900',
    negotiation: 'bg-orange-100 text-orange-900',
    won: 'bg-green-100 text-green-900',
    lost: 'bg-red-100 text-red-900',
    on_hold: 'bg-gray-100 text-gray-900',
  };
  return colors[status] ?? 'bg-gray-100 text-gray-900';
}

interface Document {
  id: string;
  name: string;
  type: string;
  size: string;
  uploadedAt: string;
}

interface Invoice {
  id: string;
  number: string;
  amount: number;
  status: string;
  issuedAt: string;
  dueAt: string;
}

interface Payment {
  id: string;
  amount: number;
  method: string;
  date: string;
  reference: string;
}

export default function ContactDetailPage() {
  const router = useRouter();
  const params = useParams();
  const contactId = params.id as string;

  const [isEditDialogOpen, setIsEditDialogOpen] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [isSendDialogOpen, setIsSendDialogOpen] = React.useState(false);
  const [sendChannel, setSendChannel] = React.useState<'email' | 'whatsapp' | 'sms' | undefined>(undefined);
  const [editForm, setEditForm] = React.useState<UpdateContactRequest>({});

  const { data: contactResponse, loading, error, refetch } = useApiQuery(
    () => contactsApi.getById(contactId),
    [contactId],
  );

  const { data: leadsResponse } = useApiQuery(
    () => leadsApi.list({ page: 1, limit: 100 }),
    [],
  );

  const { data: followUpsResponse } = useApiQuery(
    () => followUpsApi.list({ page: 1, limit: 100 }),
    [],
  );

  const { data: invoicesResponse, loading: invoicesLoading } = useApiQuery(
    () => invoicesApi.list({ contactId }),
    [contactId],
  );

  const { mutate: updateContact, loading: isUpdating } = useApiMutation<UpdateContactRequest, any>(
    (data) => contactsApi.update(contactId, data),
  );

  const { mutate: deleteContact, loading: isDeleting } = useApiMutation<string, any>(
    (id) => contactsApi.delete(id),
  );

  const contact = contactResponse?.data;
  const leadsData = leadsResponse?.data;
  const allLeads = Array.isArray(leadsData) ? leadsData : (leadsData?.data ?? []);
  const contactLeads = allLeads.filter((l: any) => l.contactId === contactId);

  const followUpsData = followUpsResponse?.data;
  const allFollowUps = Array.isArray(followUpsData) ? followUpsData : (followUpsData?.data ?? []);
  const contactFollowUps = allFollowUps.filter((f: any) =>
    contactLeads.some((l: any) => l.id === f.leadId)
  );

  // Initialize edit form when contact loads
  React.useEffect(() => {
    if (contact) {
      setEditForm({
        name: (contact as any)?.name || undefined,
        email: contact.email || undefined,
        phone: contact.phone || undefined,
        type: contact.type as any,
        notes: (contact as any).notes || undefined,
        tags: contact.tags || [],
      });
    }
  }, [contact]);

  // Calculate stats
  const wonLeads = contactLeads.filter((l: any) => l.status === 'won').length;
  const totalRevenue = contactLeads.reduce((sum: number, l: any) => sum + (l.budget || 0), 0);
  const lastInteractionDate = contactFollowUps.length > 0
    ? new Date(contactFollowUps[0]!.scheduledAt).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
    : 'Never';

  // Generate mock itineraries from leads
  const itineraries = contactLeads.map((lead: any) => ({
    id: `itinerary-${lead.id}`,
    title: `${lead.destination} Itinerary`,
    destination: lead.destination,
    travelDate: lead.travelDate,
    returnDate: lead.returnDate,
    leadId: lead.id,
    pax: lead.paxAdults + lead.paxChildren,
  }));

  // Invoices from API
  const invoicesData = invoicesResponse?.data;
  const invoices: Invoice[] = (() => {
    const raw = Array.isArray(invoicesData) ? invoicesData : (invoicesData?.data ?? []);
    return raw.map((inv: any) => ({
      id: inv.id,
      number: inv.invoiceNumber || inv.invoice_number || '—',
      amount: inv.totalAmount || inv.total || 0,
      status: inv.status || 'draft',
      issuedAt: inv.issueDate || inv.createdAt || '',
      dueAt: inv.dueDate || inv.due_date || '',
    }));
  })();

  // Generate mock payments
  const payments: Payment[] = Array.from({ length: 4 }, (_, i) => ({
    id: `pay-${i + 1}`,
    amount: (contactLeads[i % contactLeads.length]?.budget ?? 100000) * 0.5,
    method: ['bank_transfer', 'credit_card', 'upi'][i % 3] ?? 'bank_transfer',
    date: toLocalDateString(new Date(REF_DATE - i * 15 * 86400000)),
    reference: `REF-${String(Math.abs((contactId ?? '').charCodeAt(0) + i)).slice(-6)}`,
  }));

  // Generate mock documents
  const documents: Document[] = Array.from({ length: 6 }, (_, i) => ({
    id: `doc-${i + 1}`,
    name: ['Proposal.pdf', 'Contract.docx', 'Invoice.pdf', 'Passport.jpg', 'Address Proof.pdf', 'Quote.xlsx'][i] ?? 'Document',
    type: ['PDF', 'DOCX', 'PDF', 'JPG', 'PDF', 'XLSX'][i] ?? 'PDF',
    size: ['2.4 MB', '1.2 MB', '850 KB', '3.2 MB', '1.8 MB', '450 KB'][i] ?? '0 KB',
    uploadedAt: toLocalDateString(new Date(REF_DATE - i * 10 * 86400000)),
  }));

  async function handleSaveEdit() {
    const result = await updateContact(editForm);
    if (result) {
      toast.success('Contact updated successfully');
      setIsEditDialogOpen(false);
      refetch();
    } else {
      toast.error('Failed to update contact');
    }
  }

  async function handleDelete() {
    const result = await deleteContact(contactId);
    if (result !== undefined) {
      toast.success('Contact deleted successfully');
      router.push('/contacts');
    } else {
      toast.error('Failed to delete contact');
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground">Loading contact...</p>
      </div>
    );
  }

  if (error || !contact) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-destructive">Failed to load contact</p>
        <Button variant="outline" onClick={() => router.push('/contacts')}>Back to Contacts</Button>
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
          <Avatar className="h-12 w-12">
            <AvatarFallback className="text-base">{getInitials(contact.name)}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              {contact.name}
            </h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {contact.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{contact.email}</span>}
              {contact.phone && (
                <button
                  type="button"
                  onClick={() => router.push(`/communication/calls/dial?phone=${encodeURIComponent(contact.phone!)}`)}
                  className="flex items-center gap-1 hover:text-primary"
                >
                  <Phone className="h-3 w-3" />{contact.phone}
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {contact.phone && (
            <Button variant="outline" size="sm" onClick={() => router.push(`/communication/calls/dial?phone=${encodeURIComponent(contact.phone!)}`)}>
              <Phone className="h-4 w-4 mr-1.5" /> Call
            </Button>
          )}
          {contact.email && (
            <Button variant="outline" size="sm" onClick={() => { setSendChannel('email'); setIsSendDialogOpen(true); }}>
              <Send className="h-4 w-4 mr-1.5" /> Email
            </Button>
          )}
          {contact.phone && (
            <Button variant="outline" size="sm" onClick={() => { setSendChannel('whatsapp'); setIsSendDialogOpen(true); }}>
              <MessageCircle className="h-4 w-4 mr-1.5" /> WhatsApp
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => { setSendChannel(undefined); setIsSendDialogOpen(true); }}>
            <Mail className="h-4 w-4 mr-1.5" /> Message
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIsEditDialogOpen(true)}>
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
            <Zap className="h-5 w-5 mx-auto text-blue-500 mb-1" />
            <p className="text-2xl font-bold">{contactLeads.length}</p>
            <p className="text-xs text-muted-foreground">Total Leads</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <TrendingUp className="h-5 w-5 mx-auto text-green-500 mb-1" />
            <p className="text-2xl font-bold">{wonLeads}</p>
            <p className="text-xs text-muted-foreground">Won Leads</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <DollarSign className="h-5 w-5 mx-auto text-amber-500 mb-1" />
            <p className="text-2xl font-bold">₹{(totalRevenue / 100000).toFixed(1)}L</p>
            <p className="text-xs text-muted-foreground">Total Revenue</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Clock className="h-5 w-5 mx-auto text-purple-500 mb-1" />
            <p className="text-2xl font-bold">{lastInteractionDate}</p>
            <p className="text-xs text-muted-foreground">Last Interaction</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="flex-1 flex flex-col">
        <div className="px-6 pt-3 border-b">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="leads">Leads ({contactLeads.length})</TabsTrigger>
            <TabsTrigger value="itineraries">Itineraries ({itineraries.length})</TabsTrigger>
            <TabsTrigger value="invoices">Invoices</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="communications">Communications</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {/* Overview Tab */}
          <TabsContent value="overview" className="mt-0">
            <div className="max-w-4xl space-y-6">
              {/* Contact Information */}
              <Card>
                <CardHeader><CardTitle className="text-base">Contact Information</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="text-xs text-muted-foreground font-semibold">Email</label>
                      <p className="text-sm font-medium flex items-center gap-2 mt-1">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        {contact.email || '—'}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground font-semibold">Phone</label>
                      <p className="text-sm font-medium flex items-center gap-2 mt-1">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        {contact.phone ? (
                          <button
                            type="button"
                            onClick={() => router.push(`/communication/calls/dial?phone=${encodeURIComponent(contact.phone!)}`)}
                            className="hover:text-primary hover:underline"
                          >
                            {contact.phone}
                          </button>
                        ) : '—'}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground font-semibold">Type</label>
                      <Badge variant="outline" className="mt-1 text-xs capitalize">{contact.type}</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Tags */}
              {(contact.tags ?? []).length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-base">Tags</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {(contact.tags ?? []).map((tag: any) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          <Tag className="h-3 w-3 mr-1" />
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Notes */}
              {contact.notes && (
                <Card>
                  <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{contact.notes}</p>
                  </CardContent>
                </Card>
              )}

              {/* Meta */}
              <Card>
                <CardHeader><CardTitle className="text-base">Timeline</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p>Created {new Date(contact.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  <p>Last updated {new Date(contact.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Leads Tab */}
          <TabsContent value="leads" className="mt-0">
            <div className="max-w-5xl">
              {contactLeads.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <Zap className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No leads for this contact yet</p>
                  </CardContent>
                </Card>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Destination</TableHead>
                      <TableHead>Travel Date</TableHead>
                      <TableHead>Budget</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Assigned To</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contactLeads.map((lead: any) => (
                      <TableRow key={lead.id} className="cursor-pointer hover:bg-muted/50">
                        <TableCell className="font-medium text-sm">{lead.title}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{lead.destination}</TableCell>
                        <TableCell className="text-sm">
                          {lead.travelDate ? new Date(lead.travelDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {lead.budget ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: lead.currency ?? 'INR', maximumFractionDigits: 0 }).format(lead.budget) : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge className={cn('text-xs', getStatusColor(lead.status))}>{lead.status.replace('_', ' ')}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize">{lead.priority}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{lead.assignedUser?.name ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>

          {/* Itineraries Tab */}
          <TabsContent value="itineraries" className="mt-0">
            <div className="max-w-4xl space-y-3">
              {itineraries.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No itineraries yet</p>
                  </CardContent>
                </Card>
              ) : (
                itineraries.map((itin: any) => (
                  <Card key={itin.id} className="cursor-pointer hover:shadow-sm transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-semibold text-sm">{itin.title}</h3>
                          <p className="text-xs text-muted-foreground mt-1">{itin.destination}</p>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {itin.pax} pax
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                        <span>
                          {itin.travelDate ? new Date(itin.travelDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'} -
                          {' '}
                          {itin.returnDate ? new Date(itin.returnDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          {/* Invoices Tab */}
          <TabsContent value="invoices" className="mt-0">
            <div className="max-w-5xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Invoices</h3>
                <Button size="sm" onClick={() => router.push(`/invoices/new?contactId=${contactId}`)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Create Invoice
                </Button>
              </div>
              {invoicesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : invoices.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No invoices for this contact yet</p>
                  </CardContent>
                </Card>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Issued Date</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((inv: any) => (
                      <TableRow key={inv.id} className="cursor-pointer hover:bg-muted/50" onClick={() => router.push(`/invoices/${inv.id}`)}>
                        <TableCell className="font-medium text-sm">{inv.number}</TableCell>
                        <TableCell className="font-mono text-sm">
                          {inv.amount ? `₹${inv.amount.toLocaleString('en-IN')}` : '—'}
                        </TableCell>
                        <TableCell className="text-sm">
                          {inv.issuedAt ? new Date(inv.issuedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                        </TableCell>
                        <TableCell className="text-sm">
                          {inv.dueAt ? new Date(inv.dueAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={cn('text-xs', {
                              'bg-green-100 text-green-900': inv.status === 'paid',
                              'bg-amber-100 text-amber-900': inv.status === 'pending' || inv.status === 'sent' || inv.status === 'draft',
                              'bg-red-100 text-red-900': inv.status === 'overdue',
                            })}
                          >
                            {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>

          {/* Payments Tab */}
          <TabsContent value="payments" className="mt-0">
            <div className="max-w-5xl">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Reference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((pay: any) => (
                    <TableRow key={pay.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell className="font-mono font-semibold text-sm">₹{pay.amount.toLocaleString('en-IN')}</TableCell>
                      <TableCell className="text-sm capitalize">{pay.method.replace('_', ' ')}</TableCell>
                      <TableCell className="text-sm">
                        {new Date(pay.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{pay.reference}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* Communications Tab */}
          <TabsContent value="communications" className="mt-0">
            <div className="max-w-3xl space-y-3">
              {contactFollowUps.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No communications yet</p>
                  </CardContent>
                </Card>
              ) : (
                contactFollowUps.map((fu: any) => {
                  const isCompleted = !!fu.completedAt;
                  return (
                    <Card key={fu.id} className={cn('cursor-pointer hover:shadow-sm transition-shadow', isCompleted && 'opacity-75')}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs capitalize">{fu.type}</Badge>
                              {isCompleted && <Badge className="text-xs bg-green-100 text-green-900">Completed</Badge>}
                            </div>
                            <p className="text-sm font-medium mt-2">{fu.notes}</p>
                            <p className="text-xs text-muted-foreground mt-2">
                              Scheduled: {new Date(fu.scheduledAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </p>
                            {isCompleted && (
                              <p className="text-xs text-muted-foreground">
                                Completed: {new Date(fu.completedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">{fu.user?.name ?? '—'}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents" className="mt-0">
            <div className="max-w-5xl">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Document Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((doc: any) => (
                    <TableRow key={doc.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell className="font-medium text-sm flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        {doc.name}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{doc.type}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{doc.size}</TableCell>
                      <TableCell className="text-sm">
                        {new Date(doc.uploadedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon-sm" disabled>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* Timeline Tab */}
          <TabsContent value="timeline" className="mt-0">
            <div className="max-w-2xl space-y-4">
              {contactFollowUps.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No activity yet</p>
                  </CardContent>
                </Card>
              ) : (
                contactFollowUps.map((fu: any, idx: number) => (
                  <div key={fu.id} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="h-10 w-10 rounded-full border-2 border-primary bg-primary/10 flex items-center justify-center">
                        {fu.type === 'call' ? <Phone className="h-5 w-5" /> : <Mail className="h-5 w-5" />}
                      </div>
                      {idx < contactFollowUps.length - 1 && <div className="flex-1 w-px bg-border mt-2 mb-2" style={{ height: '60px' }} />}
                    </div>
                    <div className="pb-4 pt-1">
                      <h4 className="text-sm font-semibold capitalize">{fu.type}</h4>
                      <p className="text-sm text-muted-foreground mt-1">{fu.notes}</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {new Date(fu.scheduledAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                      {fu.completedAt && (
                        <p className="text-xs text-green-600 mt-1">Completed</p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </TabsContent>
        </div>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Contact</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Full Name</Label>
              <Input
                id="edit-name"
                value={editForm.name ?? ''}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={editForm.email ?? ''}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input
                id="edit-phone"
                value={editForm.phone ?? ''}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                value={editForm.notes ?? ''}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} disabled={isUpdating}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={isUpdating}>
              {isUpdating ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogTitle>Delete Contact</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete {contact.name}? This action cannot be undone and will remove all associated data.
          </DialogDescription>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="outline" disabled={isDeleting} onClick={() => setIsDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Send Message Dialog (Communication Hub) */}
      <SendMessageDialog
        open={isSendDialogOpen}
        onOpenChange={setIsSendDialogOpen}
        contact={{ id: contactId, name: contact.name, email: contact.email, phone: contact.phone }}
        defaultChannel={sendChannel}
      />
    </div>
  );
}
