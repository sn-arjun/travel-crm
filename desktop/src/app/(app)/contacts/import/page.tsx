'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, ChevronRight, Download, FileSpreadsheet, Loader2, Upload,
} from 'lucide-react';
import { toast } from 'sonner';

import { PageContainer } from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tag } from '@/components/ui/tag';
import { useApiMutation } from '@/hooks/use-api';
import { importsApi, type ImportJob } from '@/lib/api/imports';
import { cn } from '@/lib/utils';

/** What POST /imports/upload answers with for a contacts file. */
interface UploadResult {
  jobId?: string;
  headers?: string[];
  previewData?: (string[] | Record<string, string>)[];
  totalRows?: number;
}

/** Job as tracked on this page: the API job plus the upload-time row count. */
type TrackedJob = Partial<ImportJob> & { id: string; totalRows?: number };

type Step = 'upload' | 'map' | 'preview' | 'execute';
type DuplicateStrategy = 'skip' | 'merge' | 'create';

const STEPS: { key: Step; label: string }[] = [
  { key: 'upload', label: 'Upload File' },
  { key: 'map', label: 'Map Columns' },
  { key: 'preview', label: 'Preview' },
  { key: 'execute', label: 'Import' },
];

const CONTACT_FIELDS = [
  { value: 'firstName', label: 'First Name' },
  { value: 'lastName', label: 'Last Name' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'type', label: 'Type' },
  { value: 'tags', label: 'Tags' },
  { value: 'notes', label: 'Notes' },
  { value: '__skip', label: '-- Skip --' },
];

const DUPLICATE_OPTIONS: { value: DuplicateStrategy; label: string; description: string }[] = [
  { value: 'skip', label: 'Skip duplicates', description: 'Leave existing contacts unchanged' },
  { value: 'merge', label: 'Update duplicates', description: 'Overwrite existing contact fields with imported values' },
  { value: 'create', label: 'Always create', description: 'Create new contact even if a duplicate exists' },
];

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function ContactImportPage() {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>('upload');
  const [file, setFile] = React.useState<File | null>(null);
  const [importJob, setImportJob] = React.useState<TrackedJob | null>(null);
  const [csvHeaders, setCsvHeaders] = React.useState<string[]>([]);
  const [csvPreview, setCsvPreview] = React.useState<string[][]>([]);
  const [mapping, setMapping] = React.useState<Record<string, string>>({});
  const [duplicateStrategy, setDuplicateStrategy] = React.useState<DuplicateStrategy>('skip');
  const [templateDownloading, setTemplateDownloading] = React.useState(false);
  const [errorDownloading, setErrorDownloading] = React.useState(false);

  const { mutate: uploadFile, loading: isUploading } = useApiMutation<File, { data?: UploadResult }>(
    (f) => importsApi.upload({ file: f, type: 'contacts', skipHeader: true }) as Promise<{ data?: UploadResult }>,
  );

  const { mutate: executeImport, loading: isExecuting } = useApiMutation<string, { data?: Partial<ImportJob> }>(
    (jobId) => importsApi.execute(jobId, { mapping, duplicateStrategy }),
  );

  function autoMap(headers: string[]) {
    const autoMapping: Record<string, string> = {};
    headers.forEach((h) => {
      const lower = h.toLowerCase().replace(/[\s_-]/g, '');
      if (lower.includes('firstname') || lower === 'first') autoMapping[h] = 'firstName';
      else if (lower.includes('lastname') || lower === 'last') autoMapping[h] = 'lastName';
      else if (lower.includes('email')) autoMapping[h] = 'email';
      else if (lower.includes('phone') || lower.includes('mobile')) autoMapping[h] = 'phone';
      else if (lower.includes('type')) autoMapping[h] = 'type';
      else if (lower.includes('tag')) autoMapping[h] = 'tags';
      else if (lower.includes('note')) autoMapping[h] = 'notes';
      else autoMapping[h] = '__skip';
    });
    setMapping(autoMapping);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;

    if (!f.name.endsWith('.csv') && !f.name.endsWith('.xlsx')) {
      toast.error('Please upload a CSV or XLSX file');
      return;
    }
    if (f.size > 20 * 1024 * 1024) {
      toast.error('File size must be under 20MB');
      return;
    }

    setFile(f);

    // Parse CSV headers client-side for preview while waiting for server
    if (f.name.endsWith('.csv')) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = typeof ev.target?.result === 'string' ? ev.target.result : '';
        const lines = text.split('\n').filter(Boolean);
        if (lines.length > 0) {
          const headers = lines[0]!.split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
          setCsvHeaders(headers);
          autoMap(headers);
          setCsvPreview(lines.slice(1, 6).map((line) => line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))));
        }
      };
      reader.readAsText(f);
    }
  }

  async function handleUpload() {
    if (!file) return;
    try {
      const result = await uploadFile(file);
      if (result) {
        const data = result.data;
        // Server returns headers/previewData — use them if available
        if (data?.headers?.length) {
          setCsvHeaders(data.headers);
          autoMap(data.headers);
        }
        if (data?.previewData?.length) {
          setCsvPreview(data.previewData.map((row) => (Array.isArray(row) ? row : Object.values(row))));
        }
        setImportJob({ id: data?.jobId ?? '', status: 'pending', totalRows: data?.totalRows });
        setStep('map');
        toast.success('File uploaded successfully');
      } else {
        toast.error('Failed to upload file');
      }
    } catch {
      toast.error('Failed to upload file');
    }
  }

  async function handleExecute() {
    if (!importJob) return;
    try {
      const result = await executeImport(importJob.id);
      if (result) {
        setImportJob((prev) => (prev ? { ...prev, ...(result.data ?? {}) } : prev));
        setStep('execute');
        toast.success('Import started successfully');
      } else {
        toast.error('Failed to start import');
      }
    } catch {
      toast.error('Failed to start import');
    }
  }

  async function handleDownloadTemplate() {
    setTemplateDownloading(true);
    try {
      const blob = (await importsApi.getTemplate('contacts')) as unknown as Blob;
      saveBlob(blob, 'contacts_import_template.xlsx');
      toast.success('Template downloaded');
    } catch {
      toast.error('Failed to download template');
    } finally {
      setTemplateDownloading(false);
    }
  }

  async function handleDownloadErrors() {
    if (!importJob) return;
    setErrorDownloading(true);
    try {
      const blob = (await importsApi.downloadErrors(importJob.id)) as unknown as Blob;
      saveBlob(blob, `contacts_errors_${importJob.id}.xlsx`);
      toast.success('Error report downloaded');
    } catch {
      toast.error('Failed to download error report');
    } finally {
      setErrorDownloading(false);
    }
  }

  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const failedRecords = importJob?.failedRecords ?? 0;

  return (
    <PageContainer width="narrow">
      <PageHeader
        title="Import Contacts"
        description="Bring contacts in from a CSV or Excel file."
        back={
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()} aria-label="Go back">
            <ArrowLeft aria-hidden="true" />
          </Button>
        }
        actions={
          <Button variant="outline" size="sm" onClick={handleDownloadTemplate} disabled={templateDownloading}>
            {templateDownloading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
            Download Template
          </Button>
        }
      />

      <div className="flex flex-col gap-ds-4">
        <ol className="flex flex-wrap items-center gap-ds-2" aria-label="Import steps">
          {STEPS.map((s, idx) => (
            <React.Fragment key={s.key}>
              <li
                aria-current={idx === stepIndex ? 'step' : undefined}
                className={cn(
                  'flex items-center gap-ds-2 rounded-full px-ds-3 py-ds-1 text-xs font-medium',
                  idx <= stepIndex ? 'bg-ds-primary text-ds-primary-foreground' : 'bg-ds-surface-sunken text-ds-foreground-muted',
                )}
              >
                <span className="flex size-5 items-center justify-center rounded-full bg-ds-surface/20 text-xs">
                  {idx < stepIndex ? <CheckCircle2 className="size-3" aria-hidden="true" /> : idx + 1}
                </span>
                {s.label}
              </li>
              {idx < STEPS.length - 1 && <ChevronRight className="size-4 text-ds-foreground-muted" aria-hidden="true" />}
            </React.Fragment>
          ))}
        </ol>

        {step === 'upload' && (
          <SectionCard title="Upload file">
            <div className="flex flex-col gap-ds-6">
              <div className="rounded-ds-lg border-2 border-dashed border-ds-border p-ds-8 text-center">
                <FileSpreadsheet className="mx-auto mb-ds-4 size-12 text-ds-foreground-subtle" aria-hidden="true" />
                <Label htmlFor="file-upload" className="cursor-pointer">
                  <span className="text-sm font-medium text-ds-primary hover:underline">Click to upload</span>
                  <span className="text-sm text-ds-foreground-muted"> or drag and drop</span>
                </Label>
                <Input id="file-upload" type="file" accept=".csv,.xlsx" onChange={handleFileChange} className="hidden" />
                <p className="mt-ds-2 text-xs text-ds-foreground-muted">CSV or XLSX files up to 20MB</p>
                {file && (
                  <Tag tone="neutral" className="mt-ds-4">
                    {file.name} ({(file.size / 1024).toFixed(1)} KB)
                  </Tag>
                )}
              </div>

              {file && (
                <div className="flex justify-end">
                  <Button onClick={handleUpload} disabled={isUploading}>
                    {isUploading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
                    Upload &amp; Continue
                  </Button>
                </div>
              )}
            </div>
          </SectionCard>
        )}

        {step === 'map' && (
          <SectionCard title="Map columns" description="Map each column from your file to the matching contact field.">
            <div className="flex flex-col gap-ds-6">
              <div className="flex flex-col gap-ds-3">
                {csvHeaders.map((header) => (
                  <div key={header} className="flex items-center gap-ds-4">
                    <span className="w-40 truncate text-sm font-medium">{header}</span>
                    <ArrowRight className="size-4 shrink-0 text-ds-foreground-muted" aria-hidden="true" />
                    <Select
                      value={mapping[header] ?? '__skip'}
                      onValueChange={(v) => setMapping((prev) => ({ ...prev, [header]: v }))}
                    >
                      <SelectTrigger className="w-48" aria-label={`Field for ${header}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CONTACT_FIELDS.map((f) => (
                          <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep('upload')}>Back</Button>
                <Button onClick={() => setStep('preview')}>
                  <ArrowRight aria-hidden="true" /> Preview
                </Button>
              </div>
            </div>
          </SectionCard>
        )}

        {step === 'preview' && (
          <SectionCard title="Preview import" description="The first few rows that will be imported.">
            <div className="flex flex-col gap-ds-6">
              {csvPreview.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      {csvHeaders.filter((h) => mapping[h] !== '__skip').map((h) => (
                        <TableHead key={h} className="text-xs">
                          {CONTACT_FIELDS.find((f) => f.value === mapping[h])?.label ?? h}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {csvPreview.map((row, idx) => (
                      <TableRow key={idx}>
                        {csvHeaders.map((h, colIdx) =>
                          mapping[h] === '__skip' ? null : (
                            <TableCell key={h} className="text-xs">{row[colIdx] ?? ''}</TableCell>
                          ),
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              <fieldset className="flex flex-col gap-ds-2">
                <legend className="mb-ds-2 text-sm font-medium">Duplicate handling</legend>
                {DUPLICATE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={cn(
                      'flex cursor-pointer items-start gap-ds-3 rounded-ds-lg border p-ds-3 transition-colors',
                      duplicateStrategy === opt.value ? 'border-ds-primary bg-ds-primary-subtle' : 'border-ds-border hover:bg-ds-surface-sunken',
                    )}
                  >
                    <input
                      type="radio"
                      name="duplicateStrategy"
                      value={opt.value}
                      checked={duplicateStrategy === opt.value}
                      onChange={() => setDuplicateStrategy(opt.value)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block text-sm font-medium">{opt.label}</span>
                      <span className="block text-xs text-ds-foreground-muted">{opt.description}</span>
                    </span>
                  </label>
                ))}
              </fieldset>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep('map')}>Back</Button>
                <Button onClick={handleExecute} disabled={isExecuting}>
                  {isExecuting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}
                  Start Import
                </Button>
              </div>
            </div>
          </SectionCard>
        )}

        {step === 'execute' && (
          <SectionCard title="Import started">
            <div className="flex flex-col gap-ds-6">
              {importJob && (
                <div className="grid grid-cols-3 gap-ds-4 text-center">
                  <div>
                    <p className="text-2xl font-semibold">{importJob.totalRows ?? importJob.totalRecords ?? 0}</p>
                    <p className="text-xs text-ds-foreground-muted">Total records</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold text-ds-success">{importJob.processedRecords ?? 0}</p>
                    <p className="text-xs text-ds-foreground-muted">Processed</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold text-ds-danger">{failedRecords}</p>
                    <p className="text-xs text-ds-foreground-muted">Failed</p>
                  </div>
                </div>
              )}

              {failedRecords > 0 && (
                <div role="alert" className="flex items-center gap-ds-3 rounded-ds-lg border border-ds-danger bg-ds-danger-subtle p-ds-3">
                  <AlertCircle className="size-4 shrink-0 text-ds-danger" aria-hidden="true" />
                  <p className="flex-1 text-sm text-ds-danger-on-subtle">{failedRecords} row(s) failed to import.</p>
                  <Button variant="outline" size="sm" onClick={handleDownloadErrors} disabled={errorDownloading}>
                    {errorDownloading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
                    Download Error Report
                  </Button>
                </div>
              )}

              <div className="flex justify-center gap-ds-3">
                <Button variant="outline" onClick={() => router.push('/contacts')}>View Contacts</Button>
                <Button
                  onClick={() => {
                    setStep('upload');
                    setFile(null);
                    setImportJob(null);
                    setCsvHeaders([]);
                    setCsvPreview([]);
                    setMapping({});
                  }}
                >
                  Import More
                </Button>
              </div>
            </div>
          </SectionCard>
        )}
      </div>
    </PageContainer>
  );
}
