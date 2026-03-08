'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  Download,
  FileSpreadsheet,
  Users,
  Target,
  Database,
  CheckCircle2,
  Clock,
  XCircle,
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
import { exportsApi, type ExportJob } from '@/lib/api/exports';
import { cn } from '@/lib/utils';

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

export default function ExportSettingsPage() {
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
  });
  const [exportJobs, setExportJobs] = React.useState<ExportJob[]>([]);

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportContacts = async () => {
    setExportingContacts(true);
    try {
      const blob = await exportsApi.contacts({ format: contactsFormat });
      downloadBlob(blob, `contacts-export.${contactsFormat}`);
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
      const blob = await exportsApi.leads({ format: leadsFormat });
      downloadBlob(blob, `leads-export.${leadsFormat}`);
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
      const job = (result as any)?.data ?? result;
      if (job?.id) {
        setExportJobs((prev) => [job, ...prev]);
        toast.success('Full export started. You can download it when ready.');
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
      const blob = await exportsApi.downloadJob(jobId);
      downloadBlob(blob, `export-${jobId}.zip`);
      toast.success('Export downloaded');
    } catch {
      toast.error('Failed to download export');
    }
  };

  const handleCheckStatus = async (jobId: string) => {
    try {
      const result = await exportsApi.getJobStatus(jobId);
      const job = (result as any)?.data ?? result;
      setExportJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, ...job } : j)));
    } catch {
      toast.error('Failed to check status');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/settings')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Data Export</h1>
          <p className="text-muted-foreground mt-1">Export your CRM data in various formats</p>
        </div>
      </div>

      {/* Quick Exports */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Contacts Export */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Export Contacts
            </CardTitle>
            <CardDescription>Download all contacts as a spreadsheet</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Format</Label>
              <Select value={contactsFormat} onValueChange={(v) => setContactsFormat(v as any)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="xlsx">XLSX</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleExportContacts} disabled={exportingContacts} className="w-full gap-2">
              {exportingContacts ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Export Contacts
            </Button>
          </CardContent>
        </Card>

        {/* Leads Export */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Export Leads
            </CardTitle>
            <CardDescription>Download all leads as a spreadsheet</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Format</Label>
              <Select value={leadsFormat} onValueChange={(v) => setLeadsFormat(v as any)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="xlsx">XLSX</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleExportLeads} disabled={exportingLeads} className="w-full gap-2">
              {exportingLeads ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Export Leads
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Full Export */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Full Data Export
          </CardTitle>
          <CardDescription>Export all your CRM data as a comprehensive package</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {[
              { key: 'includeContacts', label: 'Contacts' },
              { key: 'includeLeads', label: 'Leads' },
              { key: 'includeInvoices', label: 'Invoices' },
              { key: 'includeTasks', label: 'Tasks' },
            ].map((opt) => (
              <div key={opt.key} className="flex items-center gap-3">
                <Switch
                  checked={(fullOptions as any)[opt.key]}
                  onCheckedChange={(v) => setFullOptions((p) => ({ ...p, [opt.key]: v }))}
                />
                <Label>{opt.label}</Label>
              </div>
            ))}
          </div>
          <Button onClick={handleExportFull} disabled={exportingFull} className="gap-2">
            {exportingFull ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Start Full Export
          </Button>
        </CardContent>
      </Card>

      {/* Export Jobs */}
      {exportJobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Export Jobs</CardTitle>
            <CardDescription>Track and download your export jobs</CardDescription>
          </CardHeader>
          <CardContent>
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
                {exportJobs.map((job) => {
                  const config = statusConfig[job.status] ?? statusConfig.pending;
                  const StatusIcon = config.icon;
                  return (
                    <TableRow key={job.id}>
                      <TableCell className="text-sm capitalize">{job.type}</TableCell>
                      <TableCell>
                        <Badge className={cn('gap-1', config.className)}>
                          <StatusIcon className={cn('h-3 w-3', job.status === 'processing' && 'animate-spin')} />
                          {config.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{formatDate(job.createdAt)}</TableCell>
                      <TableCell className="text-sm">{formatDate(job.completedAt)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {job.status === 'processing' && (
                            <Button variant="ghost" size="sm" onClick={() => handleCheckStatus(job.id)}>
                              Refresh
                            </Button>
                          )}
                          {job.status === 'completed' && (
                            <Button variant="outline" size="sm" className="gap-1" onClick={() => handleDownloadJob(job.id)}>
                              <Download className="h-3 w-3" />
                              Download
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
