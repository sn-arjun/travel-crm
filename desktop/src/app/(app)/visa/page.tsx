'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Plus, Search, Filter, Download, Eye, EyeOff, CheckCircle2, Clock, FileText, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useApiQuery } from '@/hooks/use-api';
import { visaApi, type VisaRecord } from '@/lib/api/visa';

function MaskedPassportNumber({ number, className }: { number?: string; className?: string }) {
  const [revealed, setRevealed] = React.useState(false);
  const displayNumber = number ?? 'N/A';

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="font-mono text-sm">{revealed ? displayNumber : `${displayNumber.slice(0, 1)}${'*'.repeat(8)}${displayNumber.slice(-1)}`}</span>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setRevealed(!revealed)}
        title={revealed ? 'Hide' : 'Reveal'}
      >
        {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    applied: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    processing: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    collected: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  };

  const labels: Record<string, string> = {
    applied: 'Applied',
    processing: 'Processing',
    approved: 'Approved',
    rejected: 'Rejected',
    collected: 'Collected',
  };

  return (
    <Badge variant="outline" className={cn('border-transparent text-xs font-medium', colorMap[status])}>
      {labels[status]}
    </Badge>
  );
}

export default function VisaTrackingPage() {
  const [selectedStatus, setSelectedStatus] = React.useState<string>('all');
  const [selectedDestination, setSelectedDestination] = React.useState<string>('all');
  const [searchQuery, setSearchQuery] = React.useState('');

  const { data: response, loading, error } = useApiQuery(
    () => visaApi.list({
      search: searchQuery || undefined,
      status: selectedStatus !== 'all' ? selectedStatus : undefined,
      countryName: selectedDestination !== 'all' ? selectedDestination : undefined,
      limit: 100,
    }),
    [searchQuery, selectedStatus, selectedDestination],
  );

  const visaApplications = React.useMemo(() => {
    if (!response || !('data' in response)) return [];
    const data = response.data;
    if (!data) return [];
    if ('data' in data) return data.data ?? [];
    return Array.isArray(data) ? data : [];
  }, [response]);

  // Calculate stats
  const applicationsInProgress = visaApplications.filter((v: any) => v.status === 'processing' || v.status === 'applied').length;
  const approvedThisMonth = visaApplications.filter((v: any) => {
    if (v.status !== 'approved') return false;
    const appDate = new Date(v.applicationDate ?? new Date());
    const thisMonth = new Date();
    return appDate.getMonth() === thisMonth.getMonth() && appDate.getFullYear() === thisMonth.getFullYear();
  }).length;
  const pendingCollection = visaApplications.filter((v: any) => v.status === 'approved' && new Date(v.applicationDate ?? new Date()).getTime() < Date.now() - 7 * 24 * 60 * 60 * 1000).length;

  // Get unique destinations
  const destinations = Array.from(new Set(visaApplications.map((v: any) => v.countryName ?? '').filter(Boolean))).sort();

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Visa Tracking</h1>
          <p className="text-sm text-muted-foreground">Monitor visa applications and document status</p>
        </div>
        <Link href="/visa/new">
          <Button className="gap-1.5">
            <Plus className="h-4 w-4" />
            New Application
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="px-6 py-4 border-b space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Applications In Progress</p>
                  <p className="text-2xl font-bold">{applicationsInProgress}</p>
                </div>
                <Clock className="h-5 w-5 text-amber-600 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Approved This Month</p>
                  <p className="text-2xl font-bold">{approvedThisMonth}</p>
                </div>
                <CheckCircle2 className="h-5 w-5 text-green-600 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Pending Collection</p>
                  <p className="text-2xl font-bold">{pendingCollection}</p>
                </div>
                <FileText className="h-5 w-5 text-blue-600 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {error && (
        <div className="px-6 py-3 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
          <p className="text-sm text-amber-800 dark:text-amber-200">Error loading visa applications</p>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 px-6 py-4 border-b bg-muted/30">
        <Input
          placeholder="Search by traveller name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-xs"
        />
        <Select value={selectedStatus} onValueChange={setSelectedStatus}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="applied">Applied</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Select value={selectedDestination} onValueChange={setSelectedDestination}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Filter by destination" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Destinations</SelectItem>
            {destinations.map((dest: any) => (
              <SelectItem key={dest} value={dest}>
                {dest}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="ml-auto gap-1.5">
          <Download className="h-4 w-4" />
          Export
        </Button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && (
          <div className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-3 font-semibold text-xs text-muted-foreground">Traveller Name</th>
                    <th className="text-left py-3 px-3 font-semibold text-xs text-muted-foreground">Destination</th>
                    <th className="text-left py-3 px-3 font-semibold text-xs text-muted-foreground">Visa Type</th>
                    <th className="text-left py-3 px-3 font-semibold text-xs text-muted-foreground">Application Date</th>
                    <th className="text-center py-3 px-3 font-semibold text-xs text-muted-foreground">Status</th>
                    <th className="text-left py-3 px-3 font-semibold text-xs text-muted-foreground">Passport Number</th>
                    <th className="text-left py-3 px-3 font-semibold text-xs text-muted-foreground">Expiry Date</th>
                  </tr>
                </thead>
                <tbody>
                  {visaApplications.map((visa: any) => {
                    const expiryDate = new Date(visa.expiryDate ?? new Date());
                    const daysUntilExpiry = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                    const isExpiringSoon = daysUntilExpiry < 30 && daysUntilExpiry > 0;

                    return (
                      <tr key={visa.id} className="border-b hover:bg-muted/50 transition-colors">
                        <td className="py-4 px-3 font-medium">{visa.travellerName}</td>
                        <td className="py-4 px-3 text-muted-foreground">{visa.countryName}</td>
                        <td className="py-4 px-3 text-muted-foreground">{visa.visaType ?? 'N/A'}</td>
                        <td className="py-4 px-3 text-muted-foreground">
                          {visa.applicationDate ? new Date(visa.applicationDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}
                        </td>
                        <td className="py-4 px-3 text-center">
                          <StatusBadge status={visa.status} />
                        </td>
                        <td className="py-4 px-3">
                          <MaskedPassportNumber number={visa.passportNumber} />
                        </td>
                        <td className={cn('py-4 px-3 font-medium', isExpiringSoon && daysUntilExpiry > 0 ? 'text-amber-600' : '')}>
                          {visa.expiryDate ? new Date(visa.expiryDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}
                          {isExpiringSoon && <span className="ml-2 text-[11px] bg-amber-100 text-amber-700 px-2 py-1 rounded dark:bg-amber-900/30 dark:text-amber-400">Expires soon</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {visaApplications.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">No visa applications found</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
