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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { useApiQuery } from '@/hooks/use-api';
import { importsApi, type ImportJob } from '@/lib/api/imports';
import { cn } from '@/lib/utils';

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

const statusConfig: Record<string, { label: string; icon: any; className: string }> = {
  pending: { label: 'Pending', icon: Clock, className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400' },
  validating: { label: 'Validating', icon: Loader2, className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  importing: { label: 'Processing', icon: Loader2, className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  processing: { label: 'Processing', icon: Loader2, className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  completed: { label: 'Completed', icon: CheckCircle2, className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  failed: { label: 'Failed', icon: XCircle, className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  cancelled: { label: 'Cancelled', icon: AlertTriangle, className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
};

function formatDate(iso?: string) {
  if (!iso) return '-';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
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

export default function ImportSettingsPage() {
  const router = useRouter();
  const [step, setStep] = React.useState<WizardStep>('upload');
  const [importType, setImportType] = React.useState('contacts');
  const [file, setFile] = React.useState<File | null>(null);
  const [skipHeader, setSkipHeader] = React.useState(true);
  const [duplicateStrategy, setDuplicateStrategy] = React.useState<'skip' | 'merge' | 'create'>('skip');
  const [uploadedJob, setUploadedJob] = React.useState<any>(null);
  const [uploading, setUploading] = React.useState(false);
  const [executing, setExecuting] = React.useState(false);
  const [mappings, setMappings] = React.useState<Record<string, string>>({});
  const [filterType, setFilterType] = React.useState('all');
  const [filterStatus, setFilterStatus] = React.useState('all');

  const { data: jobsResponse, loading, refetch } = useApiQuery(
    () => importsApi.list({ limit: 50, sortBy: 'createdAt', sortOrder: 'desc' }),
    [],
  );

  const allJobs: ImportJob[] = React.useMemo(() => {
    if (!jobsResponse || !('data' in jobsResponse)) return [];
    const d = (jobsResponse as any).data;
    return (d?.data ?? d ?? []) as ImportJob[];
  }, [jobsResponse]);

  const filteredJobs = React.useMemo(() => {
    return allJobs.filter(j => {
      if (filterType !== 'all' && j.type !== filterType) return false;
      if (filterStatus !== 'all' && j.status !== filterStatus) return false;
      return true;
    });
  }, [allJobs, filterType, filterStatus]);

  const headers: string[] = uploadedJob?.headers ?? [];
  const availableFields = CRM_FIELDS[importType] ?? [];

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
      const result = await importsApi.upload({ file, type: importType, skipHeader }) as any;
      const data = result?.data ?? result;
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
      refetch();
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const stepOrder: WizardStep[] = ['upload', 'map', 'configure'];
  const stepLabels: Record<WizardStep, string> = { upload: 'Upload', map: 'Map Columns', configure: 'Configure' };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/settings')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Data Import</h1>
          <p className="text-muted-foreground mt-1">Import contacts, leads, and other data from CSV/Excel files</p>
        </div>
      </div>

      {/* Templates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Download Templates
          </CardTitle>
          <CardDescription>Get Excel templates with correct column formats and sample data</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {IMPORT_TYPES.map(type => (
              <Button key={type.value} variant="outline" size="sm" className="gap-2" onClick={() => handleDownloadTemplate(type.value)}>
                <FileSpreadsheet className="h-4 w-4" />
                {type.label} Template
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Import Wizard */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Wizard
          </CardTitle>
          <CardDescription>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {stepOrder.map((s, idx) => (
                <React.Fragment key={s}>
                  <span className={cn(
                    'text-xs px-2 py-1 rounded',
                    step === s ? 'bg-primary text-primary-foreground' :
                    stepOrder.indexOf(step) > idx ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-muted text-muted-foreground',
                  )}>
                    {idx + 1}. {stepLabels[s]}
                  </span>
                  {idx < stepOrder.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                </React.Fragment>
              ))}
            </div>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {step === 'upload' && (
            <>
              <div className="space-y-2">
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

              <div className="space-y-2">
                <Label>File (CSV or XLSX, max 20MB)</Label>
                <div className="border-2 border-dashed rounded-lg p-8 text-center">
                  <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileSelect} className="hidden" id="import-file" />
                  <label htmlFor="import-file" className="cursor-pointer">
                    <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm font-medium">
                      {file ? file.name : 'Click to select a CSV or Excel file'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {file ? `${(file.size / 1024).toFixed(1)} KB` : 'CSV or XLSX, max 20MB'}
                    </p>
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Switch checked={skipHeader} onCheckedChange={setSkipHeader} />
                <Label>First row is header</Label>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleUpload} disabled={!file || uploading} className="gap-2">
                  {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
                  <Upload className="h-4 w-4" />
                  Upload & Continue
                </Button>
              </div>
            </>
          )}

          {step === 'map' && (
            <>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm font-medium">Uploaded: {file?.name}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {uploadedJob?.totalRows ?? 0} records — {headers.length} columns detected
                </p>
              </div>

              {headers.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">Map your file columns to CRM fields. Fields marked * are required.</p>
                  {headers.map(header => (
                    <div key={header} className="flex items-center gap-4">
                      <span className="text-sm font-medium w-48 truncate">{header}</span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
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
                <p className="text-sm text-muted-foreground text-center py-4">No column headers detected. Ensure your file has a header row.</p>
              )}

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep('upload')}>Back</Button>
                <Button onClick={() => setStep('configure')}>
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </>
          )}

          {step === 'configure' && (
            <>
              <div className="space-y-4">
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm font-medium">Ready to import: {uploadedJob?.totalRows ?? 0} records as {IMPORT_TYPES.find(t => t.value === importType)?.label}</p>
                </div>

                <div className="space-y-3">
                  <Label>Duplicate Handling</Label>
                  {[
                    { value: 'skip', label: 'Skip duplicates', desc: 'Existing records stay unchanged' },
                    { value: 'merge', label: 'Update existing', desc: 'Overwrite matching records with import data' },
                    { value: 'create', label: 'Create new', desc: 'Always create, even if duplicate' },
                  ].map(opt => (
                    <label key={opt.value} className={cn(
                      'flex items-start gap-3 p-3 rounded-lg border cursor-pointer',
                      duplicateStrategy === opt.value ? 'border-primary bg-primary/5' : '',
                    )}>
                      <input
                        type="radio"
                        name="duplicateStrategy"
                        value={opt.value}
                        checked={duplicateStrategy === opt.value as any}
                        onChange={() => setDuplicateStrategy(opt.value as any)}
                        className="mt-0.5"
                      />
                      <div>
                        <p className="text-sm font-medium">{opt.label}</p>
                        <p className="text-xs text-muted-foreground">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep('map')}>Back</Button>
                <Button onClick={handleExecute} disabled={executing} className="gap-2">
                  {executing && <Loader2 className="h-4 w-4 animate-spin" />}
                  Start Import
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Import History */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Import History</CardTitle>
              <CardDescription>Recent import jobs and their status</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-40 h-8 text-xs">
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
              <SelectTrigger className="w-40 h-8 text-xs">
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
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              <Loader2 className="h-3.5 w-3.5 mr-1.5" />Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {filteredJobs.length === 0 ? (
            <div className="text-center py-8">
              <FileSpreadsheet className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No imports found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Records</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredJobs.map(job => {
                  const config = statusConfig[job.status] ?? statusConfig['pending']!;
                  const StatusIcon = config.icon;
                  const isActive = ['processing', 'validating', 'importing'].includes(job.status as string);
                  return (
                    <TableRow key={job.id}>
                      <TableCell className="text-sm font-medium">{job.fileName}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize text-xs">
                          {job.type?.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {job.processedRecords}/{job.totalRecords}
                        {job.failedRecords > 0 && (
                          <span className="text-red-500 ml-1">({job.failedRecords} failed)</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={cn('gap-1', config.className)}>
                          <StatusIcon className={cn('h-3 w-3', isActive && 'animate-spin')} />
                          {config.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{formatDate(job.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {job.failedRecords > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => handleDownloadErrors(job.id, job.type)}
                            >
                              <Download className="h-3 w-3 mr-1" />Errors
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            title="Cancel/Delete"
                            onClick={async () => {
                              if (!confirm('Remove this import record?')) return;
                              try {
                                await importsApi.cancel(job.id);
                                refetch();
                                toast.success('Removed');
                              } catch {
                                toast.error('Failed to remove');
                              }
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
