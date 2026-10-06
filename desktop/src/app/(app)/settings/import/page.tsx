'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ChevronRight,
  ArrowRight,
  Trash2,
  Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tag } from '@/components/ui/tag';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { ListPage } from '@/components/domain';
import type { LucideIcon } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { unwrapEntity } from '@/lib/api/envelope';
import { importsApi, type ImportJob } from '@/lib/api/imports';
import { cn } from '@/lib/utils';
import { PageContainer } from '@/components/layout/page-container';

type WizardStep = 'upload' | 'map' | 'configure';

const IMPORT_TYPES = [
  { value: 'contacts', label: 'Contacts' },
  { value: 'leads', label: 'Leads' },
  { value: 'suppliers', label: 'Suppliers' },
  { value: 'rate_cards', label: 'Rate Cards' },
  { value: 'travellers', label: 'Travellers' },
];

const CRM_FIELDS: Record<string, Array<{ value: string; label: string; required?: boolean }>> = {
  contacts: [
    { value: 'firstName', label: 'First Name', required: true },
    { value: 'lastName', label: 'Last Name' },
    { value: 'email', label: 'Email', required: true },
    { value: 'phone', label: 'Phone' },
    { value: 'company', label: 'Company' },
    { value: 'tags', label: 'Tags' },
  ],
  leads: [
    { value: 'title', label: 'Title', required: true },
    { value: 'firstName', label: 'First Name', required: true },
    { value: 'lastName', label: 'Last Name' },
    { value: 'email', label: 'Email' },
    { value: 'phone', label: 'Phone' },
    { value: 'destination', label: 'Destination' },
    { value: 'travelDate', label: 'Travel Date' },
    { value: 'value', label: 'Budget' },
    { value: 'status', label: 'Status' },
  ],
  suppliers: [
    { value: 'name', label: 'Company Name', required: true },
    { value: 'category', label: 'Category', required: true },
    { value: 'email', label: 'Email' },
    { value: 'phone', label: 'Phone' },
    { value: 'country', label: 'Country' },
    { value: 'city', label: 'City' },
  ],
  rate_cards: [
    { value: 'supplierName', label: 'Supplier Name', required: true },
    { value: 'serviceType', label: 'Service Type', required: true },
    { value: 'name', label: 'Service Name' },
    { value: 'costPrice', label: 'Cost Price', required: true },
    { value: 'sellPrice', label: 'Sell Price' },
    { value: 'currency', label: 'Currency' },
    { value: 'validFrom', label: 'Valid From' },
    { value: 'validTo', label: 'Valid To' },
  ],
  travellers: [
    { value: 'firstName', label: 'First Name', required: true },
    { value: 'lastName', label: 'Last Name', required: true },
    { value: 'email', label: 'Email' },
    { value: 'phone', label: 'Phone' },
    { value: 'dateOfBirth', label: 'Date of Birth' },
    { value: 'passportNumber', label: 'Passport Number' },
  ],
};

/** Shape of the upload response: the backend returns the job under either id key. */
interface UploadedImport {
  id?: string;
  jobId?: string;
  headers?: string[];
  totalRows?: number;
}

/** Raw row from GET /imports (snake-ish column names, depends on backend version). */
interface RawImportJob {
  id: string;
  importType?: string;
  type?: string;
  fileName: string;
  totalRows?: number;
  totalRecords?: number;
  processedRows?: number;
  processedRecords?: number;
  errorCount?: number;
  failedRecords?: number;
  status: ImportJob['status'];
  createdAt: string;
  completedAt?: string | null;
}

const statusConfig: Record<string, { label: string; icon: LucideIcon; tone: 'neutral' | 'info' | 'success' | 'danger' | 'warning' }> = {
  pending: { label: 'Pending', icon: Clock, tone: 'neutral' },
  validating: { label: 'Validating', icon: Loader2, tone: 'info' },
  importing: { label: 'Processing', icon: Loader2, tone: 'info' },
  processing: { label: 'Processing', icon: Loader2, tone: 'info' },
  completed: { label: 'Completed', icon: CheckCircle2, tone: 'success' },
  failed: { label: 'Failed', icon: XCircle, tone: 'danger' },
  cancelled: { label: 'Cancelled', icon: AlertTriangle, tone: 'warning' },
};

function formatDate(iso?: string) {
  if (!iso) return '-';
  try { return new Date(iso).toLocaleString('en-IN'); } catch { return iso; }
}

function autoMap(headers: string[], importType: string): Record<string, string> {
  const result: Record<string, string> = {};
  const fields = CRM_FIELDS[importType] ?? [];
  headers.forEach(h => {
    const lower = h.toLowerCase().replace(/[\s_\-\*]/g, '');
    let matched = '';
    if (lower.includes('firstname') || lower === 'first') matched = 'firstName';
    else if (lower.includes('lastname') || lower === 'last') matched = 'lastName';
    else if (lower.includes('email')) matched = 'email';
    else if (lower.includes('phone') || lower.includes('mobile')) matched = 'phone';
    else if (lower.includes('company') || lower.includes('companyname')) matched = importType === 'suppliers' ? 'name' : 'company';
    else if (lower.includes('title')) matched = 'title';
    else if (lower.includes('destination')) matched = 'destination';
    else if (lower.includes('budget') || lower.includes('value')) matched = 'value';
    else if (lower.includes('status')) matched = 'status';
    else if (lower.includes('category')) matched = 'category';
    else if (lower.includes('suppliername') || lower === 'supplier') matched = 'supplierName';
    else if (lower.includes('servicetype')) matched = 'serviceType';
    else if (lower.includes('costprice') || lower.includes('cost')) matched = 'costPrice';
    else if (lower.includes('sellprice')) matched = 'sellPrice';
    else if (lower.includes('currency')) matched = 'currency';
    else if (lower.includes('passport')) matched = 'passportNumber';
    else if (lower.includes('dob') || lower.includes('birth')) matched = 'dateOfBirth';
    else if (lower.includes('country')) matched = 'country';
    else if (lower.includes('city')) matched = 'city';
    else if (lower.includes('tag')) matched = 'tags';

    if (matched && fields.some(f => f.value === matched)) {
      result[h] = matched;
    }
  });
  return result;
}

function ImportSettingsPageContent() {
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [step, setStep] = React.useState<WizardStep>('upload');
  const [importType, setImportType] = React.useState('contacts');
  const [file, setFile] = React.useState<File | null>(null);
  const [skipHeader, setSkipHeader] = React.useState(true);
  const [duplicateStrategy, setDuplicateStrategy] = React.useState<'skip' | 'merge' | 'create'>('skip');
  const [uploadedJob, setUploadedJob] = React.useState<UploadedImport | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [executing, setExecuting] = React.useState(false);
  const [mappings, setMappings] = React.useState<Record<string, string>>({});
  const [filterType, setFilterType] = React.useState('all');
  const [filterStatus, setFilterStatus] = React.useState('all');
  const [refreshKey, setRefreshKey] = React.useState(0);

  const headers: string[] = uploadedJob?.headers ?? [];
  const availableFields = CRM_FIELDS[importType] ?? [];

  // GET /imports returns the latest jobs as a flat array with raw column names
  // (importType, totalRows, ...) and ignores page/type/status/search, so map,
  // filter and paginate here.
  const historyFetcher = React.useCallback(
    async ({ page, limit, search }: { page: number; limit: number; search: string }) => {
      const res = (await importsApi.list()) as unknown as { data?: unknown };
      const raw = Array.isArray(res.data) ? (res.data as RawImportJob[]) : [];
      const needle = search.trim().toLowerCase();
      const jobs: ImportJob[] = raw
        .map((j) => ({
          id: j.id,
          type: j.importType ?? j.type ?? '',
          fileName: j.fileName,
          totalRecords: j.totalRows ?? j.totalRecords ?? 0,
          processedRecords: j.processedRows ?? j.processedRecords ?? 0,
          failedRecords: j.errorCount ?? j.failedRecords ?? 0,
          status: j.status,
          createdAt: j.createdAt,
          completedAt: j.completedAt ?? undefined,
        }))
        .filter((j) => filterType === 'all' || j.type === filterType)
        .filter((j) => filterStatus === 'all' || j.status === filterStatus)
        .filter((j) => !needle || j.fileName?.toLowerCase().includes(needle));
      const start = (page - 1) * limit;
      return {
        data: {
          data: jobs.slice(start, start + limit),
          pagination: { page, limit, total: jobs.length, totalPages: Math.max(1, Math.ceil(jobs.length / limit)) },
        },
      };
    },
    [filterType, filterStatus],
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.currentTarget.files?.[0];
    if (f) {
      if (f.size > 20 * 1024 * 1024) { toast.error('File too large — max 20MB'); return; }
      setFile(f);
    }
  };

  const handleUpload = async () => {
    if (!file) { toast.error('Please select a file'); return; }
    setUploading(true);
    try {
      const result = await importsApi.upload({ file, type: importType, skipHeader });
      const data = unwrapEntity<UploadedImport>(result);
      setUploadedJob(data);
      const hdrs: string[] = data?.headers ?? [];
      setMappings(autoMap(hdrs, importType));
      setStep('map');
      toast.success('File uploaded successfully');
    } catch {
      toast.error('Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  const handleExecute = async () => {
    if (!uploadedJob) return;
    const jobId = uploadedJob.jobId ?? uploadedJob.id;
    if (!jobId) return;
    setExecuting(true);
    try {
      const columnMapping: Record<string, string> = {};
      Object.entries(mappings).forEach(([col, field]) => {
        if (field && field !== '__skip') columnMapping[col] = field;
      });
      await importsApi.execute(jobId, {
        mapping: columnMapping,
        duplicateStrategy,
      });
      toast.success('Import started');
      setStep('upload');
      setFile(null);
      setUploadedJob(null);
      setMappings({});
      setRefreshKey(k => k + 1);
    } catch {
      toast.error('Failed to start import');
    } finally {
      setExecuting(false);
    }
  };

  const handleDownloadTemplate = async (type: string) => {
    try {
      const blob = await importsApi.getTemplate(type) as unknown as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}_import_template.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Template downloaded');
    } catch {
      toast.error('Failed to download template');
    }
  };

  const handleDownloadErrors = async (jobId: string, jType: string) => {
    try {
      const blob = await importsApi.downloadErrors(jobId) as unknown as Blob;
      if (!blob || blob.size === 0) { toast.info('No errors for this import'); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${jType}_errors_${jobId}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Error report downloaded');
    } catch {
      toast.error('Failed to download errors');
    }
  };

  const stepOrder: WizardStep[] = ['upload', 'map', 'configure'];
  const stepLabels: Record<WizardStep, string> = { upload: 'Upload', map: 'Map Columns', configure: 'Configure' };

  return (
    <div className="space-y-ds-6">
      {confirmDialog}
      <PageHeader
        title="Data import"
        description="Import contacts, leads, and other data from CSV/Excel files"
        back={
          <Button variant="ghost" size="icon" onClick={() => router.push('/settings')} aria-label="Back to settings">
            <ArrowLeft className="size-5" />
          </Button>
        }
      />

      {/* Templates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-ds-2">
            <Download className="size-5" />
            Download Templates
          </CardTitle>
          <CardDescription>Get Excel templates with correct column formats and sample data</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-ds-2">
            {IMPORT_TYPES.map(type => (
              <Button key={type.value} variant="outline" size="sm" className="gap-ds-2" onClick={() => handleDownloadTemplate(type.value)}>
                <FileSpreadsheet className="size-4" />
                {type.label} Template
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Import Wizard */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-ds-2">
            <Upload className="size-5" />
            Import Wizard
          </CardTitle>
          <CardDescription>
            <div className="mt-ds-2 flex flex-wrap items-center gap-ds-2">
              {stepOrder.map((s, idx) => (
                <React.Fragment key={s}>
                  <Tag tone={step === s ? 'primary' : stepOrder.indexOf(step) > idx ? 'success' : 'neutral'} size="sm">
                    {idx + 1}. {stepLabels[s]}
                  </Tag>
                  {idx < stepOrder.length - 1 && <ChevronRight className="size-3 text-ds-foreground-muted" />}
                </React.Fragment>
              ))}
            </div>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-ds-6">
          {step === 'upload' && (
            <>
              <div className="space-y-ds-2">
                <Label>Import Type</Label>
                <Select value={importType} onValueChange={setImportType}>
                  <SelectTrigger className="w-60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {IMPORT_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-ds-2">
                <Label>File (CSV or XLSX, max 20MB)</Label>
                <div className="rounded-ds-lg border-2 border-dashed border-ds-border p-ds-8 text-center">
                  <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileSelect} className="hidden" id="import-file" />
                  <label htmlFor="import-file" className="cursor-pointer">
                    <Upload className="mx-auto mb-ds-3 size-10 text-ds-foreground-muted" />
                    <p className="text-sm font-medium">
                      {file ? file.name : 'Click to select a CSV or Excel file'}
                    </p>
                    <p className="mt-ds-1 text-xs text-ds-foreground-muted">
                      {file ? `${(file.size / 1024).toFixed(1)} KB` : 'CSV or XLSX, max 20MB'}
                    </p>
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-ds-3">
                <Switch checked={skipHeader} onCheckedChange={setSkipHeader} />
                <Label>First row is header</Label>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleUpload} disabled={!file || uploading} className="gap-ds-2">
                  {uploading && <Loader2 className="size-4 animate-spin" />}
                  <Upload className="size-4" />
                  Upload & Continue
                </Button>
              </div>
            </>
          )}

          {step === 'map' && (
            <>
              <div className="rounded-ds-lg bg-ds-surface-sunken p-ds-4">
                <p className="text-sm font-medium">Uploaded: {file?.name}</p>
                <p className="mt-ds-1 text-xs text-ds-foreground-muted">
                  {uploadedJob?.totalRows ?? 0} records — {headers.length} columns detected
                </p>
              </div>

              {headers.length > 0 ? (
                <div className="space-y-ds-3">
                  <p className="text-sm text-ds-foreground-muted">Map your file columns to CRM fields. Fields marked * are required.</p>
                  {headers.map(header => (
                    <div key={header} className="flex items-center gap-ds-4">
                      <span className="w-48 truncate text-sm font-medium">{header}</span>
                      <ArrowRight className="size-4 shrink-0 text-ds-foreground-muted" />
                      <Select
                        value={mappings[header] ?? '__skip'}
                        onValueChange={v => setMappings(prev => ({ ...prev, [header]: v }))}
                      >
                        <SelectTrigger className="w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__skip">-- Skip --</SelectItem>
                          {availableFields.map(f => (
                            <SelectItem key={f.value} value={f.value}>
                              {f.label}{f.required ? ' *' : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-ds-4 text-center text-sm text-ds-foreground-muted">No column headers detected. Ensure your file has a header row.</p>
              )}

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep('upload')}>Back</Button>
                <Button onClick={() => setStep('configure')} className="gap-ds-2">
                  Next <ChevronRight className="size-4" />
                </Button>
              </div>
            </>
          )}

          {step === 'configure' && (
            <>
              <div className="space-y-ds-4">
                <div className="rounded-ds-lg bg-ds-surface-sunken p-ds-4">
                  <p className="text-sm font-medium">Ready to import: {uploadedJob?.totalRows ?? 0} records as {IMPORT_TYPES.find(t => t.value === importType)?.label}</p>
                </div>

                <div className="space-y-ds-3">
                  <Label>Duplicate Handling</Label>
                  {[
                    { value: 'skip', label: 'Skip duplicates', desc: 'Existing records stay unchanged' },
                    { value: 'merge', label: 'Update existing', desc: 'Overwrite matching records with import data' },
                    { value: 'create', label: 'Create new', desc: 'Always create, even if duplicate' },
                  ].map(opt => (
                    <label key={opt.value} className={cn(
                      'flex cursor-pointer items-start gap-ds-3 rounded-ds-lg border p-ds-3',
                      duplicateStrategy === opt.value ? 'border-ds-primary bg-ds-primary-subtle' : 'border-ds-border',
                    )}>
                      <input
                        type="radio"
                        name="duplicateStrategy"
                        value={opt.value}
                        checked={duplicateStrategy === opt.value}
                        onChange={() => setDuplicateStrategy(opt.value as 'skip' | 'merge' | 'create')}
                        className="mt-0.5"
                      />
                      <div>
                        <p className="text-sm font-medium">{opt.label}</p>
                        <p className="text-xs text-ds-foreground-muted">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep('map')}>Back</Button>
                <Button onClick={handleExecute} disabled={executing} className="gap-ds-2">
                  {executing && <Loader2 className="size-4 animate-spin" />}
                  Start Import
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Import History */}
      <Card>
        <CardContent className="pt-ds-6">
          <div className="mb-ds-4 flex flex-wrap items-center gap-ds-3">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {IMPORT_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="importing">Processing</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <ListPage<ImportJob>
            className="p-0"
            refreshKey={refreshKey}
            title="Import History"
            description="Recent import jobs and their status"
            getRowId={(j) => j.id}
            fetcher={historyFetcher}
            filters={activeFilters}
            onRemoveFilter={(id) => (id === 'type' ? setFilterType('all') : setFilterStatus('all'))}
            onClearFilters={() => {
              setFilterType('all');
              setFilterStatus('all');
            }}
            columns={[
              { key: 'fileName', header: 'File', sortable: false },
              {
                key: 'type', header: 'Type',
                cell: (j) => <Tag tone="neutral" size="sm" className="capitalize">{j.type?.replace('_', ' ')}</Tag>,
              },
              {
                key: 'records', header: 'Records',
                cell: (j) => (
                  <span className="text-sm">
                    {j.processedRecords}/{j.totalRecords}
                    {j.failedRecords > 0 && <span className="ml-1 text-ds-danger">({j.failedRecords} failed)</span>}
                  </span>
                ),
              },
              {
                key: 'status', header: 'Status',
                cell: (j) => {
                  const config = statusConfig[j.status] ?? statusConfig.pending!;
                  const StatusIcon = config.icon;
                  const isActive = ['processing', 'validating', 'importing'].includes(j.status as string);
                  return (
                    <Tag tone={config.tone} size="sm" className="gap-1">
                      <StatusIcon className={cn('size-3', isActive && 'animate-spin')} />
                      {config.label}
                    </Tag>
                  );
                },
              },
              { key: 'createdAt', header: 'Date', sortable: true, cell: (j) => formatDate(j.createdAt) },
            ]}
            rowActions={(j) => (
              <>
                {j.failedRecords > 0 && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Download errors"
                    onClick={() => handleDownloadErrors(j.id, j.type)}
                  >
                    <Eye />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Cancel or remove"
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'Remove import record?',
                      description: 'The record is removed from your import history. Contacts already imported are not affected.',
                      confirmLabel: 'Remove',
                      tone: 'destructive',
                    });
                    if (!ok) return;
                    try {
                      await importsApi.cancel(j.id);
                      setRefreshKey(k => k + 1);
                      toast.success('Removed');
                    } catch {
                      toast.error('Failed to remove');
                    }
                  }}
                >
                  <Trash2 />
                </Button>
              </>
            )}
            emptyTitle="No imports found"
            emptyDescription="Upload a file above to start your first import."
            emptyIcon={<FileSpreadsheet className="size-8" />}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default function ImportSettingsPage() {
  return (
    <PageContainer>
      <ImportSettingsPageContent />
    </PageContainer>
  );
}
