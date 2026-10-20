'use client';


import { formatLocaleDateTime } from '@/lib/format';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  Download,
  Users,
  Target,
  Database,
  CheckCircle2,
  Clock,
  XCircle,
  RefreshCw,
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
import { Tag } from '@/components/ui/tag';
import { Switch } from '@/components/ui/switch';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from 'sonner';
import { exportsApi, type ExportJob } from '@/lib/api/exports';
import { cn } from '@/lib/utils';
import { unwrapEntity } from '@/lib/api/envelope';
import type { LucideIcon } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { useRealtimeEvent, useRealtimeConnected } from '@/hooks/use-realtime-event';
import { toLocalDateString } from '@/lib/dates';
import { PageContainer } from '@/components/layout/page-container';

const statusConfig: Record<string, { label: string; icon: LucideIcon; tone: 'neutral' | 'info' | 'success' | 'danger' }> = {
  pending: { label: 'Pending', icon: Clock, tone: 'neutral' },
  processing: { label: 'Processing', icon: Loader2, tone: 'info' },
  completed: { label: 'Completed', icon: CheckCircle2, tone: 'success' },
  failed: { label: 'Failed', icon: XCircle, tone: 'danger' },
};

function formatDate(iso?: string) {
  if (!iso) return '-';
  try { return formatLocaleDateTime(iso); } catch { return iso; }
}

function ExportSettingsPageContent() {
  const router = useRouter();
  const [contactsFormat, setContactsFormat] = React.useState<'csv' | 'xlsx'>('csv');
  const [leadsFormat, setLeadsFormat] = React.useState<'csv' | 'xlsx'>('csv');
  const [exportingContacts, setExportingContacts] = React.useState(false);
  const [exportingLeads, setExportingLeads] = React.useState(false);
  const [exportingFull, setExportingFull] = React.useState(false);
  const [fullOptions, setFullOptions] = React.useState({
    includeContacts: true,
    includeLeads: true,
    includeInvoices: true,
    includeTasks: true,
    includeSuppliers: true,
    includeTravellers: true,
    includePayments: true,
    includeDocuments: false,
    includeMessages: false,
  });
  // Export jobs are tracked client-side for this session — there is no list
  // endpoint, only GET /exports/jobs/:id for a known job.
  const [jobs, setJobs] = React.useState<ExportJob[]>([]);

  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const hasProcessing = jobs.some(j => j.status === 'processing');

  // Real-time export updates via WebSocket
  useRealtimeEvent(['export:completed', 'export:failed', 'export:progress'], (payload: unknown) => {
    const data = payload as Partial<ExportJob> & { jobId?: string };
    if (data?.jobId) {
      setJobs(prev => prev.map(j => (j.id === data.jobId ? { ...j, ...data, status: data.status ?? j.status } : j)));
    }
  });

  // Fallback: poll only when WS is disconnected and jobs are processing
  const wsConnected = useRealtimeConnected();
  React.useEffect(() => {
    if (wsConnected || !hasProcessing) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(async () => {
      const processingJobs = jobs.filter(j => j.status === 'processing');
      for (const job of processingJobs) {
        try {
          const res = await exportsApi.getJobStatus(job.id);
          const updated = unwrapEntity<ExportJob>(res);
          setJobs(prev => prev.map(j => (j.id === updated.id ? { ...j, ...updated } : j)));
        } catch { /* ignore */ }
      }
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [wsConnected, hasProcessing, jobs]);

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

  function datedFilename(type: string, format: string) {
    const d = toLocalDateString(new Date());
    return `${type}_export_${d}.${format}`;
  }

  const handleExportContacts = async () => {
    setExportingContacts(true);
    try {
      const blob = await exportsApi.contacts({ format: contactsFormat }) as unknown as Blob;
      downloadBlob(blob, datedFilename('contacts', contactsFormat));
      toast.success('Contacts exported successfully');
    } catch {
      toast.error('Failed to export contacts');
    } finally {
      setExportingContacts(false);
    }
  };

  const handleExportLeads = async () => {
    setExportingLeads(true);
    try {
      const blob = await exportsApi.leads({ format: leadsFormat }) as unknown as Blob;
      downloadBlob(blob, datedFilename('leads', leadsFormat));
      toast.success('Leads exported successfully');
    } catch {
      toast.error('Failed to export leads');
    } finally {
      setExportingLeads(false);
    }
  };

  const handleExportFull = async () => {
    setExportingFull(true);
    try {
      const result = await exportsApi.full(fullOptions);
      const job = unwrapEntity<ExportJob | undefined>(result);
      if (job?.id) {
        setJobs(prev => [job, ...prev.filter(j => j.id !== job.id)]);
        toast.success("Full export started. Check the jobs table below when it's ready to download.");
      } else {
        toast.success('Full export initiated');
      }
    } catch {
      toast.error('Failed to start full export');
    } finally {
      setExportingFull(false);
    }
  };

  const handleDownloadJob = async (jobId: string) => {
    try {
      const blob = await exportsApi.downloadJob(jobId) as unknown as Blob;
      downloadBlob(blob, `export_${jobId}.zip`);
      toast.success('Export downloaded');
    } catch {
      toast.error('Failed to download export');
    }
  };

  const handleRefreshJob = async (jobId: string) => {
    try {
      const result = await exportsApi.getJobStatus(jobId);
      const job = unwrapEntity<ExportJob>(result);
      setJobs(prev => prev.map(j => (j.id === jobId ? { ...j, ...job } : j)));
    } catch {
      toast.error('Failed to check status');
    }
  };

  return (
    <div className="space-y-ds-6">
      <PageHeader
        title="Data export"
        description="Export your CRM data in various formats"
        back={
          <Button variant="ghost" size="icon" onClick={() => router.push('/settings')} aria-label="Back to settings">
            <ArrowLeft className="size-5" />
          </Button>
        }
      />

      {/* Quick Exports */}
      <div className="grid grid-cols-1 gap-ds-4 md:grid-cols-2">
        {/* Contacts Export */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-ds-2">
              <Users className="size-5" />
              Export Contacts
            </CardTitle>
            <CardDescription>Download all contacts as a spreadsheet</CardDescription>
          </CardHeader>
          <CardContent className="space-y-ds-4">
            <div className="space-y-ds-2">
              <Label>Format</Label>
              <Select value={contactsFormat} onValueChange={(v) => setContactsFormat(v as 'csv' | 'xlsx')}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="xlsx">XLSX</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleExportContacts} disabled={exportingContacts} className="w-full gap-ds-2">
              {exportingContacts ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              Export Contacts
            </Button>
          </CardContent>
        </Card>

        {/* Leads Export */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-ds-2">
              <Target className="size-5" />
              Export Leads
            </CardTitle>
            <CardDescription>Download all leads as a spreadsheet</CardDescription>
          </CardHeader>
          <CardContent className="space-y-ds-4">
            <div className="space-y-ds-2">
              <Label>Format</Label>
              <Select value={leadsFormat} onValueChange={(v) => setLeadsFormat(v as 'csv' | 'xlsx')}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="xlsx">XLSX</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleExportLeads} disabled={exportingLeads} className="w-full gap-ds-2">
              {exportingLeads ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              Export Leads
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Full Export */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-ds-2">
            <Database className="size-5" />
            Full Data Export (GDPR)
          </CardTitle>
          <CardDescription>Export all your CRM data as a comprehensive ZIP package</CardDescription>
        </CardHeader>
        <CardContent className="space-y-ds-4">
          <div className="grid grid-cols-2 gap-ds-4 sm:grid-cols-3">
            {[
              { key: 'includeContacts', label: 'Contacts' },
              { key: 'includeLeads', label: 'Leads' },
              { key: 'includeInvoices', label: 'Invoices' },
              { key: 'includeTasks', label: 'Tasks' },
              { key: 'includeSuppliers', label: 'Suppliers' },
              { key: 'includeTravellers', label: 'Travellers' },
              { key: 'includePayments', label: 'Payments' },
              { key: 'includeDocuments', label: 'Documents' },
              { key: 'includeMessages', label: 'Messages' },
            ].map(opt => (
              <div key={opt.key} className="flex items-center gap-ds-3">
                <Switch
                  checked={(fullOptions as Record<string, boolean>)[opt.key]}
                  onCheckedChange={v => setFullOptions(p => ({ ...p, [opt.key]: v }))}
                />
                <Label>{opt.label}</Label>
              </div>
            ))}
          </div>
          <Button onClick={handleExportFull} disabled={exportingFull} className="gap-ds-2">
            {exportingFull ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            Start Full Export
          </Button>
        </CardContent>
      </Card>

      {/* Export Jobs Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Export Jobs</CardTitle>
              <CardDescription>Track and download the full-data export jobs you've started this session</CardDescription>
            </div>
            {jobs.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => jobs.forEach(j => handleRefreshJob(j.id))} className="gap-ds-2">
                <RefreshCw aria-hidden="true" />Refresh
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <EmptyState
              icon={<Database className="size-8" />}
              title="No export jobs yet"
              description="Start a full data export above to see its progress here."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map(job => {
                  const config = statusConfig[job.status] ?? statusConfig.pending!;
                  const StatusIcon = config.icon;
                  return (
                    <TableRow key={job.id}>
                      <TableCell className="text-sm capitalize">{(job.type ?? 'full').replace('_', ' ')}</TableCell>
                      <TableCell>
                        <Tag tone={config.tone} size="sm" className="gap-1">
                          <StatusIcon className={cn('size-3', job.status === 'processing' && 'animate-spin')} />
                          {config.label}
                        </Tag>
                      </TableCell>
                      <TableCell className="text-sm">{formatDate(job.createdAt)}</TableCell>
                      <TableCell className="text-sm">{formatDate(job.completedAt)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-ds-2">
                          {job.status === 'processing' && (
                            <Button variant="ghost" size="sm" onClick={() => handleRefreshJob(job.id)} className="gap-1">
                              <RefreshCw className="size-3" />Refresh
                            </Button>
                          )}
                          {job.status === 'completed' && (
                            <Button variant="outline" size="sm" className="gap-1" onClick={() => handleDownloadJob(job.id)}>
                              <Download className="size-3" />Download
                            </Button>
                          )}
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

export default function ExportSettingsPage() {
  return (
    <PageContainer>
      <ExportSettingsPageContent />
    </PageContainer>
  );
}
