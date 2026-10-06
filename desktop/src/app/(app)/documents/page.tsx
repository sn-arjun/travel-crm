'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Download, FileText, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { ListPage, RelationCombobox } from '@/components/domain';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FileDropzone,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useConfirm,
} from '@/components/ui';
import { documentsApi, type Document } from '@/lib/api/documents';
import { leadsApi } from '@/lib/api/leads';
import { itinerariesApi } from '@/lib/api/itineraries';
import { unwrapList } from '@/lib/api/envelope';

const CATEGORIES = ['passport', 'visa', 'invoice', 'contract', 'other'] as const;

function formatBytes(bytes: number): string {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileType(mimeType: string): string {
  if (mimeType.includes('pdf')) return 'PDF';
  if (mimeType.includes('spreadsheet') || mimeType.includes('xlsx')) return 'XLSX';
  if (mimeType.includes('word') || mimeType.includes('docx')) return 'DOCX';
  if (mimeType.startsWith('image/')) return mimeType.split('/')[1]?.toUpperCase() ?? 'IMAGE';
  return 'FILE';
}

interface UploadFormState {
  file: File | null;
  name: string;
  category: string;
  leadId: string | null;
  itineraryId: string | null;
}

const EMPTY_UPLOAD: UploadFormState = { file: null, name: '', category: 'other', leadId: null, itineraryId: null };

export default function DocumentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [categoryFilter, setCategoryFilter] = React.useState<string>('all');
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [uploadForm, setUploadForm] = React.useState<UploadFormState>(EMPTY_UPLOAD);
  const [uploading, setUploading] = React.useState(false);

  const [renameTarget, setRenameTarget] = React.useState<Document | null>(null);
  const [renameValue, setRenameValue] = React.useState('');
  const [renaming, setRenaming] = React.useState(false);

  const [refreshKey, setRefreshKey] = React.useState(0);
  // The detail drawer keeps the row it was opened with; renamed rows show their new name there.
  const [renamed, setRenamed] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    const leadId = searchParams.get('leadId');
    const itineraryId = searchParams.get('itineraryId');
    if (leadId || itineraryId) {
      setUploadForm((f) => ({ ...f, leadId: leadId ?? f.leadId, itineraryId: itineraryId ?? f.itineraryId }));
      setUploadOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filters = React.useMemo(
    () => (categoryFilter !== 'all' ? [{ id: 'category', label: 'Category', value: categoryFilter }] : []),
    [categoryFilter],
  );

  const handleUpload = async () => {
    if (!uploadForm.file) {
      toast.error('Choose a file to upload');
      return;
    }
    setUploading(true);
    try {
      await documentsApi.upload({
        file: uploadForm.file,
        name: uploadForm.name || uploadForm.file.name,
        category: uploadForm.category,
        leadId: uploadForm.leadId ?? undefined,
        itineraryId: uploadForm.itineraryId ?? undefined,
      });
      toast.success('Document uploaded');
      setUploadOpen(false);
      setUploadForm(EMPTY_UPLOAD);
      setRefreshKey((k) => k + 1);
      router.replace('/documents');
    } catch {
      toast.error('Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc: Document) => {
    try {
      const blob = await documentsApi.download(doc.id);
      const url = window.URL.createObjectURL(blob as unknown as Blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = doc.name;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to download document');
    }
  };

  const handleDelete = async (doc: Document) => {
    const ok = await confirm({
      title: 'Delete document',
      description: `Delete "${doc.name}"? This cannot be undone.`,
      tone: 'destructive',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await documentsApi.delete(doc.id);
      toast.success('Document deleted');
      setRefreshKey((k) => k + 1);
    } catch {
      toast.error('Failed to delete document');
    }
  };

  const openRename = (doc: Document) => {
    setRenameTarget(doc);
    setRenameValue(doc.name);
  };

  const handleRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    setRenaming(true);
    try {
      const newName = renameValue.trim();
      await documentsApi.update(renameTarget.id, { name: newName });
      setRenamed((r) => ({ ...r, [renameTarget.id]: newName }));
      toast.success('Document renamed');
      setRenameTarget(null);
      setRefreshKey((k) => k + 1);
    } catch {
      toast.error('Failed to rename document');
    } finally {
      setRenaming(false);
    }
  };

  return (
    <>
      <ListPage<Document>
        refreshKey={refreshKey}
        title="Documents"
        description="Files uploaded against leads and itineraries."
        getRowId={(d) => d.id}
        fetcher={({ page, limit, search }) =>
          documentsApi.list({
            page,
            limit,
            search: search || undefined,
            category: categoryFilter !== 'all' ? categoryFilter : undefined,
          })
        }
        searchPlaceholder="Search documents..."
        filters={filters}
        onRemoveFilter={() => setCategoryFilter('all')}
        onClearFilters={() => setCategoryFilter('all')}
        headerActions={
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-40" aria-label="Filter by category">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
        columns={[
          {
            key: 'name',
            header: 'File Name',
            sortable: true,
            cell: (d) => (
              <div className="flex items-center gap-ds-2">
                <FileText className="size-4 text-ds-foreground-subtle" aria-hidden="true" />
                <span className="font-medium">{d.name}</span>
              </div>
            ),
          },
          { key: 'type', header: 'Type', cell: (d) => <Badge variant="outline">{getFileType(d.mimeType)}</Badge> },
          { key: 'size', header: 'Size', align: 'right', cell: (d) => formatBytes(d.size) },
          {
            key: 'category',
            header: 'Category',
            cell: (d) => <Badge variant="outline">{d.category ?? 'Other'}</Badge>,
          },
          {
            key: 'createdAt',
            header: 'Date',
            sortable: true,
            cell: (d) =>
              d.createdAt
                ? new Date(d.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                : '—',
          },
        ]}
        primaryAction={
          <Button size="sm" onClick={() => setUploadOpen(true)} className="gap-ds-2">
            <Upload aria-hidden="true" /> Upload File
          </Button>
        }
        rowActions={(d) => (
          <>
            <Button variant="ghost" size="icon-sm" aria-label="Download" onClick={() => void handleDownload(d)}>
              <Download />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Rename" onClick={() => openRename(d)}>
              <Pencil />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={() => void handleDelete(d)}>
              <Trash2 />
            </Button>
          </>
        )}
        renderDetail={(d) => (
          <div className="flex flex-col gap-ds-4 pt-ds-4">
            <div className="flex items-center gap-ds-3">
              <FileText className="size-8 text-ds-foreground-subtle" aria-hidden="true" />
              <div>
                <p className="font-medium text-ds-foreground">{renamed[d.id] ?? d.name}</p>
                <p className="text-sm text-ds-foreground-muted">{formatBytes(d.size)} · {getFileType(d.mimeType)}</p>
              </div>
            </div>
            {d.description && <p className="text-sm text-ds-foreground-muted">{d.description}</p>}
            <div className="grid grid-cols-2 gap-ds-3 text-sm">
              <div>
                <p className="text-ds-foreground-subtle">Category</p>
                <p className="text-ds-foreground">{d.category ?? 'Other'}</p>
              </div>
              <div>
                <p className="text-ds-foreground-subtle">Uploaded</p>
                <p className="text-ds-foreground">
                  {d.createdAt ? new Date(d.createdAt).toLocaleString('en-IN') : '—'}
                </p>
              </div>
              {d.leadId && (
                <div>
                  <p className="text-ds-foreground-subtle">Linked lead</p>
                  <p className="text-ds-foreground">{d.leadId}</p>
                </div>
              )}
              {d.itineraryId && (
                <div>
                  <p className="text-ds-foreground-subtle">Linked itinerary</p>
                  <p className="text-ds-foreground">{d.itineraryId}</p>
                </div>
              )}
            </div>
            <div className="flex gap-ds-2 pt-ds-2">
              <Button variant="outline" size="sm" className="gap-ds-2" onClick={() => void handleDownload(d)}>
                <Download aria-hidden="true" /> Download
              </Button>
              <Button variant="outline" size="sm" className="gap-ds-2" onClick={() => openRename(d)}>
                <Pencil aria-hidden="true" /> Rename
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-ds-2 text-ds-danger"
                onClick={() => void handleDelete(d)}
              >
                <Trash2 aria-hidden="true" /> Delete
              </Button>
            </div>
          </div>
        )}
        detailTitle={(d) => renamed[d.id] ?? d.name}
        bulkActions={[
          {
            label: 'Delete',
            icon: <Trash2 aria-hidden="true" />,
            destructive: true,
            onSelect: async (rows) => {
              const ok = await confirm({
                title: 'Delete documents',
                description: `Delete ${rows.length} document${rows.length === 1 ? '' : 's'}? This cannot be undone.`,
                tone: 'destructive',
                confirmLabel: 'Delete',
              });
              if (!ok) return;
              await Promise.all(rows.map((r) => documentsApi.delete(r.id)));
              toast.success('Documents deleted');
              setRefreshKey((k) => k + 1);
            },
          },
        ]}
        onExport={async (rows) => {
          const header = ['Name', 'Type', 'Size (bytes)', 'Category', 'Uploaded'];
          const lines = rows.map((d) =>
            [d.name, getFileType(d.mimeType), String(d.size ?? 0), d.category ?? 'Other', d.createdAt ?? '']
              .map((v) => `"${String(v).replace(/"/g, '""')}"`)
              .join(','),
          );
          const csv = [header.join(','), ...lines].join('\n');
          const blob = new Blob([csv], { type: 'text/csv' });
          const url = window.URL.createObjectURL(blob);
          const a = window.document.createElement('a');
          a.href = url;
          a.download = 'documents.csv';
          a.click();
          window.URL.revokeObjectURL(url);
        }}
        emptyTitle="No documents yet"
        emptyDescription="Upload passports, visas, invoices, or contracts to keep them attached to a lead or itinerary."
        emptyIcon={<FileText className="size-8" aria-hidden="true" />}
        emptyAction={
          <Button size="sm" onClick={() => setUploadOpen(true)} className="gap-ds-2">
            <Plus aria-hidden="true" /> Upload File
          </Button>
        }
      />

      <Dialog open={uploadOpen} onOpenChange={(open) => { setUploadOpen(open); if (!open) setUploadForm(EMPTY_UPLOAD); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload document</DialogTitle>
            <DialogDescription>Attach a file, optionally linked to a lead or itinerary.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-ds-4">
            <FileDropzone
              files={uploadForm.file ? [uploadForm.file] : []}
              onFiles={(files) => setUploadForm((f) => ({ ...f, file: files[0] ?? null, name: f.name || files[0]?.name || '' }))}
              onRemove={() => setUploadForm((f) => ({ ...f, file: null }))}
              label="Drop a file here, or browse"
              hint="PDF, image, or office document"
            />
            <div className="flex flex-col gap-ds-2">
              <Label htmlFor="doc-name">Name</Label>
              <Input
                id="doc-name"
                value={uploadForm.name}
                onChange={(e) => setUploadForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Document name"
              />
            </div>
            <div className="flex flex-col gap-ds-2">
              <Label htmlFor="doc-category">Category</Label>
              <Select value={uploadForm.category} onValueChange={(v) => setUploadForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger id="doc-category">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-ds-2">
              <Label>Linked lead (optional)</Label>
              <RelationCombobox
                value={uploadForm.leadId}
                onChange={(id) => setUploadForm((f) => ({ ...f, leadId: id }))}
                fetcher={async (query, page) => {
                  const r = await leadsApi.list({ search: query, page, limit: 20 });
                  const list = unwrapList<{ id: string; title: string }>(r);
                  return { items: list.data, total: list.pagination.total };
                }}
                getOptionId={(l) => l.id}
                getOptionLabel={(l) => l.title}
                resolveSelected={async (id) => (await leadsApi.getById(id)).data}
                placeholder="Search leads..."
              />
            </div>
            <div className="flex flex-col gap-ds-2">
              <Label>Linked itinerary (optional)</Label>
              <RelationCombobox
                value={uploadForm.itineraryId}
                onChange={(id) => setUploadForm((f) => ({ ...f, itineraryId: id }))}
                fetcher={async (query, page) => {
                  const r = await itinerariesApi.list({ search: query, page, limit: 20 });
                  const list = unwrapList<{ id: string; title: string }>(r);
                  return { items: list.data, total: list.pagination.total };
                }}
                getOptionId={(i) => i.id}
                getOptionLabel={(i) => i.title}
                resolveSelected={async (id) => (await itinerariesApi.getById(id)).data}
                placeholder="Search itineraries..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)} disabled={uploading}>
              Cancel
            </Button>
            <Button onClick={() => void handleUpload()} disabled={uploading || !uploadForm.file}>
              {uploading ? 'Uploading…' : 'Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renameTarget !== null} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename document</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-ds-2">
            <Label htmlFor="rename-input">Name</Label>
            <Input id="rename-input" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)} disabled={renaming}>
              Cancel
            </Button>
            <Button onClick={() => void handleRename()} disabled={renaming || !renameValue.trim()}>
              {renaming ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {confirmDialog}
    </>
  );
}
