'use client';


import { formatLocaleDate } from '@/lib/format';
import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  CheckCircle2, Circle, Download, Edit, Trash2, Upload,
} from 'lucide-react';
import { toast } from 'sonner';

import { DetailPage, type DetailAction } from '@/components/domain/detail-page';
import { SectionCard } from '@/components/ui/section-card';
import { Button } from '@/components/ui/button';
import { Tag } from '@/components/ui/tag';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { FileDropzone } from '@/components/ui/file-dropzone';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import {
  visaApi,
  visaService,
  visaTypeLabel,
  type VisaChecklistItem,
  type VisaDocument,
  type VisaRecord,
} from '@/lib/api/visa';

const STATUS_TONE: Record<string, 'neutral' | 'success' | 'danger' | 'warning' | 'info'> = {
  not_started: 'neutral',
  documents_collecting: 'info',
  applied: 'info',
  processing: 'warning',
  approved: 'success',
  rejected: 'danger',
};

const STATUS_LABEL: Record<string, string> = {
  not_started: 'Not Started',
  documents_collecting: 'Docs Collecting',
  applied: 'Applied',
  processing: 'Processing',
  approved: 'Approved',
  rejected: 'Rejected',
};

const DOCUMENT_TYPES = [
  { value: 'passport', label: 'Passport Copy' },
  { value: 'photo', label: 'Passport Photo' },
  { value: 'application_form', label: 'Application Form' },
  { value: 'bank_statement', label: 'Bank Statement' },
  { value: 'cover_letter', label: 'Cover Letter' },
  { value: 'invitation_letter', label: 'Invitation Letter' },
  { value: 'travel_insurance', label: 'Travel Insurance' },
  { value: 'hotel_booking', label: 'Hotel Booking' },
  { value: 'flight_itinerary', label: 'Flight Itinerary' },
  { value: 'employment_letter', label: 'Employment Letter' },
  { value: 'itr', label: 'ITR / Tax Returns' },
  { value: 'other', label: 'Other' },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(s?: string) {
  return s ? formatLocaleDate(s, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}

export default function VisaDetailPage() {
  const router = useRouter();
  const params = useParams();
  const visaId = params.id as string;
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [notes, setNotes] = React.useState('');
  const [isEditingNotes, setIsEditingNotes] = React.useState(false);
  const [selectedDocType, setSelectedDocType] = React.useState('other');
  const [isUploading, setIsUploading] = React.useState(false);
  const [deletingDocId, setDeletingDocId] = React.useState<string | null>(null);

  const { data: loadedVisa, loading, error } = useApiQuery(() => visaService.getById(visaId), [visaId]);
  const { data: loadedChecklist } = useApiQuery(() => visaService.getChecklist(visaId), [visaId]);

  // Local copies so a checklist toggle updates in place instead of re-running the
  // loading state (which would flash the skeleton and drop the active tab).
  const [visa, setVisa] = React.useState<VisaRecord | null>(null);
  const [checklist, setChecklist] = React.useState<VisaChecklistItem[]>([]);
  React.useEffect(() => { if (loadedVisa) setVisa(loadedVisa); }, [loadedVisa]);
  React.useEffect(() => { if (loadedChecklist) setChecklist(loadedChecklist); }, [loadedChecklist]);
  const { data: documentsResponse, refetch: refetchDocuments } = useApiQuery(() => visaApi.getDocuments(visaId), [visaId]);

  const documents: VisaDocument[] = React.useMemo(() => {
    const d = documentsResponse?.data;
    if (Array.isArray(d)) return d;
    if (d && typeof d === 'object' && 'data' in (d as Record<string, unknown>)) {
      const inner = (d as { data?: unknown }).data;
      return Array.isArray(inner) ? (inner as VisaDocument[]) : [];
    }
    return [];
  }, [documentsResponse]);


  const { mutate: deleteVisa } = useApiMutation<string, unknown>(() => visaApi.delete(visaId));
  const { mutate: updateChecklistItem } = useApiMutation<{ itemId: string; completed: boolean }, unknown>(
    ({ itemId, completed }) => visaService.setChecklistItem(visaId, itemId, completed),
  );
  const { mutate: saveNotes, loading: isSavingNotes } = useApiMutation<{ notes: string }, unknown>(
    (data) => visaService.update(visaId, data),
  );

  React.useEffect(() => {
    setNotes(visa?.notes ?? '');
  }, [visa?.notes]);

  const completedCount = checklist.filter((c) => c.completed).length;
  const progressPercent = checklist.length > 0 ? Math.round((completedCount / checklist.length) * 100) : 0;

  async function handleDelete() {
    const ok = await confirm({
      title: 'Delete Visa Record',
      description: `Are you sure you want to delete the visa record for ${visa?.travellerName}? This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'destructive',
    });
    if (!ok) return;
    const result = await deleteVisa(visaId);
    if (result !== null) {
      toast.success('Visa record deleted');
      router.push('/visa');
    } else {
      toast.error('Failed to delete visa record');
    }
  }

  async function handleToggleChecklistItem(item: VisaChecklistItem) {
    const result = await updateChecklistItem({ itemId: item.id, completed: !item.completed });
    if (result) {
      toast.success(item.completed ? 'Item unchecked' : 'Item completed');
      setChecklist((prev) => prev.map((c) => (c.id === item.id ? { ...c, completed: !item.completed } : c)));
      // The backend may advance the status when required documents are all received.
      void visaService.getById(visaId).then(setVisa).catch(() => {});
    }
  }

  async function handleSaveNotes() {
    const result = await saveNotes({ notes });
    if (result) {
      toast.success('Notes saved');
      setIsEditingNotes(false);
      setVisa((prev) => (prev ? { ...prev, notes } : prev));
    } else {
      toast.error('Failed to save notes');
    }
  }

  async function handleFileUpload(files: File[]) {
    const file = files[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error('File too large. Maximum size is 10MB.');
      return;
    }
    const allowedTypes = [
      'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (!allowedTypes.includes(file.type)) {
      toast.error('File type not allowed. Accepted: PDF, JPEG, PNG, WebP, DOCX');
      return;
    }

    setIsUploading(true);
    try {
      const result = await visaApi.uploadDocument(visaId, file, selectedDocType);
      if (result) {
        toast.success('Document uploaded successfully');
        refetchDocuments();
      } else {
        toast.error('Failed to upload document');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload document');
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDownloadDocument(doc: VisaDocument) {
    try {
      const blob = await visaApi.downloadDocument(visaId, doc.id);
      const url = window.URL.createObjectURL(blob as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.file_name;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {
      toast.error('Failed to download document');
    }
  }

  async function handleDeleteDocument(docId: string) {
    setDeletingDocId(docId);
    try {
      await visaApi.deleteDocument(visaId, docId);
      toast.success('Document deleted');
      refetchDocuments();
    } catch {
      toast.error('Failed to delete document');
    } finally {
      setDeletingDocId(null);
    }
  }

  if (loading || (!visa && !error)) {
    return (
      <div className="flex flex-col gap-ds-4 p-ds-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error || !visa) {
    return (
      <EmptyState
        title="Failed to load visa record"
        action={<Button variant="outline" onClick={() => router.push('/visa')}>Back to Visa</Button>}
      />
    );
  }

  const actions: DetailAction[] = [
    { label: 'Edit', icon: <Edit />, onSelect: () => router.push(`/visa/${visaId}/edit`) },
    { label: 'Delete', icon: <Trash2 />, onSelect: handleDelete, destructive: true, separatorBefore: true },
  ];

  return (
    <>
      <DetailPage<VisaRecord>
        entity={visa}
        title={visa.travellerName}
        subtitle={`${visa.countryName}${visa.visaType ? ` · ${visaTypeLabel(visa.visaType)}` : ''}`}
        status={<Tag tone={STATUS_TONE[visa.status] ?? 'info'}>{STATUS_LABEL[visa.status] ?? visa.status}</Tag>}
        onBack={() => router.push('/visa')}
        actions={actions}
        overview={
          <div className="grid gap-ds-4 lg:grid-cols-2">
            <SectionCard title="Traveller Information">
              <dl className="flex flex-col gap-ds-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ds-foreground-muted">Name</dt>
                  <dd className="font-medium">{visa.travellerName}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ds-foreground-muted">Passport Number</dt>
                  <dd className="font-mono font-medium">{visa.passportNumber}</dd>
                </div>
              </dl>
            </SectionCard>

            <SectionCard title="Visa Information">
              <dl className="flex flex-col gap-ds-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ds-foreground-muted">Country</dt>
                  <dd className="font-medium">{visa.countryName}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ds-foreground-muted">Visa Type</dt>
                  <dd className="font-medium">{visaTypeLabel(visa.visaType) || '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ds-foreground-muted">Application Date</dt>
                  <dd className="font-medium">{formatDate(visa.applicationDate)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ds-foreground-muted">Expiry Date</dt>
                  <dd className="font-medium">{formatDate(visa.expiryDate)}</dd>
                </div>
              </dl>
            </SectionCard>

            <SectionCard title="Checklist" className="lg:col-span-2">
              <div className="flex flex-col gap-ds-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Progress</span>
                  <span className="text-ds-foreground-muted">{completedCount}/{checklist.length} completed</span>
                </div>
                <Progress value={progressPercent} />
                {checklist.length === 0 ? (
                  <EmptyState title="No checklist items" />
                ) : (
                  <div className="flex flex-col gap-ds-2">
                    {checklist.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleToggleChecklistItem(item)}
                        className="flex items-center gap-ds-3 rounded-ds-md border border-ds-border bg-ds-surface px-ds-3 py-ds-2 text-left transition-colors hover:bg-ds-surface-sunken"
                      >
                        {item.completed ? (
                          <CheckCircle2 className="size-4 shrink-0 text-ds-success" aria-hidden="true" />
                        ) : (
                          <Circle className="size-4 shrink-0 text-ds-foreground-subtle" aria-hidden="true" />
                        )}
                        <span className={item.completed ? 'text-sm text-ds-foreground-muted line-through' : 'text-sm'}>
                          {item.item}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </SectionCard>

            <SectionCard title="Notes" className="lg:col-span-2">
              {isEditingNotes ? (
                <div className="flex flex-col gap-ds-3">
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} placeholder="Add notes about this visa application…" />
                  <div className="flex justify-end gap-ds-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setNotes(visa.notes ?? '');
                        setIsEditingNotes(false);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleSaveNotes} disabled={isSavingNotes}>Save</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-ds-3">
                  <p className="whitespace-pre-wrap text-sm text-ds-foreground-muted">{notes || 'No notes yet.'}</p>
                  <Button variant="outline" size="sm" onClick={() => setIsEditingNotes(true)}>
                    <Edit /> Edit
                  </Button>
                </div>
              )}
            </SectionCard>
          </div>
        }
        documents={
          <div className="flex flex-col gap-ds-4">
            <div className="flex flex-col gap-ds-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Select value={selectedDocType} onValueChange={setSelectedDocType}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_TYPES.map((dt) => (
                      <SelectItem key={dt.value} value={dt.value}>{dt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <FileDropzone
              onFiles={handleFileUpload}
              accept=".pdf,.jpg,.jpeg,.png,.webp,.docx"
              disabled={isUploading}
              label={isUploading ? 'Uploading…' : 'Drop a document here, or browse'}
              hint="Accepted formats: PDF, JPEG, PNG, WebP, DOCX. Maximum size: 10MB."
            />
            {documents.length === 0 ? (
              <EmptyState
                icon={<Upload />}
                title="No documents uploaded yet"
                description="Upload passport copies, application forms, and other required documents."
              />
            ) : (
              <div className="flex flex-col gap-ds-2">
                {documents.map((doc) => {
                  const docTypeLabel = DOCUMENT_TYPES.find((dt) => dt.value === doc.document_type)?.label || doc.document_type || 'Other';
                  return (
                    <div key={doc.id} className="flex items-center gap-ds-3 rounded-ds-md border border-ds-border bg-ds-surface px-ds-3 py-ds-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{doc.file_name}</p>
                        <div className="flex items-center gap-ds-2 text-xs text-ds-foreground-muted">
                          <Tag size="sm">{docTypeLabel}</Tag>
                          <span>{formatFileSize(doc.file_size)}</span>
                          {doc.uploader_name && <span>by {doc.uploader_name}</span>}
                          <span>{formatDate(doc.created_at)}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-ds-1">
                        <Button variant="ghost" size="icon-sm" aria-label="Download" onClick={() => handleDownloadDocument(doc)}>
                          <Download />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Delete"
                          onClick={() => handleDeleteDocument(doc.id)}
                          disabled={deletingDocId === doc.id}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        }
        activity={[
          { id: 'created', title: 'Application created', timestamp: formatDate(visa.createdAt) },
          ...(visa.applicationDate
            ? [{ id: 'applied', title: 'Application submitted', timestamp: formatDate(visa.applicationDate) }]
            : []),
          {
            id: 'status',
            title: `Status: ${STATUS_LABEL[visa.status] ?? visa.status}`,
            timestamp: formatDate(visa.updatedAt),
          },
        ]}
      />
      {confirmDialog}
    </>
  );
}
