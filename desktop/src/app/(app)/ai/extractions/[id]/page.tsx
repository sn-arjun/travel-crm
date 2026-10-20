'use client';


import { formatLocaleDateTime } from '@/lib/format';
import { AiFeaturePageGate } from '@/components/domain/ai/ai-feature-page-gate';
import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Calendar,
  Check,
  FileText,
  Receipt,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { DetailPage } from '@/components/domain';
import {
  Button,
  DatePicker,
  EmptyState,
  Input,
  SectionCard,
  Skeleton,
  Tag,
  Textarea,
} from '@/components/ui';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { aiExtractionsApi, type AiExtraction, type ExtractionSourceType } from '@/lib/api/ai-extractions';

const SOURCE_LABEL: Record<ExtractionSourceType, string> = {
  call: 'Call',
  email: 'Email',
  whatsapp: 'WhatsApp',
  document: 'Document',
  business_card: 'Business card',
};

const STATUS_TONE: Record<AiExtraction['status'], 'success' | 'danger' | 'warning'> = {
  confirmed: 'success',
  rejected: 'danger',
  pending: 'warning',
};

function confidenceTone(confidence: number): 'success' | 'warning' | 'danger' {
  if (confidence >= 85) return 'success';
  if (confidence >= 65) return 'warning';
  return 'danger';
}

function ExtractionDetailContent({ id }: { id: string }) {
  const router = useRouter();
  const { data, loading, refetch } = useApiQuery(() => aiExtractionsApi.getById(id), [id]);
  const extraction: AiExtraction | null = (data as { data?: AiExtraction })?.data ?? null;

  const [rejectionReason, setRejectionReason] = React.useState('');
  const [showRejectForm, setShowRejectForm] = React.useState(false);
  const [followupDate, setFollowupDate] = React.useState<Date | undefined>(undefined);
  const [followupNote, setFollowupNote] = React.useState('');
  const [showFollowupForm, setShowFollowupForm] = React.useState(false);
  const [editedFields, setEditedFields] = React.useState<Record<string, string>>({});

  const { mutate: confirm, loading: confirming } = useApiMutation(() =>
    aiExtractionsApi.confirm(id, Object.keys(editedFields).length > 0 ? { fields: editedFields } : undefined),
  );
  const { mutate: reject, loading: rejecting } = useApiMutation(() =>
    aiExtractionsApi.reject(id, { reason: rejectionReason || undefined }),
  );
  const { mutate: createInvoice, loading: creatingInvoice } = useApiMutation(() =>
    aiExtractionsApi.createInvoice(id),
  );
  const { mutate: createItinerary, loading: creatingItinerary } = useApiMutation(() =>
    aiExtractionsApi.createItinerary(id),
  );
  const { mutate: scheduleFollowup, loading: schedulingFollowup } = useApiMutation(() =>
    aiExtractionsApi.scheduleFollowup(id, { dueDate: (followupDate ?? new Date()).toISOString(), note: followupNote || undefined }),
  );

  if (loading) {
    return (
      <div className="flex flex-col gap-ds-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!extraction) {
    return (
      <EmptyState
        title="Extraction not found"
        description="This extraction may have been removed."
        action={
          <Button size="sm" onClick={() => router.push('/ai/extractions')}>
            Back to queue
          </Button>
        }
      />
    );
  }

  const handleConfirm = async () => {
    const result = await confirm(undefined);
    if (result) {
      toast.success('Extraction confirmed');
      refetch();
    } else {
      toast.error('Could not confirm extraction');
    }
  };

  const handleReject = async () => {
    const result = await reject(undefined);
    if (result) {
      toast.success('Extraction rejected');
      setShowRejectForm(false);
      refetch();
    } else {
      toast.error('Could not reject extraction');
    }
  };

  const handleCreateInvoice = async () => {
    const result = await createInvoice(undefined);
    if (result) {
      toast.success('Invoice created from extraction');
      const invoiceId = (result as { data?: { invoiceId: string } })?.data?.invoiceId;
      if (invoiceId) router.push(`/invoices/${invoiceId}`);
    } else {
      toast.error('Could not create invoice');
    }
  };

  const handleCreateItinerary = async () => {
    const result = await createItinerary(undefined);
    if (result) {
      toast.success('Itinerary created from extraction');
      const itineraryId = (result as { data?: { itineraryId: string } })?.data?.itineraryId;
      if (itineraryId) router.push(`/itineraries/${itineraryId}`);
    } else {
      toast.error('Could not create itinerary');
    }
  };

  const handleScheduleFollowup = async () => {
    if (!followupDate) {
      toast.error('Pick a follow-up date');
      return;
    }
    const result = await scheduleFollowup(undefined);
    if (result) {
      toast.success('Follow-up scheduled');
      setShowFollowupForm(false);
    } else {
      toast.error('Could not schedule follow-up');
    }
  };

  const isPending = extraction.status === 'pending';

  return (
    <DetailPage<AiExtraction>
      entity={extraction}
      title={`${SOURCE_LABEL[extraction.sourceType]} extraction`}
      subtitle={extraction.contactName ?? 'Unmatched contact'}
      status={<Tag tone={STATUS_TONE[extraction.status]}>{extraction.status}</Tag>}
      onBack={() => router.push('/ai/extractions')}
      primaryActions={
        isPending ? (
          <>
            <Button variant="outline" size="sm" className="gap-ds-2" onClick={() => setShowFollowupForm((v) => !v)}>
              <Calendar aria-hidden="true" />
              Schedule follow-up
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-ds-2"
              onClick={handleCreateItinerary}
              disabled={creatingItinerary}
            >
              <FileText aria-hidden="true" />
              {creatingItinerary ? 'Creating…' : 'Create itinerary'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-ds-2"
              onClick={handleCreateInvoice}
              disabled={creatingInvoice}
            >
              <Receipt aria-hidden="true" />
              {creatingInvoice ? 'Creating…' : 'Create invoice'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-ds-2"
              onClick={() => setShowRejectForm((v) => !v)}
              disabled={rejecting}
            >
              <X aria-hidden="true" />
              Reject
            </Button>
            <Button size="sm" className="gap-ds-2" onClick={handleConfirm} disabled={confirming}>
              <Check aria-hidden="true" />
              {confirming ? 'Confirming…' : 'Confirm'}
            </Button>
          </>
        ) : undefined
      }
      overview={
        <div className="flex flex-col gap-ds-4">
          {showRejectForm && (
            <SectionCard title="Reject extraction">
              <div className="flex flex-col gap-ds-3">
                <Textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.currentTarget.value)}
                  placeholder="Why is this extraction being rejected? (optional)"
                  rows={3}
                />
                <div className="flex gap-ds-2">
                  <Button size="sm" variant="destructive" onClick={handleReject} disabled={rejecting}>
                    {rejecting ? 'Rejecting…' : 'Confirm reject'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowRejectForm(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </SectionCard>
          )}

          {showFollowupForm && (
            <SectionCard title="Schedule follow-up">
              <div className="flex flex-col gap-ds-3 sm:max-w-md">
                <DatePicker value={followupDate} onChange={setFollowupDate} />
                <Textarea
                  value={followupNote}
                  onChange={(e) => setFollowupNote(e.currentTarget.value)}
                  placeholder="Follow-up note (optional)"
                  rows={2}
                />
                <div className="flex gap-ds-2">
                  <Button size="sm" onClick={handleScheduleFollowup} disabled={schedulingFollowup}>
                    {schedulingFollowup ? 'Scheduling…' : 'Schedule'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowFollowupForm(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </SectionCard>
          )}

          <SectionCard
            title="Extracted fields"
            description={`Overall confidence: ${extraction.overallConfidence}%`}
          >
            <div className="grid grid-cols-1 gap-ds-4 sm:grid-cols-2">
              {extraction.fields.map((field) => (
                <div key={field.key} className="flex flex-col gap-ds-1">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-ds-foreground" htmlFor={`field-${field.key}`}>
                      {field.label}
                    </label>
                    <Tag tone={confidenceTone(field.confidence)}>{field.confidence}%</Tag>
                  </div>
                  <Input
                    id={`field-${field.key}`}
                    defaultValue={field.value}
                    disabled={!isPending}
                    onChange={(e) =>
                      setEditedFields((prev) => ({ ...prev, [field.key]: e.currentTarget.value }))
                    }
                  />
                </div>
              ))}
              {extraction.fields.length === 0 && (
                <p className="text-sm text-ds-foreground-muted">No fields were extracted.</p>
              )}
            </div>
          </SectionCard>

          {extraction.rejectionReason && (
            <SectionCard title="Rejection reason">
              <p className="text-sm text-ds-foreground-muted">{extraction.rejectionReason}</p>
            </SectionCard>
          )}

          <SectionCard title="Source">
            <dl className="grid grid-cols-1 gap-ds-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-ds-foreground-muted">Source type</dt>
                <dd className="text-sm text-ds-foreground">{SOURCE_LABEL[extraction.sourceType]}</dd>
              </div>
              {extraction.sourceLabel && (
                <div>
                  <dt className="text-xs text-ds-foreground-muted">Detail</dt>
                  <dd className="text-sm text-ds-foreground">{extraction.sourceLabel}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-ds-foreground-muted">Received</dt>
                <dd className="text-sm text-ds-foreground">
                  {formatLocaleDateTime(extraction.createdAt)}
                </dd>
              </div>
              {extraction.reviewedAt && (
                <div>
                  <dt className="text-xs text-ds-foreground-muted">Reviewed</dt>
                  <dd className="text-sm text-ds-foreground">
                    {formatLocaleDateTime(extraction.reviewedAt)}
                  </dd>
                </div>
              )}
            </dl>
          </SectionCard>
        </div>
      }
    />
  );
}

export default function AiExtractionDetailPage() {
  const params = useParams<{ id: string }>();
  return (
    <AiFeaturePageGate feature="ai_extraction" title="AI Extraction" featureName="AI Extractions" benefit="AI-powered extraction from calls, emails, and documents">
      <ExtractionDetailContent id={params.id} />
    </AiFeaturePageGate>
  );
}
