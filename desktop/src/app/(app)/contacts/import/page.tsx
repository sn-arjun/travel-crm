'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Upload, Download, Loader2, CheckCircle2, AlertCircle, FileSpreadsheet,
  ArrowRight, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useApiMutation } from '@/hooks/use-api';
import { importsApi, type ImportJob } from '@/lib/api/imports';
import { toast } from 'sonner';

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

export default function ContactImportPage() {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>('upload');
  const [file, setFile] = React.useState<File | null>(null);
  const [importJob, setImportJob] = React.useState<ImportJob | null>(null);
  const [csvHeaders, setCsvHeaders] = React.useState<string[]>([]);
  const [csvPreview, setCsvPreview] = React.useState<string[][]>([]);
  const [mapping, setMapping] = React.useState<Record<string, string>>({});
  const [duplicateStrategy, setDuplicateStrategy] = React.useState<DuplicateStrategy>('skip');
  const [templateDownloading, setTemplateDownloading] = React.useState(false);
  const [errorDownloading, setErrorDownloading] = React.useState(false);

  const { mutate: uploadFile, loading: isUploading } = useApiMutation<File, any>(
    (f) => importsApi.upload({ file: f, type: 'contacts', skipHeader: true }),
  );

  const { mutate: executeImport, loading: isExecuting } = useApiMutation<string, any>(
    (jobId) => importsApi.execute(jobId, { mapping, duplicateStrategy }),
  );

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
        const text = ev.target?.result as string;
        const lines = text.split('\n').filter(Boolean);
        if (lines.length > 0) {
          const headers = lines[0]!.split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
          setCsvHeaders(headers);
          autoMap(headers);
          const previewRows = lines.slice(1, 6).map((line) =>
            line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
          );
          setCsvPreview(previewRows);
        }
      };
      reader.readAsText(f);
    }
  }

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

  async function handleUpload() {
    if (!file) return;
    try {
      const result = await uploadFile(file);
      if (result) {
        const data = (result as any)?.data;
        const job = data?.jobId ? data : (result as any)?.data;
        // Server returns headers/previewData — use them if available
        if (data?.headers?.length) {
          setCsvHeaders(data.headers);
          autoMap(data.headers);
        }
        if (data?.previewData?.length) {
          setCsvPreview(data.previewData.map((row: any) =>
            Array.isArray(row) ? row : Object.values(row)
          ));
        }
        setImportJob({ id: data?.jobId, status: 'pending', totalRows: data?.totalRows } as any);
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
        setImportJob((prev) => ({ ...prev!, ...((result as any)?.data ?? {}) }));
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
      const blob = await importsApi.getTemplate('contacts') as unknown as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'contacts_import_template.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
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
      const blob = await importsApi.downloadErrors(importJob.id) as unknown as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contacts_errors_${importJob.id}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Error report downloaded');
    } catch {
      toast.error('Failed to download error report');
    } finally {
      setErrorDownloading(false);
    }
  }

  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const failedRecords = (importJob as any)?.failedRecords ?? (importJob as any)?.failed_records ?? 0;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Import Contacts
          </h1>
        </div>
        <Button variant="outline" size="sm" onClick={handleDownloadTemplate} disabled={templateDownloading}>
          {templateDownloading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Download className="h-4 w-4 mr-1.5" />}
          Download Template
        </Button>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2 px-6 py-4 border-b">
        {STEPS.map((s, idx) => (
          <React.Fragment key={s.key}>
            <div className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium',
              idx <= stepIndex ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
            )}>
              <span className="h-5 w-5 rounded-full bg-white/20 flex items-center justify-center text-[10px]">
                {idx < stepIndex ? <CheckCircle2 className="h-3 w-3" /> : idx + 1}
              </span>
              {s.label}
            </div>
            {idx < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </React.Fragment>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto">
          {/* Step 1: Upload */}
          {step === 'upload' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Upload File</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="border-2 border-dashed rounded-lg p-8 text-center">
                  <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <Label htmlFor="file-upload" className="cursor-pointer">
                    <span className="text-sm font-medium text-primary hover:underline">Click to upload</span>
                    <span className="text-sm text-muted-foreground"> or drag and drop</span>
                  </Label>
                  <Input
                    id="file-upload"
                    type="file"
                    accept=".csv,.xlsx"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <p className="text-xs text-muted-foreground mt-2">CSV or XLSX files up to 20MB</p>
                  {file && (
                    <Badge variant="outline" className="mt-4">
                      {file.name} ({(file.size / 1024).toFixed(1)} KB)
                    </Badge>
                  )}
                </div>

                {file && (
                  <div className="flex justify-end">
                    <Button onClick={handleUpload} disabled={isUploading}>
                      {isUploading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <ArrowRight className="h-4 w-4 mr-1.5" />}
                      Upload & Continue
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Step 2: Map Columns */}
          {step === 'map' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Map Columns</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <p className="text-sm text-muted-foreground">
                  Map each column from your file to the corresponding contact field.
                </p>

                <div className="space-y-3">
                  {csvHeaders.map((header) => (
                    <div key={header} className="flex items-center gap-4">
                      <span className="text-sm font-medium w-40 truncate">{header}</span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      <Select
                        value={mapping[header] ?? '__skip'}
                        onValueChange={(v) => setMapping((prev) => ({ ...prev, [header]: v }))}
                      >
                        <SelectTrigger className="w-48">
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

                <div className="flex justify-between pt-4">
                  <Button variant="outline" onClick={() => setStep('upload')}>Back</Button>
                  <Button onClick={() => setStep('preview')}>
                    <ArrowRight className="h-4 w-4 mr-1.5" /> Preview
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Preview */}
          {step === 'preview' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Preview Import</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <p className="text-sm text-muted-foreground">
                  Preview the first few rows that will be imported.
                </p>

                {csvPreview.length > 0 && (
                  <div className="overflow-x-auto">
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
                            {csvHeaders.map((h, colIdx) => {
                              if (mapping[h] === '__skip') return null;
                              return (
                                <TableCell key={colIdx} className="text-xs">
                                  {row[colIdx] ?? ''}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {/* Duplicate Strategy — 3-option radio */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Duplicate handling</Label>
                  <div className="space-y-2">
                    {DUPLICATE_OPTIONS.map((opt) => (
                      <label key={opt.value} className={cn(
                        'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                        duplicateStrategy === opt.value ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
                      )}>
                        <input
                          type="radio"
                          name="duplicateStrategy"
                          value={opt.value}
                          checked={duplicateStrategy === opt.value}
                          onChange={() => setDuplicateStrategy(opt.value)}
                          className="mt-0.5"
                        />
                        <div>
                          <p className="text-sm font-medium">{opt.label}</p>
                          <p className="text-xs text-muted-foreground">{opt.description}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex justify-between pt-4">
                  <Button variant="outline" onClick={() => setStep('map')}>Back</Button>
                  <Button onClick={handleExecute} disabled={isExecuting}>
                    {isExecuting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Upload className="h-4 w-4 mr-1.5" />}
                    Start Import
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 4: Execute / Results */}
          {step === 'execute' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  Import Started
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {importJob && (
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-2xl font-bold">{(importJob as any).totalRows ?? (importJob as any).totalRecords ?? 0}</p>
                        <p className="text-xs text-muted-foreground">Total Records</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-2xl font-bold text-green-600">{(importJob as any).processedRecords ?? 0}</p>
                        <p className="text-xs text-muted-foreground">Processed</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-2xl font-bold text-red-600">{failedRecords}</p>
                        <p className="text-xs text-muted-foreground">Failed</p>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {failedRecords > 0 && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                    <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
                    <p className="text-sm text-red-700 dark:text-red-400 flex-1">
                      {failedRecords} row(s) failed to import.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 border-red-300 text-red-700 hover:bg-red-100"
                      onClick={handleDownloadErrors}
                      disabled={errorDownloading}
                    >
                      {errorDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                      Download Error Report
                    </Button>
                  </div>
                )}

                <div className="flex justify-center gap-3 pt-4">
                  <Button variant="outline" onClick={() => router.push('/contacts')}>
                    View Contacts
                  </Button>
                  <Button onClick={() => {
                    setStep('upload');
                    setFile(null);
                    setImportJob(null);
                    setCsvHeaders([]);
                    setCsvPreview([]);
                    setMapping({});
                  }}>
                    Import More
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
