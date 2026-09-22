'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Upload, ChevronRight, Download, AlertCircle, CheckCircle2, XCircle, Loader2, X, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tag } from '@/components/ui/tag';
import { Progress } from '@/components/ui/progress';
import { PageHeader } from '@/components/ui/page-header';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { importsApi } from '@/lib/api/imports';
import { useRealtimeEvent, useRealtimeConnected } from '@/hooks/use-realtime-event';

type EntityType = 'contacts' | 'leads' | 'suppliers' | 'rate_cards' | 'travellers';
type DuplicateStrategy = 'skip' | 'merge' | 'create';

const ENTITY_TYPES: { value: EntityType; label: string; icon: string }[] = [
  { value: 'contacts', label: 'Contacts', icon: '👥' },
  { value: 'leads', label: 'Leads', icon: '🎯' },
  { value: 'suppliers', label: 'Suppliers', icon: '🏢' },
  { value: 'rate_cards', label: 'Rate Cards', icon: '💰' },
  { value: 'travellers', label: 'Travellers', icon: '✈️' },
];

const CRM_FIELDS: Record<EntityType, Array<{ value: string; label: string; required?: boolean }>> = {
  contacts: [
    { value: 'firstName', label: 'First Name', required: true },
    { value: 'lastName', label: 'Last Name' },
    { value: 'email', label: 'Email', required: true },
    { value: 'phone', label: 'Phone' },
    { value: 'company', label: 'Company' },
    { value: 'type', label: 'Type' },
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

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

function autoMap(headers: string[], entityType: EntityType): Record<string, string> {
  const result: Record<string, string> = {};
  const fields = CRM_FIELDS[entityType] ?? [];
  headers.forEach(h => {
    const lower = h.toLowerCase().replace(/[\s_\-\*]/g, '');
    let matched = '';
    if (lower.includes('firstname') || lower === 'first') matched = 'firstName';
    else if (lower.includes('lastname') || lower === 'last') matched = 'lastName';
    else if (lower.includes('email')) matched = 'email';
    else if (lower.includes('phone') || lower.includes('mobile')) matched = 'phone';
    else if (lower.includes('company') || lower.includes('companyname')) matched = entityType === 'suppliers' ? 'name' : 'company';
    else if (lower.includes('title') || lower.includes('leadtitle')) matched = 'title';
    else if (lower.includes('destination')) matched = 'destination';
    else if (lower.includes('traveldate') || lower.includes('travel')) matched = 'travelDate';
    else if (lower.includes('budget') || lower.includes('value')) matched = 'value';
    else if (lower.includes('status')) matched = 'status';
    else if (lower.includes('category')) matched = 'category';
    else if (lower.includes('suppliername') || lower.includes('supplier')) matched = 'supplierName';
    else if (lower.includes('servicetype') || lower.includes('service')) matched = 'serviceType';
    else if (lower.includes('costprice') || lower.includes('cost')) matched = 'costPrice';
    else if (lower.includes('sellprice') || lower.includes('sell')) matched = 'sellPrice';
    else if (lower.includes('currency')) matched = 'currency';
    else if (lower.includes('validfrom')) matched = 'validFrom';
    else if (lower.includes('validto')) matched = 'validTo';
    else if (lower.includes('passport')) matched = 'passportNumber';
    else if (lower.includes('dob') || lower.includes('dateofbirth') || lower.includes('birth')) matched = 'dateOfBirth';
    else if (lower.includes('country')) matched = 'country';
    else if (lower.includes('city')) matched = 'city';
    else if (lower.includes('tag')) matched = 'tags';
    else if (lower.includes('note')) matched = 'notes';

    // Only set if the field exists for this entity type
    if (matched && fields.some(f => f.value === matched)) {
      result[h] = matched;
    }
  });
  return result;
}

type Step = 1 | 2 | 3 | 4;

interface ImportProgress {
  status?: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  processedRows?: number;
  totalRows?: number;
  successCount?: number;
  duplicateCount?: number;
  errorCount?: number;
}

export default function ImportPage() {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>(1);
  const [entityType, setEntityType] = React.useState<EntityType | ''>('');
  const [file, setFile] = React.useState<File | null>(null);
  const [dragOver, setDragOver] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadedJobId, setUploadedJobId] = React.useState<string | null>(null);
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [previewData, setPreviewData] = React.useState<Record<string, string>[]>([]);
  const [totalRows, setTotalRows] = React.useState(0);
  const [mappings, setMappings] = React.useState<Record<string, string>>({});
  const [duplicateStrategy, setDuplicateStrategy] = React.useState<DuplicateStrategy>('skip');
  // Step 4: progress
  const [isImporting, setIsImporting] = React.useState(false);
  const [progress, setProgress] = React.useState<ImportProgress | null>(null);
  const [importDone, setImportDone] = React.useState(false);
  const [isCancelling, setIsCancelling] = React.useState(false);
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const wsConnected = useRealtimeConnected();
  const useRealtimeConnectedRef = React.useRef(wsConnected);
  React.useEffect(() => { useRealtimeConnectedRef.current = wsConnected; }, [wsConnected]);

  // Real-time import progress via WebSocket
  useRealtimeEvent(['import:progress', 'import:completed', 'import:failed'], (data: any) => {
    if (data?.jobId === uploadedJobId) {
      setProgress(data);
      if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
        if (pollRef.current) clearInterval(pollRef.current);
        setImportDone(true);
        setIsImporting(false);
      }
    }
  });

  const availableFields = entityType ? CRM_FIELDS[entityType as EntityType] : [];
  const requiredFields = availableFields.filter(f => f.required).map(f => f.value);
  const mappedCrmFields = Object.values(mappings).filter(v => v && v !== '__skip');
  const unmappedRequired = requiredFields.filter(r => !mappedCrmFields.includes(r));

  // Prevent duplicate CRM field selection
  function getMappingOptions(currentHeader: string) {
    const otherMapped = Object.entries(mappings)
      .filter(([h, v]) => h !== currentHeader && v && v !== '__skip')
      .map(([, v]) => v);
    return availableFields.filter(f => !otherMapped.includes(f.value));
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleDownloadTemplate() {
    if (!entityType) { toast.error('Select an import type first'); return; }
    try {
      const blob = await importsApi.getTemplate(entityType);
      downloadBlob(blob as unknown as Blob, `${entityType}_import_template.xlsx`);
      toast.success('Template downloaded');
    } catch {
      toast.error('Failed to download template');
    }
  }

  function handleDragOver(e: React.DragEvent) { e.preventDefault(); setDragOver(true); }
  function handleDragLeave() { setDragOver(false); }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) validateAndSetFile(f);
  }
  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.currentTarget.files?.[0];
    if (f) validateAndSetFile(f);
  }
  function validateAndSetFile(f: File) {
    if (f.size > MAX_FILE_SIZE) {
      toast.error(`File too large. Maximum size is 20MB. Your file is ${(f.size / 1024 / 1024).toFixed(1)}MB`);
      return;
    }
    if (!f.name.match(/\.(csv|xlsx|xls)$/i)) {
      toast.error('Only CSV and Excel (XLSX/XLS) files are supported');
      return;
    }
    setFile(f);
  }

  async function handleUpload() {
    if (!file || !entityType) return;
    setIsUploading(true);
    try {
      const res = await importsApi.upload({ file, type: entityType, skipHeader: true }) as any;
      const data = res?.data ?? res;
      const jobId = data?.jobId ?? data?.id;
      const uploadHeaders: string[] = data?.headers ?? [];
      const preview: Record<string, string>[] = data?.previewData ?? [];
      const rows = data?.totalRows ?? 0;

      setUploadedJobId(jobId);
      setHeaders(uploadHeaders);
      setPreviewData(preview);
      setTotalRows(rows);
      // Auto-map columns
      setMappings(autoMap(uploadHeaders, entityType as EntityType));
      setStep(2);
    } catch (err: any) {
      toast.error(err?.message || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  }

  async function handleStartImport() {
    if (!uploadedJobId) return;
    setIsImporting(true);
    setImportDone(false);
    try {
      // Convert mappings (skip __skip values)
      const columnMapping: Record<string, string> = {};
      Object.entries(mappings).forEach(([col, field]) => {
        if (field && field !== '__skip') columnMapping[col] = field;
      });

      await importsApi.execute(uploadedJobId, {
        mapping: columnMapping,
        duplicateStrategy,
      });

      // Start fallback polling (only active when WS is disconnected; WS events handle it otherwise)
      pollRef.current = setInterval(async () => {
        if (useRealtimeConnectedRef.current) return; // WS handles it
        try {
          const res = await importsApi.getProgress(uploadedJobId) as any;
          const job = res?.data ?? res;
          setProgress(job);
          if (job?.status === 'completed' || job?.status === 'failed' || job?.status === 'cancelled') {
            clearInterval(pollRef.current!);
            setImportDone(true);
            setIsImporting(false);
          }
        } catch { /* ignore poll errors */ }
      }, 2000);

    } catch (err: any) {
      toast.error(err?.message || 'Failed to start import');
      setIsImporting(false);
    }
  }

  async function handleCancel() {
    if (!uploadedJobId) return;
    setIsCancelling(true);
    try {
      await importsApi.cancel(uploadedJobId);
      clearInterval(pollRef.current!);
      setImportDone(true);
      setIsImporting(false);
      toast.info('Import cancelled');
    } catch {
      toast.error('Failed to cancel import');
    } finally {
      setIsCancelling(false);
    }
  }

  async function handleDownloadErrors() {
    if (!uploadedJobId) return;
    try {
      const blob = await importsApi.downloadErrors(uploadedJobId) as unknown as Blob;
      const importType = entityType || 'import';
      downloadBlob(blob, `${importType}_errors_${uploadedJobId}.xlsx`);
      toast.success('Error report downloaded');
    } catch {
      toast.error('Failed to download error report');
    }
  }

  function handleReset() {
    setStep(1);
    setEntityType('');
    setFile(null);
    setUploadedJobId(null);
    setHeaders([]);
    setPreviewData([]);
    setTotalRows(0);
    setMappings({});
    setDuplicateStrategy('skip');
    setIsImporting(false);
    setImportDone(false);
    setProgress(null);
    if (pollRef.current) clearInterval(pollRef.current);
  }

  React.useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const STEP_LABELS = ['Upload', 'Map Columns', 'Preview & Duplicates', 'Import'];

  return (
    <div className="flex h-full flex-col">
      <div className="px-ds-6 pt-ds-4">
        <PageHeader
          title="Import Data"
          description={`Step ${step} of 4 — ${STEP_LABELS[step - 1]}`}
          actions={
            <>
              {entityType && (
                <Button variant="outline" size="sm" onClick={handleDownloadTemplate} className="gap-ds-2">
                  <Download aria-hidden="true" /> Download Template
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => router.push('/settings/import')}>
                View Import History
              </Button>
            </>
          }
        />
      </div>

      {/* Step Indicator */}
      <div className="border-b border-ds-border px-ds-6 py-ds-4">
        <div className="flex items-center">
          {STEP_LABELS.map((label, i) => (
            <React.Fragment key={i}>
              <div className="flex items-center gap-ds-2">
                <div className={cn(
                  'flex size-8 items-center justify-center rounded-ds-full text-sm font-semibold',
                  step >= i + 1 ? 'bg-ds-primary text-ds-primary-foreground' : 'bg-ds-surface-sunken text-ds-foreground-muted',
                )}>
                  {step > i + 1 ? <CheckCircle2 className="size-4" /> : i + 1}
                </div>
                <span className={cn('hidden text-xs font-medium sm:block', step === i + 1 ? 'text-ds-foreground' : 'text-ds-foreground-muted')}>{label}</span>
              </div>
              {i < STEP_LABELS.length - 1 && (
                <div className={cn('mx-ds-3 h-0.5 flex-1', step > i + 1 ? 'bg-ds-primary' : 'bg-ds-surface-sunken')} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-ds-6">
        <div className="mx-auto max-w-4xl space-y-ds-4">

          {/* STEP 1: Upload */}
          {step === 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Select Import Type & Upload File</CardTitle>
              </CardHeader>
              <CardContent className="space-y-ds-6">
                {/* Entity Type — icon card grid */}
                <div className="space-y-ds-2">
                  <Label>Import As <span className="text-ds-danger">*</span></Label>
                  <div className="grid grid-cols-2 gap-ds-3 sm:grid-cols-5">
                    {ENTITY_TYPES.map(et => (
                      <button
                        key={et.value}
                        onClick={() => setEntityType(et.value)}
                        className={cn(
                          'flex flex-col items-center gap-ds-2 rounded-ds-lg border-2 p-ds-4 text-sm font-medium transition-colors',
                          entityType === et.value
                            ? 'border-ds-primary bg-ds-primary-subtle text-ds-primary-on-subtle'
                            : 'border-ds-border hover:border-ds-border-strong',
                        )}
                      >
                        <span className="text-2xl">{et.icon}</span>
                        {et.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* File upload */}
                <div className="space-y-ds-2">
                  <Label>File <span className="text-ds-danger">*</span></Label>
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={cn(
                      'rounded-ds-lg border-2 border-dashed p-ds-8 text-center transition-colors',
                      dragOver ? 'border-ds-primary bg-ds-primary-subtle' : 'border-ds-border',
                    )}
                  >
                    <Upload className="mx-auto mb-ds-3 size-8 text-ds-foreground-muted" />
                    <p className="mb-ds-1 text-sm font-medium">Drag & drop your file here</p>
                    <p className="mb-ds-4 text-xs text-ds-foreground-muted">CSV or Excel (XLSX) — max 20MB</p>
                    <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileInput} className="hidden" id="fileInput" />
                    <label htmlFor="fileInput">
                      <Button variant="outline" size="sm" asChild><span>Browse Files</span></Button>
                    </label>
                    {file && (
                      <div className="mt-ds-4 flex items-center justify-center gap-ds-2">
                        <Tag tone="neutral">{file.name} ({(file.size / 1024).toFixed(0)} KB)</Tag>
                        <button onClick={() => setFile(null)} className="text-ds-foreground-muted hover:text-ds-foreground">
                          <X className="size-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <Alert>
                  <AlertCircle className="size-4" />
                  <AlertDescription>
                    First row must contain column headers. Use UTF-8 encoding. Max 20MB file size.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          )}

          {/* STEP 2: Column Mapping */}
          {step === 2 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Map Columns</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setMappings(autoMap(headers, entityType as EntityType))} className="gap-ds-2">
                    <RefreshCw aria-hidden="true" /> Reset Auto-Map
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-ds-4">
                {unmappedRequired.length > 0 && (
                  <Alert variant="destructive">
                    <AlertCircle className="size-4" />
                    <AlertDescription>
                      Required fields not yet mapped: <strong>{unmappedRequired.map(r => availableFields.find(f => f.value === r)?.label ?? r).join(', ')}</strong>
                    </AlertDescription>
                  </Alert>
                )}
                <p className="text-sm text-ds-foreground-muted">
                  Match your file columns to CRM fields. File has <strong>{headers.length}</strong> columns and <strong>{totalRows}</strong> rows.
                </p>
                <div className="space-y-ds-3">
                  {headers.map(header => {
                    const sampleVal = previewData[0]?.[header] ?? '';
                    const isMapped = mappings[header] && mappings[header] !== '__skip';
                    const mappedField = availableFields.find(f => f.value === mappings[header]);
                    return (
                      <div key={header} className={cn(
                        'flex items-start gap-ds-3 rounded-ds-lg border p-ds-3',
                        isMapped ? 'border-ds-success bg-ds-success-subtle' : 'border-ds-border',
                      )}>
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-ds-2">
                            {isMapped
                              ? <CheckCircle2 className="size-3.5 shrink-0 text-ds-success" />
                              : <div className="size-3.5 shrink-0 rounded-ds-full border-2 border-ds-border-strong" />
                            }
                            <span className="truncate text-sm font-medium">{header}</span>
                          </div>
                          {sampleVal && <p className="truncate pl-5 text-xs text-ds-foreground-muted">Sample: {sampleVal}</p>}
                        </div>
                        <Select
                          value={mappings[header] ?? ''}
                          onValueChange={v => setMappings(prev => ({ ...prev, [header]: v }))}
                        >
                          <SelectTrigger className="w-44 shrink-0">
                            <SelectValue placeholder="-- Skip --" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__skip">-- Skip --</SelectItem>
                            {getMappingOptions(header).map(f => (
                              <SelectItem key={f.value} value={f.value}>
                                {f.label}{f.required ? ' *' : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* STEP 3: Preview + Duplicate Strategy */}
          {step === 3 && (
            <div className="space-y-ds-4">
              <Card>
                <CardHeader>
                  <CardTitle>Data Preview</CardTitle>
                </CardHeader>
                <CardContent className="space-y-ds-4">
                  <p className="text-sm text-ds-foreground-muted">
                    First {previewData.length} of <strong>{totalRows}</strong> rows
                  </p>
                  <div className="overflow-x-auto rounded-ds-lg border border-ds-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {headers.filter(h => mappings[h] && mappings[h] !== '__skip').map(h => {
                            const field = availableFields.find(f => f.value === mappings[h]);
                            return (
                              <TableHead key={h} className="text-xs">
                                {field?.label ?? h}
                                {field?.required && <span className="ml-0.5 text-ds-danger">*</span>}
                              </TableHead>
                            );
                          })}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewData.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={99} className="py-ds-8 text-center text-sm text-ds-foreground-muted">No preview data available</TableCell>
                          </TableRow>
                        ) : previewData.map((row, idx) => (
                          <TableRow key={idx}>
                            {headers.filter(h => mappings[h] && mappings[h] !== '__skip').map(h => (
                              <TableCell key={h} className="text-sm">{row[h] ?? ''}</TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Duplicate Handling</CardTitle>
                </CardHeader>
                <CardContent className="space-y-ds-3">
                  {[
                    { value: 'skip', label: 'Skip Duplicates', desc: 'Duplicate records will be skipped — existing data stays unchanged' },
                    { value: 'merge', label: 'Update Existing', desc: 'Matching records will be updated with data from the import file' },
                    { value: 'create', label: 'Create New', desc: 'Always create new records, even if duplicates exist' },
                  ].map(opt => (
                    <label
                      key={opt.value}
                      className={cn(
                        'flex cursor-pointer items-start gap-ds-3 rounded-ds-lg border p-ds-4 transition-colors',
                        duplicateStrategy === opt.value ? 'border-ds-primary bg-ds-primary-subtle' : 'border-ds-border hover:bg-ds-surface-sunken',
                      )}
                    >
                      <input
                        type="radio"
                        name="duplicateStrategy"
                        value={opt.value}
                        checked={duplicateStrategy === opt.value as DuplicateStrategy}
                        onChange={() => setDuplicateStrategy(opt.value as DuplicateStrategy)}
                        className="mt-0.5 size-4"
                      />
                      <div>
                        <p className="text-sm font-medium">{opt.label}</p>
                        <p className="mt-0.5 text-xs text-ds-foreground-muted">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}

          {/* STEP 4: Import Progress */}
          {step === 4 && (
            <Card>
              <CardHeader>
                <CardTitle>
                  {importDone && progress?.status === 'completed' ? 'Import Complete' :
                   importDone && progress?.status === 'cancelled' ? 'Import Cancelled' :
                   importDone && progress?.status === 'failed' ? 'Import Failed' :
                   'Importing...'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-ds-6">
                {/* Summary before start */}
                {!isImporting && !importDone && (
                  <div className="space-y-ds-3 text-sm">
                    <div className="space-y-ds-2 rounded-ds-lg bg-ds-surface-sunken p-ds-4">
                      <div className="flex justify-between"><span className="text-ds-foreground-muted">Import Type:</span><span className="font-medium capitalize">{entityType?.replace('_', ' ')}</span></div>
                      <div className="flex justify-between"><span className="text-ds-foreground-muted">File:</span><span className="font-medium">{file?.name}</span></div>
                      <div className="flex justify-between"><span className="text-ds-foreground-muted">Total Rows:</span><span className="font-medium">{totalRows}</span></div>
                      <div className="flex justify-between"><span className="text-ds-foreground-muted">Mapped Columns:</span><span className="font-medium">{Object.values(mappings).filter(v => v && v !== '__skip').length}</span></div>
                      <div className="flex justify-between"><span className="text-ds-foreground-muted">Duplicate Strategy:</span><span className="font-medium capitalize">{duplicateStrategy}</span></div>
                    </div>
                    <Alert>
                      <AlertCircle className="size-4" />
                      <AlertDescription>
                        This will start the import process in the background. Large files may take a few minutes.
                      </AlertDescription>
                    </Alert>
                  </div>
                )}

                {/* Progress bar */}
                {(isImporting || (importDone && progress)) && (
                  <div className="space-y-ds-4">
                    {!importDone && (
                      <div className="space-y-ds-2">
                        <div className="flex justify-between text-sm">
                          <span>Processing rows...</span>
                          <span>{progress?.processedRows ?? 0} / {progress?.totalRows ?? totalRows}</span>
                        </div>
                        <Progress
                          value={progress?.totalRows ? Math.round(((progress.processedRows ?? 0) / progress.totalRows) * 100) : 0}
                          className="h-2"
                        />
                      </div>
                    )}

                    {progress && (
                      <div className="grid grid-cols-3 gap-ds-4 text-center">
                        <div className="rounded-ds-lg border border-ds-success bg-ds-success-subtle p-ds-4">
                          <p className="text-2xl font-bold text-ds-success">{progress.successCount ?? 0}</p>
                          <p className="text-xs text-ds-foreground-muted">Imported</p>
                        </div>
                        <div className="rounded-ds-lg border border-ds-warning bg-ds-warning-subtle p-ds-4">
                          <p className="text-2xl font-bold text-ds-warning">{progress.duplicateCount ?? 0}</p>
                          <p className="text-xs text-ds-foreground-muted">Duplicates</p>
                        </div>
                        <div className="rounded-ds-lg border border-ds-danger bg-ds-danger-subtle p-ds-4">
                          <p className="text-2xl font-bold text-ds-danger">{progress.errorCount ?? 0}</p>
                          <p className="text-xs text-ds-foreground-muted">Errors</p>
                        </div>
                      </div>
                    )}

                    {importDone && progress?.status === 'completed' && (
                      <Alert className="border-ds-success bg-ds-success-subtle">
                        <CheckCircle2 className="size-4 text-ds-success" />
                        <AlertDescription className="text-ds-success-on-subtle">
                          Import completed successfully!
                        </AlertDescription>
                      </Alert>
                    )}
                    {importDone && progress?.status === 'failed' && (
                      <Alert variant="destructive">
                        <XCircle className="size-4" />
                        <AlertDescription>Import failed. Download the error report for details.</AlertDescription>
                      </Alert>
                    )}
                    {importDone && progress?.status === 'cancelled' && (
                      <Alert>
                        <AlertCircle className="size-4" />
                        <AlertDescription>Import was cancelled.</AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="flex items-center justify-between border-t border-ds-border bg-ds-background px-ds-6 py-ds-4">
        {/* LEFT */}
        {step === 4 && importDone ? (
          <Button variant="outline" onClick={handleReset}>
            Import Another File
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={() => {
              if (step > 1) setStep((step - 1) as Step);
            }}
            disabled={step === 1 || isUploading || isImporting}
          >
            Previous
          </Button>
        )}

        {/* RIGHT */}
        <div className="flex items-center gap-ds-2">
          {/* Cancel import during progress */}
          {step === 4 && isImporting && !importDone && (
            <Button variant="outline" onClick={handleCancel} disabled={isCancelling} className="gap-ds-2">
              {isCancelling && <Loader2 className="size-4 animate-spin" />}
              Cancel Import
            </Button>
          )}

          {/* Download errors after done with errors */}
          {step === 4 && importDone && (progress?.errorCount ?? 0) > 0 && (
            <Button variant="outline" onClick={handleDownloadErrors} className="gap-ds-2">
              <Download aria-hidden="true" /> Download Error Report
            </Button>
          )}

          {/* View records after successful import */}
          {step === 4 && importDone && progress?.status === 'completed' && entityType && (
            <Button variant="outline" onClick={() => router.push(`/${entityType === 'rate_cards' ? 'rate-cards' : entityType}`)}>
              View {ENTITY_TYPES.find(e => e.value === entityType)?.label}
            </Button>
          )}

          {/* Step 1 → 2: upload file */}
          {step === 1 && (
            <Button onClick={handleUpload} disabled={!file || !entityType || isUploading} className="gap-ds-2">
              {isUploading ? <><Loader2 className="size-4 animate-spin" />Uploading...</> : <>Next <ChevronRight className="size-4" /></>}
            </Button>
          )}

          {/* Step 2 → 3 */}
          {step === 2 && (
            <Button
              onClick={() => setStep(3)}
              disabled={unmappedRequired.length > 0}
              title={unmappedRequired.length > 0 ? `Map required fields: ${unmappedRequired.join(', ')}` : ''}
              className="gap-ds-2"
            >
              Next <ChevronRight className="size-4" />
            </Button>
          )}

          {/* Step 3 → 4 */}
          {step === 3 && (
            <Button onClick={() => setStep(4)} className="gap-ds-2">
              Next <ChevronRight className="size-4" />
            </Button>
          )}

          {/* Step 4: Start import */}
          {step === 4 && !isImporting && !importDone && (
            <Button onClick={handleStartImport} className="gap-ds-2">
              <Upload aria-hidden="true" /> Start Import
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
