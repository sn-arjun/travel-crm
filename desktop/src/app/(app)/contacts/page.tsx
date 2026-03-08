'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus, Search, Phone, Mail, MoreHorizontal, Building2, MessageCircle,
  Tag, Download, Upload, MapPin, Calendar, Globe, ArrowUpRight, AlertCircle, Loader2,
  Edit, Trash2, Zap, TrendingUp, DollarSign, Clock, ExternalLink, Send, FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogDescription, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { contactsApi, type UpdateContactRequest } from '@/lib/api/contacts';
import { leadsApi } from '@/lib/api/leads';
import { followUpsApi } from '@/lib/api/follow-ups';
import { SendMessageDialog } from '@/components/communication/send-message-dialog';
import { toast } from 'sonner';

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

/* ─── Contact Detail Panel (360° Drawer) ─── */
function ContactDetailPanel({ contactId, onClose, onDeleted }: { contactId: string; onClose: () => void; onDeleted: () => void }) {
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
      <SheetContent className="w-[560px] sm:max-w-[560px] overflow-y-auto p-0">
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </SheetContent>
    );
  }

  if (error || !contact) return null;

  return (
    <SheetContent className="w-[560px] sm:max-w-[560px] overflow-y-auto p-0">
      {/* Drawer Header with Avatar + Actions */}
      <div className="px-6 pt-6 pb-4 border-b bg-muted/30">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14">
              <AvatarFallback className="text-lg font-semibold">{getInitials(contact.name)}</AvatarFallback>
            </Avatar>
            <div>
              <SheetHeader className="p-0 space-y-0">
                <SheetTitle className="text-lg font-bold">{contact.name}</SheetTitle>
              </SheetHeader>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="outline" className="text-[10px] capitalize">{contact.type}</Badge>
                {(contact as any).source && (
                  <Badge variant="secondary" className="text-[10px] capitalize">{(contact as any).source}</Badge>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex items-center gap-2 mt-4">
          <TooltipProvider delayDuration={300}>
            {contact.phone && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={() => router.push(`/communication/calls/dial?phone=${encodeURIComponent(contact.phone!)}`)}>
                    <Phone className="h-4 w-4 mr-1.5" /> Call
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Call {contact.phone}</TooltipContent>
              </Tooltip>
            )}
            {contact.phone && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={() => { setSendChannel('whatsapp'); setIsSendDialogOpen(true); }}>
                    <MessageCircle className="h-4 w-4 mr-1.5" /> WhatsApp
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Send WhatsApp via Communication Hub</TooltipContent>
              </Tooltip>
            )}
            {contact.email && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={() => { setSendChannel('email'); setIsSendDialogOpen(true); }}>
                    <Send className="h-4 w-4 mr-1.5" /> Email
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Send Email via Communication Hub</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={() => { setSendChannel(undefined); setIsSendDialogOpen(true); }}>
                  <Mail className="h-4 w-4 mr-1.5" /> Message
                </Button>
              </TooltipTrigger>
              <TooltipContent>Send message (choose channel)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={() => setIsEditDialogOpen(true)}>
                  <Edit className="h-4 w-4 mr-1.5" /> Edit
                </Button>
              </TooltipTrigger>
              <TooltipContent>Edit contact</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Secondary Actions */}
        <div className="flex items-center gap-2 mt-2">
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => router.push(`/leads/new?contactId=${contactId}`)}>
            <Zap className="h-3.5 w-3.5 mr-1" /> Create Lead
          </Button>
          <Button variant="ghost" size="sm" className="text-xs" asChild>
            <Link href={`/contacts/${contactId}`}>
              <ExternalLink className="h-3.5 w-3.5 mr-1" /> Full Profile
            </Link>
          </Button>
          <Button variant="ghost" size="sm" className="text-xs text-destructive hover:text-destructive" onClick={() => setIsDeleteDialogOpen(true)}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
          </Button>
        </div>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-3 gap-3 px-6 py-4 border-b">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">{contactLeads.length}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Leads</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">{wonLeads}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Won</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">
              {new Intl.NumberFormat('en-IN', { notation: 'compact' }).format(totalRevenue)}
            </p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Value</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="flex-1">
        <div className="px-6 pt-3 border-b">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="deals">Deals ({contactLeads.length})</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="px-6 py-4 space-y-5 mt-0">
          {/* Contact Info */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contact Details</h4>
            {contact.email && (
              <div className="flex items-center gap-3 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <a href={`mailto:${contact.email}`} className="text-primary hover:underline truncate">{contact.email}</a>
              </div>
            )}
            {contact.phone && (
              <div className="flex items-center gap-3 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>{contact.phone}</span>
              </div>
            )}
            {(contact as any).company && (
              <div className="flex items-center gap-3 text-sm">
                <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>{(contact as any).company}</span>
              </div>
            )}
            {((contact as any).city || (contact as any).country) && (
              <div className="flex items-center gap-3 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>{[(contact as any).address, (contact as any).city, (contact as any).state, (contact as any).country].filter(Boolean).join(', ')}</span>
              </div>
            )}
            {(contact as any).birthday && (
              <div className="flex items-center gap-3 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>Birthday: {new Date((contact as any).birthday).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
              </div>
            )}
            {(contact as any).anniversary && (
              <div className="flex items-center gap-3 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>Anniversary: {new Date((contact as any).anniversary).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
              </div>
            )}
            {(contact as any).preferredLanguage && (contact as any).preferredLanguage !== 'en' && (
              <div className="flex items-center gap-3 text-sm">
                <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>Language: {(contact as any).preferredLanguage.toUpperCase()}</span>
              </div>
            )}
          </div>

          {/* Tags */}
          {(contact.tags ?? []).length > 0 && (
            <>
              <Separator />
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Tags</h4>
                <div className="flex flex-wrap gap-1.5">
                  {(contact.tags ?? []).map((tag: any) => (
                    <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Notes */}
          {(contact as any).notes && (
            <>
              <Separator />
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Notes</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{(contact as any).notes}</p>
              </div>
            </>
          )}

          <Separator />
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Created {new Date(contact.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
            <p>Updated {new Date(contact.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
          </div>
        </TabsContent>

        <TabsContent value="deals" className="px-6 py-4 mt-0">
          <div className="space-y-2">
            {contactLeads.length === 0 ? (
              <div className="text-center py-8">
                <Zap className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No leads yet</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => router.push(`/leads/new?contactId=${contactId}`)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Create Lead
                </Button>
              </div>
            ) : (
              contactLeads.map((lead: any) => (
                <Card key={lead.id} className="cursor-pointer hover:shadow-sm transition-shadow" onClick={() => router.push(`/leads/${lead.id}`)}>
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{lead.title}</p>
                        <p className="text-xs text-muted-foreground">{lead.destination}</p>
                      </div>
                      <Badge className={cn('text-[10px] ml-2 shrink-0', getStatusColor(lead.status))}>
                        {lead.status.replace('_', ' ')}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                      <span>{lead.travelDate ? new Date(lead.travelDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'No date'}</span>
                      <span className="font-medium text-foreground">
                        {lead.budget ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(lead.budget) : '—'}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="activity" className="px-6 py-4 mt-0">
          <div className="space-y-4">
            {contactFollowUps.length === 0 ? (
              <div className="text-center py-8">
                <Clock className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No activity yet</p>
              </div>
            ) : (
              contactFollowUps.slice(0, 15).map((fu: any, idx: number) => (
                <div key={fu.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                      {fu.type === 'call' ? <Phone className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
                    </div>
                    {idx < Math.min(contactFollowUps.length - 1, 14) && <div className="flex-1 w-px bg-border mt-1" />}
                  </div>
                  <div className="pb-4 min-w-0">
                    <p className="text-sm font-medium capitalize">{fu.type}</p>
                    <p className="text-xs text-muted-foreground truncate">{fu.notes}</p>
                    <p className="text-xs text-muted-foreground mt-1">
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
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="drawer-edit-name">Full Name</Label>
              <Input id="drawer-edit-name" value={editForm.name ?? ''} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="drawer-edit-email">Email</Label>
              <Input id="drawer-edit-email" type="email" value={editForm.email ?? ''} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="drawer-edit-phone">Phone</Label>
              <Input id="drawer-edit-phone" value={editForm.phone ?? ''} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="drawer-edit-company">Company</Label>
              <Input id="drawer-edit-company" value={editForm.company ?? ''} onChange={(e) => setEditForm({ ...editForm, company: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="drawer-edit-notes">Notes</Label>
              <Textarea id="drawer-edit-notes" value={editForm.notes ?? ''} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} disabled={isUpdating}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={isUpdating}>
              {isUpdating && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
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
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" disabled={isDeleting} onClick={() => setIsDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Send Message Dialog (Communication Hub) */}
      {contact && (
        <SendMessageDialog
          open={isSendDialogOpen}
          onOpenChange={setIsSendDialogOpen}
          contact={{ id: contactId, name: contact.name, email: contact.email, phone: contact.phone }}
          defaultChannel={sendChannel}
        />
      )}
    </SheetContent>
  );
}

/* ─── Main Contacts Page ─── */
export default function ContactsPage() {
  const router = useRouter();
  const [search, setSearch] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [tagFilter, setTagFilter] = React.useState('all');
  const [selectedContact, setSelectedContact] = React.useState<string | null>(null);
  const [sendMsgContact, setSendMsgContact] = React.useState<{ id: string; name: string; email?: string | null; phone?: string | null; } | null>(null);
  const [sendMsgChannel, setSendMsgChannel] = React.useState<'email' | 'whatsapp' | 'sms' | undefined>(undefined);

  // Fetch unique tags for filter
  const { data: tagsResponse } = useApiQuery(() => contactsApi.getTags(), []);

  const allTags: string[] = Array.isArray(tagsResponse?.data) ? tagsResponse.data : [];

  const fetcher = React.useCallback((p: number, limit: number) =>
    contactsApi.list({ page: p, limit, search: search || undefined, type: typeFilter !== 'all' ? typeFilter : undefined, tag: tagFilter !== 'all' ? tagFilter : undefined }),
    [search, typeFilter, tagFilter],
  );

  const { items: displayContacts, loading, loadingMore, hasMore, total, error, sentinelRef, refetch } = useInfiniteScroll({
    fetcher,
    limit: 30,
  });

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
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Contacts</h1>
          <p className="text-sm text-muted-foreground">{total > 0 ? `${displayContacts.length} of ${total}` : `${displayContacts.length}`} contacts</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/contacts/import"><Upload className="h-4 w-4 mr-1.5" /> Import</Link>
          </Button>
          <Button variant="outline" size="sm" onClick={async () => {
            try {
              const blob = await contactsApi.export({ format: 'csv', filters: { type: typeFilter !== 'all' ? typeFilter : undefined } });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `contacts-${new Date().toISOString().split('T')[0]}.csv`;
              a.click();
              URL.revokeObjectURL(url);
              toast.success('Contacts exported');
            } catch { toast.error('Export failed'); }
          }}>
            <Download className="h-4 w-4 mr-1.5" /> Export
          </Button>
          <Button asChild>
            <Link href="/contacts/new"><Plus className="h-4 w-4 mr-1.5" /> New Contact</Link>
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search contacts..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
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
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading contacts...</p>
          </div>
        </div>
      )}

      {/* Table */}
      {!loading && (
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-center w-[120px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayContacts.map((contact: any) => {
                const displayName = contact.name || `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim();
                return (
                  <TableRow key={contact.id} className="cursor-pointer group" onClick={() => setSelectedContact(contact.id)}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">{getInitials(displayName)}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium text-sm">{displayName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{contact.email ?? '—'}</TableCell>
                    <TableCell className="text-sm">{contact.phone ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">{contact.type}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {(contact.tags ?? []).slice(0, 2).map((tag: string) => (
                          <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
                        ))}
                        {(contact.tags ?? []).length > 2 && (
                          <Badge variant="secondary" className="text-[10px]">+{(contact.tags ?? []).length - 2}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground capitalize">{(contact as any).source ?? '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(contact.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        <TooltipProvider delayDuration={300}>
                          {contact.phone && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => router.push(`/communication/calls/dial?phone=${encodeURIComponent(contact.phone)}`)}
                                >
                                  <Phone className="h-3.5 w-3.5 text-green-600" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Call</TooltipContent>
                            </Tooltip>
                          )}
                          {contact.phone && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => { setSendMsgContact({ id: contact.id, name: displayName, email: contact.email, phone: contact.phone }); setSendMsgChannel('whatsapp'); }}
                                >
                                  <MessageCircle className="h-3.5 w-3.5 text-green-500" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>WhatsApp</TooltipContent>
                            </Tooltip>
                          )}
                          {contact.email && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => { setSendMsgContact({ id: contact.id, name: displayName, email: contact.email, phone: contact.phone }); setSendMsgChannel('email'); }}
                                >
                                  <Mail className="h-3.5 w-3.5 text-blue-500" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Email</TooltipContent>
                            </Tooltip>
                          )}
                        </TooltipProvider>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setSelectedContact(contact.id)}>View details</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => router.push(`/contacts/${contact.id}`)}>Full profile</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => router.push(`/contacts/${contact.id}/edit`)}>Edit</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => router.push(`/leads/new?contactId=${contact.id}`)}>Create lead</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={async () => {
                              if (confirm(`Delete ${displayName}?`)) {
                                try {
                                  await contactsApi.delete(contact.id);
                                  toast.success('Contact deleted');
                                  refetch();
                                } catch { toast.error('Failed to delete'); }
                              }
                            }}>Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-4" />
          {loadingMore && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading more...</span>
            </div>
          )}
          {!hasMore && displayContacts.length > 0 && (
            <p className="text-center text-xs text-muted-foreground py-3">All contacts loaded</p>
          )}
        </div>
      )}

      {/* Detail Sheet */}
      <Sheet open={!!selectedContact} onOpenChange={(open) => !open && setSelectedContact(null)}>
        {selectedContact && (
          <ContactDetailPanel
            contactId={selectedContact}
            onClose={() => setSelectedContact(null)}
            onDeleted={() => { setSelectedContact(null); refetch(); }}
          />
        )}
      </Sheet>

      {/* Send Message Dialog (from table row actions) */}
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
