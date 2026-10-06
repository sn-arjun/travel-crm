'use client';

import { AiFeaturePageGate } from '@/components/domain/ai/ai-feature-page-gate';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, Inbox, Mail, MessageSquare, Phone, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { ListPage } from '@/components/domain';
import { Button, Tag } from '@/components/ui';
import type { DataTableColumn } from '@/components/ui';
import { aiExtractionsApi, type AiExtraction, type ExtractionSourceType } from '@/lib/api/ai-extractions';
import { toLocalDateString } from '@/lib/dates';

const SOURCE_LABEL: Record<ExtractionSourceType, string> = {
  call: 'Call',
  email: 'Email',
  whatsapp: 'WhatsApp',
  document: 'Document',
  business_card: 'Business card',
};

const SOURCE_ICON: Record<ExtractionSourceType, React.ComponentType<{ className?: string }>> = {
  call: Phone,
  email: Mail,
  whatsapp: MessageSquare,
  document: Inbox,
  business_card: Inbox,
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

function toCsv(rows: AiExtraction[]) {
  const header = ['Source', 'Contact', 'Status', 'Confidence', 'Created At'];
  const lines = rows.map((r) =>
    [
      SOURCE_LABEL[r.sourceType],
      r.contactName ?? '',
      r.status,
      `${r.overallConfidence}%`,
      r.createdAt,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(','),
  );
  return [header.join(','), ...lines].join('\n');
}

function ExtractionsQueueContent() {
  const router = useRouter();
  const [refetchKey, setRefetchKey] = React.useState(0);
  const [statusFilter, setStatusFilter] = React.useState<AiExtraction['status'] | null>('pending');

  const handleConfirm = async (id: string) => {
    try {
      await aiExtractionsApi.confirm(id);
      toast.success('Extraction confirmed');
      setRefetchKey((k) => k + 1);
    } catch {
      toast.error('Could not confirm extraction');
    }
  };

  const handleReject = async (id: string) => {
    try {
      await aiExtractionsApi.reject(id);
      toast.success('Extraction rejected');
      setRefetchKey((k) => k + 1);
    } catch {
      toast.error('Could not reject extraction');
    }
  };

  const handleExport = (rows: AiExtraction[]) => {
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-extractions-${toLocalDateString(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns: DataTableColumn<AiExtraction>[] = [
    {
      key: 'sourceType',
      header: 'Source',
      sortable: true,
      cell: (r) => {
        const Icon = SOURCE_ICON[r.sourceType];
        return (
          <div className="flex items-center gap-ds-2">
            <Icon className="size-4 shrink-0 text-ds-foreground-muted" aria-hidden="true" />
            <span className="font-medium">{SOURCE_LABEL[r.sourceType]}</span>
          </div>
        );
      },
    },
    {
      key: 'contactName',
      header: 'Contact',
      cell: (r) => r.contactName ?? <span className="text-ds-foreground-subtle">Unmatched</span>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => <Tag tone={STATUS_TONE[r.status]}>{r.status}</Tag>,
    },
    {
      key: 'overallConfidence',
      header: 'Confidence',
      align: 'right',
      sortable: true,
      cell: (r) => <Tag tone={confidenceTone(r.overallConfidence)}>{r.overallConfidence}%</Tag>,
    },
    {
      key: 'createdAt',
      header: 'Received',
      sortable: true,
      cell: (r) => (
        <span className="text-ds-foreground-muted">{new Date(r.createdAt).toLocaleString('en-IN')}</span>
      ),
    },
  ];

  const filters = statusFilter ? [{ id: 'status', label: 'Status', value: statusFilter }] : [];

  return (
    <ListPage<AiExtraction>
      refreshKey={refetchKey}
      title="AI Extractions"
      description="Review data the AI pulled from calls, emails, WhatsApp, and documents before it lands in the CRM."
      getRowId={(r) => r.id}
      fetcher={({ page, limit, search }) =>
        aiExtractionsApi.list({ page, limit, search, status: statusFilter ?? undefined })
      }
      searchPlaceholder="Search by contact or source..."
      filters={filters}
      onRemoveFilter={() => setStatusFilter(null)}
      onClearFilters={() => setStatusFilter(null)}
      columns={columns}
      onRowClick={(r) => router.push(`/ai/extractions/${r.id}`)}
      rowActions={(r) =>
        r.status === 'pending' ? (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Confirm"
              onClick={(e) => {
                e.stopPropagation();
                void handleConfirm(r.id);
              }}
            >
              <Check />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Reject"
              onClick={(e) => {
                e.stopPropagation();
                void handleReject(r.id);
              }}
            >
              <X />
            </Button>
          </>
        ) : null
      }
      bulkActions={[
        {
          label: 'Confirm',
          icon: <Check />,
          onSelect: async (rows) => {
            await Promise.all(rows.filter((r) => r.status === 'pending').map((r) => aiExtractionsApi.confirm(r.id)));
            toast.success(`${rows.length} extraction${rows.length === 1 ? '' : 's'} confirmed`);
            setRefetchKey((k) => k + 1);
          },
        },
        {
          label: 'Reject',
          icon: <X />,
          destructive: true,
          onSelect: async (rows) => {
            await Promise.all(rows.filter((r) => r.status === 'pending').map((r) => aiExtractionsApi.reject(r.id)));
            toast.success(`${rows.length} extraction${rows.length === 1 ? '' : 's'} rejected`);
            setRefetchKey((k) => k + 1);
          },
        },
      ]}
      onExport={handleExport}
      exportLabel="Export CSV"
      emptyTitle="No extractions to review"
      emptyDescription="Enquiries the AI parses from calls, emails, WhatsApp, and documents will queue up here for review."
      emptyIcon={<Sparkles className="size-10 text-ds-foreground-subtle" aria-hidden="true" />}
    />
  );
}

export default function AiExtractionsPage() {
  return (
    <AiFeaturePageGate feature="ai_extraction" title="AI Extractions" featureName="AI Extractions" benefit="AI-powered extraction from calls, emails, and documents">
      <ExtractionsQueueContent />
    </AiFeaturePageGate>
  );
}
