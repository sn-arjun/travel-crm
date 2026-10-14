'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertCircle, Calendar, Clock, FileText, IndianRupee, Pencil, Phone, Plus, Trash2, TrendingUp, Zap,
} from 'lucide-react';
import { toast } from 'sonner';

import { DetailPage } from '@/components/domain';
import { PageContainer } from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionCard } from '@/components/ui/section-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Stat } from '@/components/ui/stat';
import { Tag } from '@/components/ui/tag';
import type { TimelineItem } from '@/components/ui/timeline';
import { useApiQuery } from '@/hooks/use-api';
import {
  contactsApi,
  type ContactRecord,
  type ContactTimeline,
  type RelatedDocument,
  type RelatedFollowUp,
  type RelatedInvoice,
  type RelatedItinerary,
  type RelatedLead,
  type RelatedPayment,
} from '@/lib/api/contacts';
import { formatDisplayDate } from '@/lib/dates';
import { formatCurrency } from '@/lib/utils';

import {
  formatFileSize, formatRevenue, humanize, invoiceTone, lastInteractionAt, leadTone,
} from '../_lib/contact-utils';
import { RelatedTable, ViewAllLink } from '../_lib/related-table';

function dateOrDash(value: string | Date | null | undefined): string {
  if (!value) return '-';
  return formatDisplayDate(value) || '-';
}

function money(amount: number | null | undefined, currency?: string | null): string {
  if (amount === null || amount === undefined) return '-';
  return formatCurrency(amount, currency || 'INR');
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-ds-1">
      <dt className="text-xs font-medium text-ds-foreground-muted">{label}</dt>
      <dd className="text-sm text-ds-foreground">{children || '-'}</dd>
    </div>
  );
}

function timelineItems(entries: ContactTimeline[]): TimelineItem[] {
  return entries.map((e): TimelineItem => {
    const timestamp = dateOrDash(new Date(e.createdAt));
    switch (e.type) {
      case 'lead':
        return {
          id: e.id,
          title: `Lead created: ${e.title}`,
          description: humanize(e.metadata),
          timestamp,
          tone: 'info',
          icon: <Zap aria-hidden="true" />,
        };
      case 'invoice':
        return {
          id: e.id,
          title: `Invoice ${e.title}`,
          description: `${money(Number(e.description))} - ${humanize(e.metadata)}`,
          timestamp,
          tone: 'primary',
          icon: <FileText aria-hidden="true" />,
        };
      case 'payment':
        return {
          id: e.id,
          title: `Payment received ${money(Number(e.title))}`,
          description: [humanize(e.description), e.metadata].filter(Boolean).join(' - '),
          timestamp,
          tone: 'success',
          icon: <IndianRupee aria-hidden="true" />,
        };
      case 'message':
        return {
          id: e.id,
          title: `${humanize(e.title)} message`,
          description: [e.description, e.createdByName && `by ${e.createdByName}`].filter(Boolean).join(' - '),
          timestamp,
          tone: 'neutral',
          icon: <Phone aria-hidden="true" />,
        };
      default: {
        const action = e.title === 'create' ? 'Contact created' : e.title === 'update' ? 'Contact updated' : humanize(e.title);
        return {
          id: e.id,
          title: action,
          description: e.createdByName ? `by ${e.createdByName}` : undefined,
          timestamp,
          tone: 'neutral',
          icon: <Clock aria-hidden="true" />,
        };
      }
    }
  });
}

export default function ContactDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const contactId = params.id;
  const { confirm, dialog: confirmDialog } = useConfirm();

  const contactQuery = useApiQuery(() => contactsApi.getById(contactId), [contactId]);
  const timelineQuery = useApiQuery(() => contactsApi.getTimeline(contactId), [contactId]);
  const wonQuery = useApiQuery(() => contactsApi.related.leads(contactId, { status: 'won', limit: 1 }), [contactId]);

  const leadsQuery = useApiQuery(() => contactsApi.related.leads(contactId), [contactId]);
  const itinerariesQuery = useApiQuery(() => contactsApi.related.itineraries(contactId), [contactId]);
  const invoicesQuery = useApiQuery(() => contactsApi.related.invoices(contactId), [contactId]);
  const paymentsQuery = useApiQuery(() => contactsApi.related.payments(contactId), [contactId]);
  const followUpsQuery = useApiQuery(() => contactsApi.related.followUps(contactId), [contactId]);
  const documentsQuery = useApiQuery(() => contactsApi.related.documents(contactId), [contactId]);

  const contact: ContactRecord | undefined = contactQuery.data?.data;
  const timeline = React.useMemo(() => {
    const raw = timelineQuery.data?.data;
    return Array.isArray(raw) ? raw : [];
  }, [timelineQuery.data]);

  async function handleDelete() {
    if (!contact) return;
    const ok = await confirm({
      title: `Delete ${contact.name}?`,
      description: 'This removes the contact and its history from your CRM. This cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'destructive',
    });
    if (!ok) return;
    try {
      await contactsApi.delete(contactId);
      toast.success('Contact deleted successfully');
      router.push('/contacts');
    } catch {
      toast.error('Failed to delete contact');
    }
  }

  if (contactQuery.loading) {
    return (
      <PageContainer>
        <div className="flex flex-col gap-ds-4" aria-busy="true" data-testid="contact-loading">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </PageContainer>
    );
  }

  if (contactQuery.error || !contact) {
    return (
      <PageContainer>
        <EmptyState
          icon={<AlertCircle aria-hidden="true" />}
          title="Could not load this contact"
          description="It may have been deleted, or the connection dropped."
          action={
            <div className="flex gap-ds-2">
              <Button variant="outline" onClick={() => void contactQuery.refetch()}>Try again</Button>
              <Button onClick={() => router.push('/contacts')}>Back to contacts</Button>
            </div>
          }
        />
      </PageContainer>
    );
  }

  const location = [contact.city, contact.state].filter(Boolean).join(', ');
  const lastInteraction = lastInteractionAt(timeline);
  const totalLeads = contact.leadsCount ?? leadsQuery.data?.pagination.total ?? 0;
  const wonLeads = wonQuery.data?.pagination.total ?? 0;
  const customFieldEntries = Object.entries(contact.customFields ?? {}).filter(([, v]) => v !== '' && v !== null);
  const qs = `?contactId=${encodeURIComponent(contactId)}`;

  const overview = (
    <div className="flex flex-col gap-ds-4">
      <div className="grid gap-ds-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total leads" value={totalLeads} icon={<Zap className="size-4" aria-hidden="true" />} />
        <Stat label="Won leads" value={wonLeads} icon={<TrendingUp className="size-4" aria-hidden="true" />} loading={wonQuery.loading} />
        <Stat
          label="Total revenue"
          value={formatRevenue(contact.paymentsTotal ?? 0)}
          hint="Payments received"
          icon={<IndianRupee className="size-4" aria-hidden="true" />}
        />
        <Stat
          label="Last interaction"
          value={lastInteraction ? formatDisplayDate(new Date(lastInteraction)) : '-'}
          hint={lastInteraction ? undefined : 'No messages or notes yet'}
          icon={<Clock className="size-4" aria-hidden="true" />}
          loading={timelineQuery.loading}
        />
      </div>

      <SectionCard title="Contact information">
        <dl className="grid gap-ds-4 sm:grid-cols-2">
          <InfoRow label="Email">{contact.email}</InfoRow>
          <InfoRow label="Phone">{contact.phone}</InfoRow>
          <InfoRow label="Company">{contact.company}</InfoRow>
          <InfoRow label="Type">
            <Tag tone="neutral" className="capitalize">{contact.type}</Tag>
          </InfoRow>
          <InfoRow label="Address">{contact.address}</InfoRow>
          <InfoRow label="City">{contact.city}</InfoRow>
          <InfoRow label="State">{contact.state}</InfoRow>
          <InfoRow label="Country">{contact.country}</InfoRow>
          <InfoRow label="Postal code">{contact.postalCode}</InfoRow>
          <InfoRow label="Tax ID">{contact.taxId}</InfoRow>
          <InfoRow label="Source">{humanize(contact.source)}</InfoRow>
          <InfoRow label="Preferred language">{contact.preferredLanguage?.toUpperCase()}</InfoRow>
          <InfoRow label="Birthday">
            {contact.birthday ? (
              <span className="inline-flex items-center gap-ds-1">
                <Calendar className="size-3.5 text-ds-foreground-muted" aria-hidden="true" />
                {formatDisplayDate(contact.birthday)}
              </span>
            ) : null}
          </InfoRow>
          <InfoRow label="Anniversary">{contact.anniversary ? formatDisplayDate(contact.anniversary) : null}</InfoRow>
        </dl>
      </SectionCard>

      {(contact.tags ?? []).length > 0 && (
        <SectionCard title="Tags">
          <div className="flex flex-wrap gap-ds-2">
            {(contact.tags ?? []).map((tag) => (
              <Tag key={tag} tone="primary">{tag}</Tag>
            ))}
          </div>
        </SectionCard>
      )}

      {contact.notes && (
        <SectionCard title="Notes">
          <p className="whitespace-pre-wrap text-sm text-ds-foreground">{contact.notes}</p>
        </SectionCard>
      )}

      {customFieldEntries.length > 0 && (
        <SectionCard title="Custom fields">
          <dl className="grid gap-ds-4 sm:grid-cols-2">
            {customFieldEntries.map(([name, value]) => (
              <InfoRow key={name} label={humanize(name)}>{value}</InfoRow>
            ))}
          </dl>
        </SectionCard>
      )}

      <SectionCard title="Record">
        <dl className="grid gap-ds-4 sm:grid-cols-3">
          <InfoRow label="Created">{dateOrDash(new Date(contact.createdAt))}</InfoRow>
          <InfoRow label="Last updated">{dateOrDash(new Date(contact.updatedAt))}</InfoRow>
          <InfoRow label="Created by">{contact.createdByName}</InfoRow>
        </dl>
      </SectionCard>
    </div>
  );

  return (
    <>
      <DetailPage<ContactRecord>
        assistant={{ contactId }}
        entity={contact}
        title={contact.name}
        subtitle={[contact.company, location].filter(Boolean).join(' - ') || undefined}
        status={<Tag tone="neutral" className="capitalize">{contact.type}</Tag>}
        onBack={() => router.push('/contacts')}
        messaging={{
          recipientId: contactId,
          recipientName: contact.name,
          email: contact.email,
          phone: contact.phone,
        }}
        primaryActions={
          <>
            {contact.phone && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/communication/calls/dial?phone=${encodeURIComponent(contact.phone ?? '')}&contactId=${encodeURIComponent(contact.id)}`)}
              >
                <Phone aria-hidden="true" /> Call
              </Button>
            )}
            <Button size="sm" onClick={() => router.push(`/contacts/${contactId}/edit`)}>
              <Pencil aria-hidden="true" /> Edit
            </Button>
          </>
        }
        actions={[
          { label: 'Create lead', icon: <Plus />, onSelect: () => router.push(`/leads/new${qs}`) },
          { label: 'Delete contact', icon: <Trash2 />, destructive: true, separatorBefore: true, onSelect: () => void handleDelete() },
        ]}
        overview={overview}
        activity={timelineItems(timeline)}
        activityLoading={timelineQuery.loading}
        related={[
          {
            title: 'Leads',
            action: <ViewAllLink href={`/leads${qs}`} total={leadsQuery.data?.pagination.total} />,
            content: (
              <RelatedTable<RelatedLead>
                testId="contact-leads"
                query={leadsQuery}
                rowKey={(l) => l.id}
                onRowClick={(l) => router.push(`/leads/${l.id}`)}
                emptyTitle="No leads for this contact yet"
                emptyDescription="Create a lead to start tracking a trip enquiry."
                emptyAction={{ label: 'Create lead', href: `/leads/new${qs}` }}
                columns={[
                  { header: 'Title', cell: (l) => <span className="font-medium">{l.title}</span> },
                  { header: 'Destination', cell: (l) => (l.destinations ?? []).join(', ') || '-' },
                  { header: 'Travel date', cell: (l) => dateOrDash(l.travelDate) },
                  { header: 'Budget', cell: (l) => money(l.budget, l.currency) },
                  { header: 'Status', cell: (l) => <Tag tone={leadTone(l.status)}>{humanize(l.status)}</Tag> },
                  { header: 'Assigned to', cell: (l) => l.assignedToName || '-' },
                ]}
              />
            ),
          },
          {
            title: 'Itineraries',
            action: <ViewAllLink href={`/itineraries${qs}`} total={itinerariesQuery.data?.pagination.total} />,
            content: (
              <RelatedTable<RelatedItinerary>
                testId="contact-itineraries"
                query={itinerariesQuery}
                rowKey={(i) => i.id}
                onRowClick={(i) => router.push(`/itineraries/${i.id}`)}
                emptyTitle="No itineraries yet"
                emptyDescription="Itineraries built for this contact's leads appear here."
                emptyAction={{ label: 'Create itinerary', href: `/itineraries/new${qs}` }}
                columns={[
                  { header: 'Title', cell: (i) => <span className="font-medium">{i.title}</span> },
                  { header: 'Days', cell: (i) => i.daysCount ?? '-' },
                  { header: 'Total', cell: (i) => money(i.grandTotal, i.currency) },
                  { header: 'Status', cell: (i) => <Tag tone="neutral">{humanize(i.status)}</Tag> },
                ]}
              />
            ),
          },
          {
            title: 'Invoices',
            action: <ViewAllLink href={`/invoices${qs}`} total={invoicesQuery.data?.pagination.total} />,
            content: (
              <RelatedTable<RelatedInvoice>
                testId="contact-invoices"
                query={invoicesQuery}
                rowKey={(i) => i.id}
                onRowClick={(i) => router.push(`/invoices/${i.id}`)}
                emptyTitle="No invoices for this contact yet"
                emptyDescription="Invoices raised for this contact appear here."
                emptyAction={{ label: 'Create invoice', href: `/invoices/new${qs}` }}
                columns={[
                  { header: 'Invoice', cell: (i) => <span className="font-medium">{i.invoiceNumber}</span> },
                  { header: 'Amount', cell: (i) => money(i.total, i.currency) },
                  { header: 'Issued', cell: (i) => dateOrDash(i.createdAt && new Date(i.createdAt)) },
                  { header: 'Due', cell: (i) => dateOrDash(i.dueDate) },
                  { header: 'Status', cell: (i) => <Tag tone={invoiceTone(i.status)}>{humanize(i.status)}</Tag> },
                ]}
              />
            ),
          },
          {
            title: 'Payments',
            action: <ViewAllLink href={`/payments${qs}`} total={paymentsQuery.data?.pagination.total} />,
            content: (
              <RelatedTable<RelatedPayment>
                testId="contact-payments"
                query={paymentsQuery}
                rowKey={(p) => p.id}
                onRowClick={(p) => router.push(`/payments/${p.id}`)}
                emptyTitle="No payments recorded yet"
                emptyDescription="Payments received from this contact appear here."
                emptyAction={{ label: 'Record payment', href: `/payments/new${qs}` }}
                columns={[
                  { header: 'Amount', cell: (p) => <span className="font-medium">{money(p.amount, p.currency)}</span> },
                  { header: 'Method', cell: (p) => humanize(p.method) || '-' },
                  { header: 'Date', cell: (p) => dateOrDash(p.date) },
                  { header: 'Invoice', cell: (p) => p.invoiceNumber || '-' },
                  { header: 'Reference', cell: (p) => p.reference || '-' },
                ]}
              />
            ),
          },
          {
            title: 'Follow-ups',
            action: <ViewAllLink href={`/follow-ups${qs}`} total={followUpsQuery.data?.pagination.total} />,
            content: (
              <RelatedTable<RelatedFollowUp>
                testId="contact-follow-ups"
                query={followUpsQuery}
                rowKey={(f) => f.id}
                onRowClick={(f) => router.push(`/leads/${f.leadId}`)}
                emptyTitle="No pending follow-ups"
                emptyDescription="Follow-ups scheduled on this contact's leads appear here."
                columns={[
                  { header: 'Type', cell: (f) => <span className="font-medium">{humanize(f.type)}</span> },
                  { header: 'Lead', cell: (f) => f.leadTitle || '-' },
                  { header: 'Scheduled', cell: (f) => dateOrDash(new Date(f.scheduledAt)) },
                  { header: 'Notes', cell: (f) => f.notes || '-' },
                ]}
              />
            ),
          },
        ]}
        documents={
          <div className="-m-ds-4">
            <RelatedTable<RelatedDocument>
              testId="contact-documents"
              query={documentsQuery}
              rowKey={(d) => d.id}
              emptyTitle="No documents yet"
              emptyDescription="Passports, proposals and contracts attached to this contact or its leads appear here."
              emptyAction={{ label: 'Open documents', href: `/documents${qs}` }}
              columns={[
                { header: 'Name', cell: (d) => <span className="font-medium">{d.name}</span> },
                { header: 'Category', cell: (d) => humanize(d.category) || '-' },
                { header: 'Size', cell: (d) => formatFileSize(d.size) },
                { header: 'Uploaded', cell: (d) => dateOrDash(d.createdAt && new Date(d.createdAt)) },
              ]}
            />
          </div>
        }
      />
      {confirmDialog}
    </>
  );
}
