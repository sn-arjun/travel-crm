'use client';

import { AiFeaturePageGate } from '@/components/domain/ai/ai-feature-page-gate';
import * as React from 'react';
import { BookOpen, Check, DollarSign, FileText, ScanLine, X } from 'lucide-react';
import { toast } from 'sonner';
import { ListPage } from '@/components/domain';
import { Button, Input, SectionCard, Tag, Textarea } from '@/components/ui';
import type { DataTableColumn } from '@/components/ui';
import { aiApi, type DocumentScan } from '@/lib/api/ai';
import { toLocalDateString } from '@/lib/dates';

const TYPE_LABEL: Record<DocumentScan['documentType'], string> = {
  passport: 'Passport',
  visa: 'Visa',
  invoice: 'Supplier Invoice',
  business_card: 'Business Card',
};

const TYPE_ICON: Record<DocumentScan['documentType'], React.ComponentType<{ className?: string }>> = {
  passport: BookOpen,
  visa: FileText,
  invoice: DollarSign,
  business_card: BookOpen,
};

const STATUS_TONE: Record<DocumentScan['status'], 'success' | 'danger' | 'warning'> = {
  applied: 'success',
  rejected: 'danger',
  pending: 'warning',
};

function confidenceTone(confidence: number): 'success' | 'warning' | 'danger' {
  if (confidence >= 85) return 'success';
  if (confidence >= 65) return 'warning';
  return 'danger';
}

function toCsv(rows: DocumentScan[]) {
  const header = ['Type', 'Contact', 'Status', 'Confidence', 'Scanned At'];
  const lines = rows.map((r) =>
    [TYPE_LABEL[r.documentType], r.contactName ?? '', r.status, `${r.overallConfidence}%`, r.createdAt]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(','),
  );
  return [header.join(','), ...lines].join('\n');
}

function ScanDetail({ scan, onDone }: { scan: DocumentScan; onDone: () => void }) {
  const [rejectionReason, setRejectionReason] = React.useState('');
  const [showReject, setShowReject] = React.useState(false);
  const [editedFields, setEditedFields] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const Icon = TYPE_ICON[scan.documentType];

  const handleApply = async () => {
    setBusy(true);
    try {
      await aiApi.intelligence.applyDocumentScan(
        scan.id,
        Object.keys(editedFields).length > 0 ? { fields: editedFields } : undefined,
      );
      toast.success('Scan applied');
      onDone();
    } catch {
      toast.error('Could not apply scan');
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    setBusy(true);
    try {
      await aiApi.intelligence.rejectDocumentScan(scan.id, { reason: rejectionReason || undefined });
      toast.success('Scan rejected');
      onDone();
    } catch {
      toast.error('Could not reject scan');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-ds-4">
      <div className="flex items-center gap-ds-2">
        <Icon className="size-5 text-ds-foreground-muted" aria-hidden="true" />
        <span className="font-medium text-ds-foreground">{TYPE_LABEL[scan.documentType]}</span>
        <Tag tone={STATUS_TONE[scan.status]}>{scan.status}</Tag>
      </div>

      <SectionCard title="Extracted fields" description={`Overall confidence: ${scan.overallConfidence}%`}>
        <div className="grid grid-cols-1 gap-ds-4">
          {scan.extractedFields.map((field) => (
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
                disabled={scan.status !== 'pending'}
                onChange={(e) => setEditedFields((prev) => ({ ...prev, [field.key]: e.currentTarget.value }))}
              />
            </div>
          ))}
          {scan.extractedFields.length === 0 && (
            <p className="text-sm text-ds-foreground-muted">No fields were extracted.</p>
          )}
        </div>
      </SectionCard>

      {scan.rejectionReason && (
        <SectionCard title="Rejection reason">
          <p className="text-sm text-ds-foreground-muted">{scan.rejectionReason}</p>
        </SectionCard>
      )}

      {scan.status === 'pending' && (
        <>
          {showReject && (
            <SectionCard title="Reject scan">
              <div className="flex flex-col gap-ds-3">
                <Textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.currentTarget.value)}
                  placeholder="Why is this scan being rejected? (optional)"
                  rows={3}
                />
                <div className="flex gap-ds-2">
                  <Button size="sm" variant="destructive" onClick={handleReject} disabled={busy}>
                    {busy ? 'Rejecting…' : 'Confirm reject'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowReject(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </SectionCard>
          )}

          {!showReject && (
            <div className="flex gap-ds-2">
              <Button size="sm" className="gap-ds-2" onClick={handleApply} disabled={busy}>
                <Check className="size-4" aria-hidden="true" />
                {busy ? 'Applying…' : 'Apply'}
              </Button>
              <Button size="sm" variant="outline" className="gap-ds-2" onClick={() => setShowReject(true)} disabled={busy}>
                <X className="size-4" aria-hidden="true" />
                Reject
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function DocumentScansContent() {
  const [refetchKey, setRefetchKey] = React.useState(0);

  const handleApply = async (id: string) => {
    try {
      await aiApi.intelligence.applyDocumentScan(id);
      toast.success('Scan applied');
      setRefetchKey((k) => k + 1);
    } catch {
      toast.error('Could not apply scan');
    }
  };

  const handleReject = async (id: string) => {
    try {
      await aiApi.intelligence.rejectDocumentScan(id);
      toast.success('Scan rejected');
      setRefetchKey((k) => k + 1);
    } catch {
      toast.error('Could not reject scan');
    }
  };

  const columns: DataTableColumn<DocumentScan>[] = [
    {
      key: 'documentType',
      header: 'Type',
      sortable: true,
      cell: (r) => {
        const Icon = TYPE_ICON[r.documentType];
        return (
          <div className="flex items-center gap-ds-2">
            <Icon className="size-4 shrink-0 text-ds-foreground-muted" aria-hidden="true" />
            <span className="font-medium">{TYPE_LABEL[r.documentType]}</span>
          </div>
        );
      },
    },
    {
      key: 'contactName',
      header: 'Contact',
      cell: (r) => r.contactName ?? <span className="text-ds-foreground-subtle">Unmatched</span>,
    },
    { key: 'status', header: 'Status', cell: (r) => <Tag tone={STATUS_TONE[r.status]}>{r.status}</Tag> },
    {
      key: 'overallConfidence',
      header: 'Confidence',
      align: 'right',
      sortable: true,
      cell: (r) => <Tag tone={confidenceTone(r.overallConfidence)}>{r.overallConfidence}%</Tag>,
    },
    {
      key: 'createdAt',
      header: 'Scanned',
      sortable: true,
      cell: (r) => <span className="text-ds-foreground-muted">{new Date(r.createdAt).toLocaleString('en-IN')}</span>,
    },
  ];

  return (
    <ListPage<DocumentScan>
      refreshKey={refetchKey}
      title="Document Scans"
      description="Review OCR-extracted data from passports, visas, and supplier invoices before applying it."
      getRowId={(r) => r.id}
      fetcher={({ page, limit, search }) => aiApi.intelligence.listDocumentScans({ page, limit, search })}
      searchPlaceholder="Search by contact or type..."
      columns={columns}
      renderDetail={(r) => <ScanDetail scan={r} onDone={() => setRefetchKey((k) => k + 1)} />}
      detailTitle={(r) => `${TYPE_LABEL[r.documentType]} scan`}
      rowActions={(r) =>
        r.status === 'pending' ? (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Apply"
              onClick={(e) => {
                e.stopPropagation();
                void handleApply(r.id);
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
          label: 'Apply',
          icon: <Check />,
          onSelect: async (rows) => {
            await Promise.all(rows.filter((r) => r.status === 'pending').map((r) => aiApi.intelligence.applyDocumentScan(r.id)));
            toast.success(`${rows.length} scan${rows.length === 1 ? '' : 's'} applied`);
            setRefetchKey((k) => k + 1);
          },
        },
        {
          label: 'Reject',
          icon: <X />,
          destructive: true,
          onSelect: async (rows) => {
            await Promise.all(rows.filter((r) => r.status === 'pending').map((r) => aiApi.intelligence.rejectDocumentScan(r.id)));
            toast.success(`${rows.length} scan${rows.length === 1 ? '' : 's'} rejected`);
            setRefetchKey((k) => k + 1);
          },
        },
      ]}
      onExport={(rows) => {
        const csv = toCsv(rows);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ai-document-scans-${toLocalDateString(new Date())}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }}
      exportLabel="Export CSV"
      emptyTitle="No document scans yet"
      emptyDescription="Scan a passport, visa, or supplier invoice from the OCR page to review it here."
      emptyIcon={<ScanLine className="size-10 text-ds-foreground-subtle" aria-hidden="true" />}
    />
  );
}

export default function DocumentScansPage() {
  return (
    <AiFeaturePageGate feature="ai_intelligence" title="Document Scans" featureName="AI Intelligence" benefit="AI-powered document scanning">
      <DocumentScansContent />
    </AiFeaturePageGate>
  );
}
