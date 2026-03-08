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
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { importsApi } from '@/lib/api/imports';

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
  const [progress, setProgress] = React.useState<any>(null);
  const [importDone, setImportDone] = React.useState(false);
  const [isCancelling, setIsCancelling] = React.useState(false);
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

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

      // Start polling progress
      pollRef.current = setInterval(async () => {
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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Import Data
          </h1>
          <p className="text-sm text-muted-foreground">Step {step} of 4 — {STEP_LABELS[step - 1]}</p>
        </div>
        <div className="flex items-center gap-2">
          {entityType && (
            <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
              <Download className="h-4 w-4 mr-1.5" /> Download Template
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => router.push('/settings/import')}>
            View Import History
          </Button>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="px-6 py-4 border-b">
        <div className="flex items-center">
          {STEP_LABELS.map((label, i) => (
            <React.Fragment key={i}>
              <div className="flex items-center gap-2">
                <div className={cn(
                  'h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold',
                  step > i + 1 ? 'bg-primary text-white' : step === i + 1 ? 'bg-primary text-white' : 'bg-muted text-muted-foreground',
                )}>
                  {step > i + 1 ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                </div>
                <span className={cn('text-xs font-medium hidden sm:block', step === i + 1 ? 'text-foreground' : 'text-muted-foreground')}>{label}</span>
              </div>
              {i < STEP_LABELS.length - 1 && (
                <div className={cn('flex-1 h-0.5 mx-3', step > i + 1 ? 'bg-primary' : 'bg-muted')} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-4">

          {/* STEP 1: Upload */}
          {step === 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Select Import Type & Upload File</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Entity Type — icon card grid */}
                <div className="space-y-2">
                  <Label>Import As <span className="text-destructive">*</span></Label>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {ENTITY_TYPES.map(et => (
                      <button
                        key={et.value}
                        onClick={() => setEntityType(et.value)}
                        className={cn(
                          'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors text-sm font-medium',
                          entityType === et.value
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'border-muted hover:border-muted-foreground/40',
                        )}
                      >
                        <span className="text-2xl">{et.icon}</span>
                        {et.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* File upload */}
                <div className="space-y-2">
                  <Label>File <span className="text-destructive">*</span></Label>
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={cn(
                      'border-2 border-dashed rounded-lg p-8 text-center transition-colors',
                      dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25',
                    )}
                  >
                    <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
                    <p className="font-medium text-sm mb-1">Drag & drop your file here</p>
                    <p className="text-xs text-muted-foreground mb-4">CSV or Excel (XLSX) — max 20MB</p>
                    <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileInput} className="hidden" id="fileInput" />
                    <label htmlFor="fileInput">
                      <Button variant="outline" size="sm" asChild><span>Browse Files</span></Button>
                    </label>
                    {file && (
                      <div className="mt-4 flex items-center justify-center gap-2">
                        <Badge variant="outline">{file.name} ({(file.size / 1024).toFixed(0)} KB)</Badge>
                        <button onClick={() => setFile(null)} className="text-muted-foreground hover:text-foreground">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <Alert>
                  <AlertCircle className="h-4 w-4" />
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
                  <Button variant="ghost" size="sm" onClick={() => setMappings(autoMap(headers, entityType as EntityType))}>
                    <RefreshCw className="h-4 w-4 mr-1.5" /> Reset Auto-Map
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {unmappedRequired.length > 0 && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Required fields not yet mapped: <strong>{unmappedRequired.map(r => availableFields.find(f => f.value === r)?.label ?? r).join(', ')}</strong>
                    </AlertDescription>
                  </Alert>
                )}
                <p className="text-sm text-muted-foreground">
                  Match your file columns to CRM fields. File has <strong>{headers.length}</strong> columns and <strong>{totalRows}</strong> rows.
                </p>
                <div className="space-y-3">
                  {headers.map(header => {
                    const sampleVal = previewData[0]?.[header] ?? '';
                    const isMapped = mappings[header] && mappings[header] !== '__skip';
                    const mappedField = availableFields.find(f => f.value === mappings[header]);
                    const isRequired = mappedField?.required;
                    return (
                      <div key={header} className={cn(
                        'flex items-start gap-3 p-3 rounded-lg border',
                        isMapped ? 'border-green-200 bg-green-50/50 dark:border-green-900/40 dark:bg-green-900/10' : 'border-border',
                      )}>
                        <div className="flex-1 space-y-0.5 min-w-0">
                          <div className="flex items-center gap-2">
                            {isMapped
                              ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                              : <div className="h-3.5 w-3.5 rounded-full border-2 border-muted-foreground/30 shrink-0" />
                            }
                            <span className="text-sm font-medium truncate">{header}</span>
                          </div>
                          {sampleVal && <p className="text-xs text-muted-foreground pl-5 truncate">Sample: {sampleVal}</p>}
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
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Data Preview</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    First {previewData.length} of <strong>{totalRows}</strong> rows
                  </p>
                  <div className="overflow-x-auto border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {headers.filter(h => mappings[h] && mappings[h] !== '__skip').map(h => {
                            const field = availableFields.find(f => f.value === mappings[h]);
                            return (
                              <TableHead key={h} className="text-xs">
                                {field?.label ?? h}
                                {field?.required && <span className="text-destructive ml-0.5">*</span>}
                              </TableHead>
                            );
                          })}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewData.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={99} className="text-center text-sm text-muted-foreground py-8">No preview data available</TableCell>
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
                <CardContent className="space-y-3">
                  {[
                    { value: 'skip', label: 'Skip Duplicates', desc: 'Duplicate records will be skipped — existing data stays unchanged' },
                    { value: 'merge', label: 'Update Existing', desc: 'Matching records will be updated with data from the import file' },
                    { value: 'create', label: 'Create New', desc: 'Always create new records, even if duplicates exist' },
                  ].map(opt => (
                    <label
                      key={opt.value}
                      className={cn(
                        'flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors',
                        duplicateStrategy === opt.value ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
                      )}
                    >
                      <input
                        type="radio"
                        name="duplicateStrategy"
                        value={opt.value}
                        checked={duplicateStrategy === opt.value as DuplicateStrategy}
                        onChange={() => setDuplicateStrategy(opt.value as DuplicateStrategy)}
                        className="h-4 w-4 mt-0.5"
                      />
                      <div>
                        <p className="text-sm font-medium">{opt.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
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
              <CardContent className="space-y-6">
                {/* Summary before start */}
                {!isImporting && !importDone && (
                  <div className="space-y-3 text-sm">
                    <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                      <div className="flex justify-between"><span className="text-muted-foreground">Import Type:</span><span className="font-medium capitalize">{entityType?.replace('_', ' ')}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">File:</span><span className="font-medium">{file?.name}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Total Rows:</span><span className="font-medium">{totalRows}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Mapped Columns:</span><span className="font-medium">{Object.values(mappings).filter(v => v && v !== '__skip').length}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Duplicate Strategy:</span><span className="font-medium capitalize">{duplicateStrategy}</span></div>
                    </div>
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        This will start the import process in the background. Large files may take a few minutes.
                      </AlertDescription>
                    </Alert>
                  </div>
                )}

                {/* Progress bar */}
                {(isImporting || (importDone && progress)) && (
                  <div className="space-y-4">
                    {!importDone && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Processing rows...</span>
                          <span>{progress?.processedRows ?? 0} / {progress?.totalRows ?? totalRows}</span>
                        </div>
                        <Progress
                          value={progress?.totalRows ? Math.round((progress.processedRows / progress.totalRows) * 100) : 0}
                          className="h-2"
                        />
                      </div>
                    )}

                    {progress && (
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                          <p className="text-2xl font-bold text-green-600">{progress.successCount ?? 0}</p>
                          <p className="text-xs text-muted-foreground">Imported</p>
                        </div>
                        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                          <p className="text-2xl font-bold text-amber-600">{progress.duplicateCount ?? 0}</p>
                          <p className="text-xs text-muted-foreground">Duplicates</p>
                        </div>
                        <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                          <p className="text-2xl font-bold text-red-600">{progress.errorCount ?? 0}</p>
                          <p className="text-xs text-muted-foreground">Errors</p>
                        </div>
                      </div>
                    )}

                    {importDone && progress?.status === 'completed' && (
                      <Alert className="border-green-200 bg-green-50 dark:bg-green-900/20">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <AlertDescription className="text-green-700 dark:text-green-300">
                          Import completed successfully!
                        </AlertDescription>
                      </Alert>
                    )}
                    {importDone && progress?.status === 'failed' && (
                      <Alert variant="destructive">
                        <XCircle className="h-4 w-4" />
                        <AlertDescription>Import failed. Download the error report for details.</AlertDescription>
                      </Alert>
                    )}
                    {importDone && progress?.status === 'cancelled' && (
                      <Alert>
                        <AlertCircle className="h-4 w-4" />
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
      <div className="border-t px-6 py-4 bg-background flex items-center justify-between">
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
        <div className="flex items-center gap-2">
          {/* Cancel import during progress */}
          {step === 4 && isImporting && !importDone && (
            <Button variant="outline" onClick={handleCancel} disabled={isCancelling}>
              {isCancelling && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Cancel Import
            </Button>
          )}

          {/* Download errors after done with errors */}
          {step === 4 && importDone && progress?.errorCount > 0 && (
            <Button variant="outline" onClick={handleDownloadErrors}>
              <Download className="h-4 w-4 mr-1.5" /> Download Error Report
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
            <Button onClick={handleUpload} disabled={!file || !entityType || isUploading}>
              {isUploading ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Uploading...</> : <>Next <ChevronRight className="h-4 w-4 ml-1" /></>}
            </Button>
          )}

          {/* Step 2 → 3 */}
          {step === 2 && (
            <Button
              onClick={() => setStep(3)}
              disabled={unmappedRequired.length > 0}
              title={unmappedRequired.length > 0 ? `Map required fields: ${unmappedRequired.join(', ')}` : ''}
            >
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}

          {/* Step 3 → 4 */}
          {step === 3 && (
            <Button onClick={() => setStep(4)}>
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}

          {/* Step 4: Start import */}
          {step === 4 && !isImporting && !importDone && (
            <Button onClick={handleStartImport}>
              <Upload className="h-4 w-4 mr-1.5" /> Start Import
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
