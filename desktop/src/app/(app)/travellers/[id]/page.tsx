'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Loader2, AlertCircle, Pencil, Trash2, Plus, FileText, Globe, Link2, Link2Off, Upload, Download,
} from 'lucide-react';
import { DetailPage, RelationCombobox } from '@/components/domain';
import {
  Button, Tag, SectionCard, Label,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { travellersApi, visaApi, parseDateOnly, normalizeTraveller, travellerDocumentsApi, type Traveller, type VisaRecord } from '@/lib/api/visa';
import { documentsApi, type Document as DocType } from '@/lib/api/documents';
import { contactsApi } from '@/lib/api/contacts';
import { toast } from 'sonner';

function statusTone(status: string): 'success' | 'danger' | 'info' | 'warning' | 'neutral' {
  if (status === 'approved') return 'success';
  if (status === 'rejected') return 'danger';
  if (status === 'processing') return 'warning';
  return 'info';
}

function formatDate(value?: string) {
  return value
    ? parseDateOnly(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';
}

export default function TravellerDetailPage() {
  const router = useRouter();
  const params = useParams();
  const travellerId = params.id as string;

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = React.useState(false);
  const [linkContactId, setLinkContactId] = React.useState<string | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const { data: travellerResponse, loading, error, refetch } = useApiQuery(
    () => travellersApi.getById(travellerId),
    [travellerId],
  );

  const { data: visaResponse } = useApiQuery(
    () => visaApi.list({ traveller_id: travellerId, page: 1, limit: 100 }),
    [travellerId],
  );

  const { mutate: deleteTraveller, loading: isDeleting } = useApiMutation<string, any>(
    () => travellersApi.delete(travellerId),
  );

  const { mutate: linkContact, loading: isLinking } = useApiMutation<string, any>(
    (contactId) => travellersApi.linkContact(travellerId, contactId),
  );

  const { mutate: unlinkContact, loading: isUnlinking } = useApiMutation<void, any>(
    () => travellersApi.unlinkContact(travellerId),
  );

  const { data: docsResponse, refetch: refetchDocs } = useApiQuery(
    () => travellerDocumentsApi.list(travellerId),
    [travellerId],
  );

  const documents: DocType[] = React.useMemo(() => {
    if (!docsResponse?.data) return [];
    const d = (docsResponse.data as any)?.data ?? docsResponse.data;
    return Array.isArray(d) ? d : [];
  }, [docsResponse]);

  const traveller: Traveller | undefined = React.useMemo(() => {
    const raw = ((travellerResponse?.data as any)?.data ?? travellerResponse?.data) as any;
    return raw ? normalizeTraveller(raw) : undefined;
  }, [travellerResponse]);

  // The traveller endpoint returns only contact_id; resolve the name for display.
  const linkedContactId = traveller?.contactId;
  const { data: contactResponse } = useApiQuery(
    () => (linkedContactId ? contactsApi.getById(linkedContactId) : Promise.resolve(null)),
    [linkedContactId],
  );
  const linkedContactName: string | undefined = React.useMemo(() => {
    const c = ((contactResponse as any)?.data?.data ?? (contactResponse as any)?.data) as any;
    return c?.name || `${c?.firstName ?? ''} ${c?.lastName ?? ''}`.trim() || undefined;
  }, [contactResponse]);

  const visaRecords: VisaRecord[] = React.useMemo(() => {
    if (!visaResponse?.data) return [];
    const all = Array.isArray(visaResponse.data) ? visaResponse.data : (visaResponse.data as any)?.data ?? [];
    // The visa endpoint filters by traveller_id server-side and returns snake_case rows.
    return all.map((v: any): VisaRecord => ({
      ...v,
      countryName: v.countryName ?? v.destination_country ?? v.country ?? '',
      visaType: v.visaType ?? v.visa_type,
      applicationDate: v.applicationDate ?? v.application_date ?? v.created_at,
      expiryDate: v.expiryDate ?? v.expiry_date ?? v.expected_date,
    }));
  }, [visaResponse]);

  async function handleDelete() {
    const result = await deleteTraveller(travellerId);
    if (result !== undefined) {
      toast.success('Traveller deleted');
      router.push('/travellers');
    } else {
      toast.error('Failed to delete traveller');
    }
  }

  async function handleLinkContact() {
    if (!linkContactId) return;
    const result = await linkContact(linkContactId);
    if (result) {
      toast.success('Contact linked');
      setIsLinkDialogOpen(false);
      setLinkContactId(null);
      refetch();
    } else {
      toast.error('Failed to link contact');
    }
  }

  async function handleUnlinkContact() {
    const result = await unlinkContact();
    if (result !== undefined) {
      toast.success('Contact unlinked');
      refetch();
    } else {
      toast.error('Failed to unlink contact');
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      await travellerDocumentsApi.upload(travellerId, file);
      toast.success('Document uploaded');
      refetchDocs();
    } catch {
      toast.error('Failed to upload document');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDocDownload(doc: DocType) {
    try {
      const blob = await documentsApi.download(doc.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to download document');
    }
  }

  async function handleDocDelete(doc: DocType) {
    try {
      await documentsApi.delete(doc.id);
      toast.success('Document deleted');
      refetchDocs();
    } catch {
      toast.error('Failed to delete document');
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-ds-foreground-muted" />
        <p className="text-ds-foreground-muted">Loading traveller...</p>
      </div>
    );
  }

  if (error || !traveller) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="h-12 w-12 text-ds-danger" />
        <p className="text-ds-danger">Failed to load traveller</p>
        <Button variant="outline" onClick={() => router.push('/travellers')}>Back to Travellers</Button>
      </div>
    );
  }

  return (
    <>
      <DetailPage
        entity={traveller}
        title={`${traveller.firstName} ${traveller.lastName}`}
        subtitle={traveller.nationality ? `${traveller.passportNumber} · ${traveller.nationality}` : traveller.passportNumber}
        status={traveller.passportExpiryDate ? (
          <Tag tone={new Date(traveller.passportExpiryDate).getTime() < Date.now() ? 'danger' : 'success'}>
            Passport {new Date(traveller.passportExpiryDate).getTime() < Date.now() ? 'expired' : `valid till ${formatDate(traveller.passportExpiryDate)}`}
          </Tag>
        ) : undefined}
        onBack={() => router.push('/travellers')}
        actions={[
          { label: 'Edit', icon: <Pencil aria-hidden="true" />, onSelect: () => router.push(`/travellers/${travellerId}/edit`) },
          traveller.contactId
            ? { label: 'Unlink contact', icon: <Link2Off aria-hidden="true" />, onSelect: handleUnlinkContact, disabled: isUnlinking }
            : { label: 'Link contact', icon: <Link2 aria-hidden="true" />, onSelect: () => setIsLinkDialogOpen(true) },
          { label: 'Delete', icon: <Trash2 aria-hidden="true" />, destructive: true, separatorBefore: true, onSelect: () => setIsDeleteDialogOpen(true) },
        ]}
        messaging={{
          recipientId: traveller.contactId || traveller.id,
          recipientName: `${traveller.firstName} ${traveller.lastName}`,
          email: traveller.email,
          phone: traveller.phone,
        }}
        overview={
          <div className="flex flex-col gap-ds-4">
            <SectionCard title="Personal Information">
              <div className="grid gap-ds-6 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-ds-foreground-muted font-semibold">First Name</p>
                  <p className="text-sm font-medium mt-1">{traveller.firstName}</p>
                </div>
                <div>
                  <p className="text-xs text-ds-foreground-muted font-semibold">Last Name</p>
                  <p className="text-sm font-medium mt-1">{traveller.lastName || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-ds-foreground-muted font-semibold">Date of Birth</p>
                  <p className="text-sm font-medium mt-1">{formatDate(traveller.dateOfBirth)}</p>
                </div>
                <div>
                  <p className="text-xs text-ds-foreground-muted font-semibold">Nationality</p>
                  <p className="text-sm font-medium mt-1 flex items-center gap-1">
                    {traveller.nationality ? <><Globe className="size-3.5" aria-hidden="true" />{traveller.nationality}</> : '—'}
                  </p>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Passport & Contact">
              <div className="grid gap-ds-6 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-ds-foreground-muted font-semibold">Passport Number</p>
                  <p className="text-sm font-mono font-medium mt-1">{traveller.passportNumber || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-ds-foreground-muted font-semibold">Passport Expiry</p>
                  <p className="text-sm font-medium mt-1">{formatDate(traveller.passportExpiryDate)}</p>
                </div>
                <div>
                  <p className="text-xs text-ds-foreground-muted font-semibold">Email</p>
                  <p className="text-sm font-medium mt-1">{traveller.email || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-ds-foreground-muted font-semibold">Phone</p>
                  <p className="text-sm font-medium mt-1">{traveller.phone || '—'}</p>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Linked Contact"
              actions={
                traveller.contactId ? (
                  <Button size="sm" variant="outline" onClick={handleUnlinkContact} disabled={isUnlinking}>
                    <Link2Off aria-hidden="true" /> Unlink
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setIsLinkDialogOpen(true)}>
                    <Link2 aria-hidden="true" /> Link contact
                  </Button>
                )
              }
            >
              {traveller.contactId ? (
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{traveller.contactName || linkedContactName || 'Loading contact…'}</p>
                  <Button variant="ghost" size="sm" onClick={() => router.push(`/contacts/${traveller.contactId}`)}>View contact</Button>
                </div>
              ) : (
                <p className="text-sm text-ds-foreground-muted text-center py-4">No contact linked yet</p>
              )}
            </SectionCard>

            <SectionCard title="Metadata">
              <div className="flex flex-col gap-1 text-sm text-ds-foreground-muted">
                <p>Created {formatDate(traveller.createdAt)}</p>
                <p>Last updated {formatDate(traveller.updatedAt)}</p>
              </div>
            </SectionCard>
          </div>
        }
        related={[
          {
            title: 'Visa Applications',
            action: (
              <Button size="sm" variant="outline" onClick={() => router.push(`/visa/new?travellerId=${travellerId}&travellerName=${encodeURIComponent(`${traveller.firstName} ${traveller.lastName}`)}`)}>
                <Plus aria-hidden="true" /> New visa application
              </Button>
            ),
            content: visaRecords.length === 0 ? (
              <p className="text-sm text-ds-foreground-muted text-center py-4">No visa applications found</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Country</TableHead>
                    <TableHead>Visa Type</TableHead>
                    <TableHead>Application Date</TableHead>
                    <TableHead>Expiry Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visaRecords.map((v) => (
                    <TableRow key={v.id} className="cursor-pointer hover:bg-ds-surface-sunken" onClick={() => router.push(`/visa/${v.id}`)}>
                      <TableCell className="font-medium text-sm">{v.countryName}</TableCell>
                      <TableCell className="text-sm">{v.visaType || '—'}</TableCell>
                      <TableCell className="text-sm">{formatDate(v.applicationDate)}</TableCell>
                      <TableCell className="text-sm">{formatDate(v.expiryDate)}</TableCell>
                      <TableCell><Tag tone={statusTone(v.status)}>{v.status}</Tag></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ),
          },
        ]}
        documents={
          <div className="flex flex-col gap-ds-3">
            <div className="flex justify-end">
              <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={handleFileUpload} />
              <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                {isUploading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}
                Upload document
              </Button>
            </div>
            {documents.length === 0 ? (
              <p className="text-sm text-ds-foreground-muted text-center py-4">No documents uploaded yet</p>
            ) : (
              <div className="flex flex-col gap-ds-2">
                {documents.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between p-ds-2 rounded-ds-md hover:bg-ds-surface-sunken">
                    <div className="flex items-center gap-ds-2">
                      <FileText className="size-4 text-ds-foreground-muted" aria-hidden="true" />
                      <div>
                        <p className="text-sm font-medium">{doc.name}</p>
                        <p className="text-xs text-ds-foreground-muted">{(doc.size / 1024).toFixed(1)} KB · {formatDate(doc.createdAt)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon-sm" aria-label="Download" onClick={() => handleDocDownload(doc)}><Download /></Button>
                      <Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={() => handleDocDelete(doc)}><Trash2 /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        }
      />

      {/* Link Contact Dialog */}
      <Dialog open={isLinkDialogOpen} onOpenChange={(open) => { setIsLinkDialogOpen(open); if (!open) setLinkContactId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Link Contact</DialogTitle>
            <DialogDescription>Associate this traveller with an existing contact.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Contact</Label>
            <RelationCombobox
              value={linkContactId}
              onChange={(id) => setLinkContactId(id)}
              fetcher={async (q, page) => {
                const r = await contactsApi.list({ search: q, page, limit: 20 });
                const data = r.data as any;
                const items = Array.isArray(data) ? data : (data?.data ?? []);
                const total = data?.pagination?.total ?? items.length;
                return { items, total };
              }}
              getOptionId={(c: any) => c.id}
              getOptionLabel={(c: any) => c.name || `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim()}
              getOptionDescription={(c: any) => c.email ?? undefined}
              placeholder="Select a contact"
              searchPlaceholder="Search contacts..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLinkDialogOpen(false)} disabled={isLinking}>Cancel</Button>
            <Button onClick={handleLinkContact} disabled={isLinking || !linkContactId}>
              {isLinking && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Link Contact
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Traveller</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {traveller.firstName} {traveller.lastName}? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} disabled={isDeleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
