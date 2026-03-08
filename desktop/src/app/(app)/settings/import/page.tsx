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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { useApiQuery } from '@/hooks/use-api';
import { importsApi, type ImportJob } from '@/lib/api/imports';
import { cn } from '@/lib/utils';

type WizardStep = 'upload' | 'configure' | 'preview' | 'execute';

const statusConfig = {
  pending: { label: 'Pending', icon: Clock, className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400' },
  processing: { label: 'Processing', icon: Loader2, className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  completed: { label: 'Completed', icon: CheckCircle2, className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  failed: { label: 'Failed', icon: XCircle, className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

function formatDate(iso?: string) {
  if (!iso) return '-';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

export default function ImportSettingsPage() {
  const router = useRouter();
  const [step, setStep] = React.useState<WizardStep>('upload');
  const [importType, setImportType] = React.useState('contacts');
  const [file, setFile] = React.useState<File | null>(null);
  const [skipHeader, setSkipHeader] = React.useState(true);
  const [skipDuplicates, setSkipDuplicates] = React.useState(true);
  const [updateExisting, setUpdateExisting] = React.useState(false);
  const [uploadedJob, setUploadedJob] = React.useState<ImportJob | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [executing, setExecuting] = React.useState(false);

  const { data: jobsResponse, loading, refetch } = useApiQuery(
    () => importsApi.list({ limit: 20, sortBy: 'createdAt', sortOrder: 'desc' }),
    [],
  );

  const jobs: ImportJob[] = React.useMemo(() => {
    if (!jobsResponse || !('data' in jobsResponse)) return [];
    const d = jobsResponse.data as any;
    return d?.data ?? d ?? [];
  }, [jobsResponse]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.currentTarget.files?.[0];
    if (f) setFile(f);
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error('Please select a file');
      return;
    }
    setUploading(true);
    try {
      const result = await importsApi.upload({ file, type: importType, skipHeader });
      const job = (result as any)?.data ?? result;
      setUploadedJob(job);
      setStep('configure');
      toast.success('File uploaded successfully');
    } catch {
      toast.error('Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  const handleExecute = async () => {
    if (!uploadedJob) return;
    setExecuting(true);
    try {
      await importsApi.execute(uploadedJob.id, {
        mapping: {},
        skipDuplicates,
        updateExisting,
      });
      toast.success('Import started');
      setStep('upload');
      setFile(null);
      setUploadedJob(null);
      refetch();
    } catch {
      toast.error('Failed to start import');
    } finally {
      setExecuting(false);
    }
  };

  const handleDownloadTemplate = async (type: string) => {
    try {
      await importsApi.getTemplate(type);
      toast.success(`${type} template downloaded`);
    } catch {
      toast.error('Failed to download template');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/settings')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Data Import</h1>
          <p className="text-muted-foreground mt-1">Import contacts, leads, and other data from CSV files</p>
        </div>
      </div>

      {/* Templates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Download Templates
          </CardTitle>
          <CardDescription>Get CSV templates with the correct column format</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            {['contacts', 'leads', 'suppliers'].map((type) => (
              <Button key={type} variant="outline" size="sm" className="gap-2" onClick={() => handleDownloadTemplate(type)}>
                <FileSpreadsheet className="h-4 w-4" />
                {type.charAt(0).toUpperCase() + type.slice(1)} Template
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
            <div className="flex items-center gap-2 mt-2">
              {(['upload', 'configure', 'execute'] as const).map((s, idx) => (
                <React.Fragment key={s}>
                  <span
                    className={cn(
                      'text-xs px-2 py-1 rounded',
                      step === s ? 'bg-primary text-primary-foreground' : 'bg-muted',
                    )}
                  >
                    {idx + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
                  </span>
                  {idx < 2 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
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
                    <SelectItem value="contacts">Contacts</SelectItem>
                    <SelectItem value="leads">Leads</SelectItem>
                    <SelectItem value="suppliers">Suppliers</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>CSV File</Label>
                <div className="border-2 border-dashed rounded-lg p-8 text-center">
                  <input
                    type="file"
                    accept=".csv,.xlsx"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="import-file"
                  />
                  <label htmlFor="import-file" className="cursor-pointer">
                    <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm font-medium">
                      {file ? file.name : 'Click to select a CSV file'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {file ? `${(file.size / 1024).toFixed(1)} KB` : 'CSV or XLSX, max 10MB'}
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

          {step === 'configure' && (
            <>
              <div className="space-y-4">
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm font-medium">Uploaded: {uploadedJob?.fileName ?? file?.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {uploadedJob?.totalRecords ?? 0} records detected
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <Switch checked={skipDuplicates} onCheckedChange={setSkipDuplicates} />
                  <Label>Skip duplicate records</Label>
                </div>

                <div className="flex items-center gap-3">
                  <Switch checked={updateExisting} onCheckedChange={setUpdateExisting} />
                  <Label>Update existing records if matched</Label>
                </div>
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep('upload')}>Back</Button>
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
          <CardTitle>Import History</CardTitle>
          <CardDescription>Recent import jobs and their status</CardDescription>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <div className="text-center py-8">
              <FileSpreadsheet className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No imports yet</p>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => {
                  const config = statusConfig[job.status] ?? statusConfig.pending;
                  const StatusIcon = config.icon;
                  return (
                    <TableRow key={job.id}>
                      <TableCell className="text-sm font-medium">{job.fileName}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize text-xs">{job.type}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {job.processedRecords}/{job.totalRecords}
                        {job.failedRecords > 0 && (
                          <span className="text-red-500 ml-1">({job.failedRecords} failed)</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={cn('gap-1', config.className)}>
                          <StatusIcon className={cn('h-3 w-3', job.status === 'processing' && 'animate-spin')} />
                          {config.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{formatDate(job.createdAt)}</TableCell>
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
