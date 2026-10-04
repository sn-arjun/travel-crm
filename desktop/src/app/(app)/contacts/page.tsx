'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, Phone, Mail, MessageCircle, Building2, MapPin, Calendar, Globe,
  ExternalLink, Send, Edit, Trash2, Zap, Clock, Loader2, Eye, Upload, Download, ListChecks,
} from 'lucide-react';
import { ListPage } from '@/components/domain';
import type { DataTableColumn } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { contactsApi, type UpdateContactRequest } from '@/lib/api/contacts';
import { leadsApi } from '@/lib/api/leads';
import { followUpsApi } from '@/lib/api/follow-ups';
import { SendMessageDialog } from '@/components/communication/send-message-dialog';
import { toast } from 'sonner';
import type { Contact } from '@travelcrm/shared';

function getInitials(name: string) {
  return name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
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

/* ─── Contact Detail Panel (drawer content) ─── */
function ContactDetailPanel({ contactId, onDeleted }: { contactId: string; onDeleted: () => void }) {
  const router = useRouter();
  const [isEditDialogOpen, setIsEditDialogOpen] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [isSendDialogOpen, setIsSendDialogOpen] = React.useState(false);
  const [sendChannel, setSendChannel] = React.useState<'email' | 'whatsapp' | 'sms' | undefined>(undefined);
  const [editForm, setEditForm] = React.useState<UpdateContactRequest>({});

  const { data: contactResponse, loading, error, refetch } = useApiQuery(() => contactsApi.getById(contactId), [contactId]);
  const { data: leadsResponse } = useApiQuery(() => leadsApi.list({ page: 1, limit: 100 }), []);
  const { data: followUpsResponse } = useApiQuery(() => followUpsApi.list({ page: 1, limit: 100 }), []);

  const { mutate: updateContact, loading: isUpdating } = useApiMutation<UpdateContactRequest, any>(
    (data) => contactsApi.update(contactId, data),
  );
  const { mutate: deleteContact, loading: isDeleting } = useApiMutation<string, any>(
    (id) => contactsApi.delete(id),
  );

  const contact = contactResponse?.data;

  React.useEffect(() => {
    if (contact) {
      setEditForm({
        name: contact.name || undefined,
        email: contact.email || undefined,
        phone: contact.phone || undefined,
        company: (contact as any).company || undefined,
        type: contact.type as any,
        notes: (contact as any).notes || undefined,
        tags: contact.tags || [],
      });
    }
  }, [contact]);

  const leadsData = leadsResponse?.data;
  const allLeads = Array.isArray(leadsData) ? leadsData : (leadsData?.data ?? []);
  const contactLeads = allLeads.filter((l: any) => l.contactId === contactId);

  const followUpsData = followUpsResponse?.data;
  const allFollowUps = Array.isArray(followUpsData) ? followUpsData : (followUpsData?.data ?? []);
  const contactFollowUps = allFollowUps.filter((f: any) =>
    contactLeads.some((l: any) => l.id === f.leadId)
  );

  const wonLeads = contactLeads.filter((l: any) => l.status === 'won').length;
  const totalRevenue = contactLeads.reduce((sum: number, l: any) => sum + (l.budget || 0), 0);

  async function handleSaveEdit() {
    const result = await updateContact(editForm);
    if (result) {
      toast.success('Contact updated');
      setIsEditDialogOpen(false);
      refetch();
    } else {
      toast.error('Failed to update contact');
    }
  }

  async function handleDelete() {
    const result = await deleteContact(contactId);
    if (result !== undefined) {
      toast.success('Contact deleted');
      setIsDeleteDialogOpen(false);
      onDeleted();
    } else {
      toast.error('Failed to delete contact');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-ds-foreground-muted" />
      </div>
    );
  }

  if (error || !contact) return null;

  return (
    <div className="flex flex-col">
      {/* Header with Avatar + Actions */}
      <div className="px-ds-1 pb-ds-4 border-b border-ds-border">
        <div className="flex items-center gap-ds-4">
          <Avatar className="h-14 w-14">
            <AvatarFallback className="text-lg font-semibold">{getInitials(contact.name)}</AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-ds-2 mt-0.5">
              <Badge variant="outline" className="text-[10px] capitalize">{contact.type}</Badge>
              {(contact as any).source && (
                <Badge variant="secondary" className="text-[10px] capitalize">{(contact as any).source}</Badge>
              )}
            </div>
          </div>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex items-center gap-ds-2 mt-ds-4 flex-wrap">
          <TooltipProvider delayDuration={300}>
            {contact.phone && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={() => router.push(`/communication/calls/dial?phone=${encodeURIComponent(contact.phone!)}`)}>
                    <Phone aria-hidden="true" /> Call
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Call {contact.phone}</TooltipContent>
              </Tooltip>
            )}
            {contact.phone && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={() => { setSendChannel('whatsapp'); setIsSendDialogOpen(true); }}>
                    <MessageCircle aria-hidden="true" /> WhatsApp
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Send WhatsApp via Communication Hub</TooltipContent>
              </Tooltip>
            )}
            {contact.email && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={() => { setSendChannel('email'); setIsSendDialogOpen(true); }}>
                    <Send aria-hidden="true" /> Email
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Send Email via Communication Hub</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={() => { setSendChannel(undefined); setIsSendDialogOpen(true); }}>
                  <Mail aria-hidden="true" /> Message
                </Button>
              </TooltipTrigger>
              <TooltipContent>Send message (choose channel)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={() => setIsEditDialogOpen(true)}>
                  <Edit aria-hidden="true" /> Edit
                </Button>
              </TooltipTrigger>
              <TooltipContent>Edit contact</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Secondary Actions */}
        <div className="flex items-center gap-ds-2 mt-ds-2">
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => router.push(`/leads/new?contactId=${contactId}`)}>
            <Zap className="size-3.5" aria-hidden="true" /> Create Lead
          </Button>
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => router.push(`/contacts/${contactId}`)}>
            <ExternalLink className="size-3.5" aria-hidden="true" /> Full Profile
          </Button>
          <Button variant="ghost" size="sm" className="text-xs text-ds-danger hover:text-ds-danger" onClick={() => setIsDeleteDialogOpen(true)}>
            <Trash2 className="size-3.5" aria-hidden="true" /> Delete
          </Button>
        </div>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-3 gap-ds-3 py-ds-4 border-b border-ds-border">
        <Card>
          <CardContent className="p-ds-3 text-center">
            <p className="text-2xl font-bold">{contactLeads.length}</p>
            <p className="text-[10px] text-ds-foreground-muted uppercase tracking-wide">Leads</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-ds-3 text-center">
            <p className="text-2xl font-bold">{wonLeads}</p>
            <p className="text-[10px] text-ds-foreground-muted uppercase tracking-wide">Won</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-ds-3 text-center">
            <p className="text-2xl font-bold">
              {new Intl.NumberFormat('en-IN', { notation: 'compact' }).format(totalRevenue)}
            </p>
            <p className="text-[10px] text-ds-foreground-muted uppercase tracking-wide">Value</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="flex-1">
        <div className="pt-ds-3 border-b border-ds-border">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="deals">Deals ({contactLeads.length})</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="py-ds-4 space-y-ds-5 mt-0">
          <div className="space-y-ds-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-ds-foreground-muted">Contact Details</h4>
            {contact.email && (
              <div className="flex items-center gap-ds-3 text-sm">
                <Mail className="h-4 w-4 text-ds-foreground-muted shrink-0" aria-hidden="true" />
                <span className="truncate">{contact.email}</span>
              </div>
            )}
            {contact.phone && (
              <div className="flex items-center gap-ds-3 text-sm">
                <Phone className="h-4 w-4 text-ds-foreground-muted shrink-0" aria-hidden="true" />
                <span>{contact.phone}</span>
              </div>
            )}
            {(contact as any).company && (
              <div className="flex items-center gap-ds-3 text-sm">
                <Building2 className="h-4 w-4 text-ds-foreground-muted shrink-0" aria-hidden="true" />
                <span>{(contact as any).company}</span>
              </div>
            )}
            {((contact as any).city || (contact as any).country) && (
              <div className="flex items-center gap-ds-3 text-sm">
                <MapPin className="h-4 w-4 text-ds-foreground-muted shrink-0" aria-hidden="true" />
                <span>{[(contact as any).address, (contact as any).city, (contact as any).state, (contact as any).country].filter(Boolean).join(', ')}</span>
              </div>
            )}
            {(contact as any).birthday && (
              <div className="flex items-center gap-ds-3 text-sm">
                <Calendar className="h-4 w-4 text-ds-foreground-muted shrink-0" aria-hidden="true" />
                <span>Birthday: {new Date((contact as any).birthday).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
              </div>
            )}
            {(contact as any).anniversary && (
              <div className="flex items-center gap-ds-3 text-sm">
                <Calendar className="h-4 w-4 text-ds-foreground-muted shrink-0" aria-hidden="true" />
                <span>Anniversary: {new Date((contact as any).anniversary).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
              </div>
            )}
            {(contact as any).preferredLanguage && (contact as any).preferredLanguage !== 'en' && (
              <div className="flex items-center gap-ds-3 text-sm">
                <Globe className="h-4 w-4 text-ds-foreground-muted shrink-0" aria-hidden="true" />
                <span>Language: {(contact as any).preferredLanguage.toUpperCase()}</span>
              </div>
            )}
          </div>

          {(contact.tags ?? []).length > 0 && (
            <>
              <Separator />
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-ds-foreground-muted mb-ds-2">Tags</h4>
                <div className="flex flex-wrap gap-1.5">
                  {(contact.tags ?? []).map((tag: string) => (
                    <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                  ))}
                </div>
              </div>
            </>
          )}

          {(contact as any).notes && (
            <>
              <Separator />
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-ds-foreground-muted mb-ds-2">Notes</h4>
                <p className="text-sm text-ds-foreground-muted whitespace-pre-wrap">{(contact as any).notes}</p>
              </div>
            </>
          )}

          <Separator />
          <div className="text-xs text-ds-foreground-muted space-y-1">
            <p>Created {new Date(contact.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
            <p>Updated {new Date(contact.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
          </div>
        </TabsContent>

        <TabsContent value="deals" className="py-ds-4 mt-0">
          <div className="space-y-ds-2">
            {contactLeads.length === 0 ? (
              <div className="text-center py-ds-8">
                <Zap className="h-8 w-8 mx-auto mb-ds-2 text-ds-foreground-subtle" aria-hidden="true" />
                <p className="text-sm text-ds-foreground-muted">No leads yet</p>
                <Button variant="outline" size="sm" className="mt-ds-3" onClick={() => router.push(`/leads/new?contactId=${contactId}`)}>
                  <Plus className="size-3.5" aria-hidden="true" /> Create Lead
                </Button>
              </div>
            ) : (
              contactLeads.map((lead: any) => (
                <Card key={lead.id} className="cursor-pointer hover:shadow-ds-1 transition-shadow" onClick={() => router.push(`/leads/${lead.id}`)}>
                  <CardContent className="p-ds-3">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{lead.title}</p>
                        <p className="text-xs text-ds-foreground-muted">{lead.destination}</p>
                      </div>
                      <Badge className={cn('text-[10px] ml-ds-2 shrink-0', getStatusColor(lead.status))}>
                        {lead.status.replace('_', ' ')}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between mt-ds-2 text-xs text-ds-foreground-muted">
                      <span>{lead.travelDate ? new Date(lead.travelDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'No date'}</span>
                      <span className="font-medium text-ds-foreground">
                        {lead.budget ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(lead.budget) : '—'}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="activity" className="py-ds-4 mt-0">
          <div className="space-y-ds-4">
            {contactFollowUps.length === 0 ? (
              <div className="text-center py-ds-8">
                <Clock className="h-8 w-8 mx-auto mb-ds-2 text-ds-foreground-subtle" aria-hidden="true" />
                <p className="text-sm text-ds-foreground-muted">No activity yet</p>
              </div>
            ) : (
              contactFollowUps.slice(0, 15).map((fu: any, idx: number) => (
                <div key={fu.id} className="flex gap-ds-3">
                  <div className="flex flex-col items-center">
                    <div className="h-8 w-8 rounded-ds-full bg-ds-surface-sunken flex items-center justify-center shrink-0">
                      {fu.type === 'call' ? <Phone className="h-3.5 w-3.5" aria-hidden="true" /> : <Mail className="h-3.5 w-3.5" aria-hidden="true" />}
                    </div>
                    {idx < Math.min(contactFollowUps.length - 1, 14) && <div className="flex-1 w-px bg-ds-border mt-1" />}
                  </div>
                  <div className="pb-ds-4 min-w-0">
                    <p className="text-sm font-medium capitalize">{fu.type}</p>
                    <p className="text-xs text-ds-foreground-muted truncate">{fu.notes}</p>
                    <p className="text-xs text-ds-foreground-muted mt-1">
                      {new Date(fu.scheduledAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle>Edit Contact</DialogTitle>
          <div className="space-y-ds-4">
            <div className="space-y-ds-2">
              <Label htmlFor="drawer-edit-name">Full Name</Label>
              <Input id="drawer-edit-name" value={editForm.name ?? ''} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div className="space-y-ds-2">
              <Label htmlFor="drawer-edit-email">Email</Label>
              <Input id="drawer-edit-email" type="email" value={editForm.email ?? ''} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
            </div>
            <div className="space-y-ds-2">
              <Label htmlFor="drawer-edit-phone">Phone</Label>
              <Input id="drawer-edit-phone" value={editForm.phone ?? ''} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
            </div>
            <div className="space-y-ds-2">
              <Label htmlFor="drawer-edit-company">Company</Label>
              <Input id="drawer-edit-company" value={editForm.company ?? ''} onChange={(e) => setEditForm({ ...editForm, company: e.target.value })} />
            </div>
            <div className="space-y-ds-2">
              <Label htmlFor="drawer-edit-notes">Notes</Label>
              <Textarea id="drawer-edit-notes" value={editForm.notes ?? ''} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} disabled={isUpdating}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={isUpdating}>
              {isUpdating && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
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
            Are you sure you want to delete {contact.name}? This action cannot be undone.
          </DialogDescription>
          <div className="flex justify-end gap-ds-3 mt-ds-4">
            <Button variant="outline" disabled={isDeleting} onClick={() => setIsDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {contact && (
        <SendMessageDialog
          open={isSendDialogOpen}
          onOpenChange={setIsSendDialogOpen}
          contact={{ id: contactId, name: contact.name, email: contact.email, phone: contact.phone }}
          defaultChannel={sendChannel}
        />
      )}
    </div>
  );
}

/* ─── Main Contacts Page ─── */
export default function ContactsPage() {
  const router = useRouter();
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [tagFilter, setTagFilter] = React.useState('all');
  const [sendMsgContact, setSendMsgContact] = React.useState<{ id: string; name: string; email?: string | null; phone?: string | null } | null>(null);
  const [sendMsgChannel, setSendMsgChannel] = React.useState<'email' | 'whatsapp' | 'sms' | undefined>(undefined);
  const [refetchKey, setRefetchKey] = React.useState(0);

  const { data: tagsResponse } = useApiQuery(() => contactsApi.getTags(), []);
  const allTags: string[] = Array.isArray(tagsResponse?.data) ? tagsResponse.data : [];

  const activeFilters = React.useMemo(() => {
    const f: { id: string; label: string; value: string }[] = [];
    if (typeFilter !== 'all') f.push({ id: 'type', label: 'Type', value: typeFilter });
    if (tagFilter !== 'all') f.push({ id: 'tag', label: 'Tag', value: tagFilter });
    return f;
  }, [typeFilter, tagFilter]);

  const columns: DataTableColumn<Contact>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      hideable: false,
      cell: (c) => {
        const displayName = c.name || `${(c as any).firstName ?? ''} ${(c as any).lastName ?? ''}`.trim();
        return (
          <div className="flex items-center gap-ds-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs">{getInitials(displayName)}</AvatarFallback>
            </Avatar>
            <span className="font-medium text-sm">{displayName}</span>
          </div>
        );
      },
    },
    { key: 'email', header: 'Email', cell: (c) => <span className="text-sm text-ds-foreground-muted">{c.email ?? '—'}</span> },
    { key: 'phone', header: 'Phone', cell: (c) => <span className="text-sm">{c.phone ?? '—'}</span> },
    { key: 'type', header: 'Type', cell: (c) => <Badge variant="outline" className="text-xs capitalize">{c.type}</Badge> },
    {
      key: 'tags',
      header: 'Tags',
      cell: (c) => (
        <div className="flex gap-1">
          {(c.tags ?? []).slice(0, 2).map((tag: string) => (
            <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
          ))}
          {(c.tags ?? []).length > 2 && (
            <Badge variant="secondary" className="text-[10px]">+{(c.tags ?? []).length - 2}</Badge>
          )}
        </div>
      ),
    },
    { key: 'source', header: 'Source', cell: (c) => <span className="text-sm text-ds-foreground-muted capitalize">{(c as any).source ?? '—'}</span> },
    {
      key: 'createdAt',
      header: 'Created',
      sortable: true,
      cell: (c) => <span className="text-sm text-ds-foreground-muted">{new Date(c.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>,
    },
  ];

  return (
    <div className="p-ds-6">
      <ListPage<Contact>
        title="Contacts"
        description="Every customer, supplier, agent, and partner in one place."
        getRowId={(c) => c.id}
        serverSort
        fetcher={({ page, limit, search, sort }) =>
          contactsApi.list({
            page,
            limit,
            search: search || undefined,
            sortBy: sort?.column,
            sortOrder: sort?.direction,
            type: typeFilter !== 'all' ? typeFilter : undefined,
            tag: tagFilter !== 'all' ? tagFilter : undefined,
          })
        }
        columns={columns}
        searchPlaceholder="Search contacts..."
        filters={activeFilters}
        onRemoveFilter={(id) => {
          if (id === 'type') setTypeFilter('all');
          if (id === 'tag') setTagFilter('all');
        }}
        onClearFilters={() => { setTypeFilter('all'); setTagFilter('all'); }}
        headerActions={
          <>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-36 h-9">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="customer">Customer</SelectItem>
                <SelectItem value="supplier">Supplier</SelectItem>
                <SelectItem value="agent">Agent</SelectItem>
                <SelectItem value="partner">Partner</SelectItem>
              </SelectContent>
            </Select>
            <Select value={tagFilter} onValueChange={setTagFilter}>
              <SelectTrigger className="w-36 h-9">
                <SelectValue placeholder="All tags" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tags</SelectItem>
                {allTags.map((tag) => (
                  <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => router.push('/contacts/import')}>
              <Upload aria-hidden="true" /> Import
            </Button>
            <Button variant="outline" size="sm" onClick={() => router.push('/settings/custom-fields')}>
              <ListChecks aria-hidden="true" /> Custom Fields
            </Button>
          </>
        }
        primaryAction={
          <Button size="sm" onClick={() => router.push('/contacts/new')}>
            <Plus aria-hidden="true" /> New Contact
          </Button>
        }
        rowActions={(c) => {
          const displayName = c.name || `${(c as any).firstName ?? ''} ${(c as any).lastName ?? ''}`.trim();
          return (
            <>
              <Button variant="ghost" size="icon-sm" aria-label="View" onClick={() => router.push(`/contacts/${c.id}`)}>
                <Eye aria-hidden="true" />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => router.push(`/contacts/${c.id}/edit`)}>
                <Edit aria-hidden="true" />
              </Button>
              {c.phone && (
                <Button variant="ghost" size="icon-sm" aria-label="Call" onClick={() => router.push(`/communication/calls/dial?phone=${encodeURIComponent(c.phone!)}`)}>
                  <Phone aria-hidden="true" />
                </Button>
              )}
              {c.email && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Email"
                  onClick={() => { setSendMsgContact({ id: c.id, name: displayName, email: c.email, phone: c.phone }); setSendMsgChannel('email'); }}
                >
                  <Mail aria-hidden="true" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Delete"
                onClick={async () => {
                  if (confirm(`Delete ${displayName}?`)) {
                    try {
                      await contactsApi.delete(c.id);
                      toast.success('Contact deleted');
                      setRefetchKey((k) => k + 1);
                    } catch { toast.error('Failed to delete'); }
                  }
                }}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </>
          );
        }}
        refreshKey={refetchKey}
        renderDetail={(c) => <ContactDetailPanel contactId={c.id} onDeleted={() => setRefetchKey((k) => k + 1)} />}
        detailTitle={(c) => c.name}
        bulkActions={[
          {
            label: 'Delete',
            icon: <Trash2 aria-hidden="true" />,
            destructive: true,
            onSelect: async (rows) => {
              await Promise.all(rows.map((r) => contactsApi.delete(r.id)));
              toast.success(`${rows.length} contact(s) deleted`);
              setRefetchKey((k) => k + 1);
            },
          },
        ]}
        onExport={async (rows) => {
          try {
            const blob = await contactsApi.export({
              format: 'csv',
              filters: {
                type: typeFilter !== 'all' ? typeFilter : undefined,
                tag: tagFilter !== 'all' ? tagFilter : undefined,
                ids: rows.length > 0 && rows.length < 1000 ? rows.map((r) => r.id) : undefined,
              },
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `contacts-${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success('Contacts exported');
          } catch { toast.error('Export failed'); }
        }}
        exportLabel="Export"
        emptyTitle="No contacts yet"
        emptyDescription="Add your first contact to start building your customer base."
        emptyIcon={<Download aria-hidden="true" />}
      />

      {sendMsgContact && (
        <SendMessageDialog
          open={!!sendMsgContact}
          onOpenChange={(open) => { if (!open) { setSendMsgContact(null); setSendMsgChannel(undefined); } }}
          contact={sendMsgContact}
          defaultChannel={sendMsgChannel}
        />
      )}
    </div>
  );
}
