'use client';

import * as React from 'react';
import Link from 'next/link';
import { Plus, Search, MoreHorizontal, Download, Send, Eye, Edit2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { vouchersApi, type Voucher } from '@/lib/api/vouchers';

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    issued: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    used: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    expired: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return <Badge className={cn('border-transparent text-[11px]', styles[status] ?? 'bg-slate-100 text-slate-700')}>{label}</Badge>;
}

function TypeBadge({ type }: { type?: string }) {
  const colors: Record<string, string> = {
    hotel: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    transport: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    flight: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
    activity: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  };
  const displayType = type ?? 'other';
  const label = displayType.charAt(0).toUpperCase() + displayType.slice(1);
  return <Badge variant="outline" className={cn('border-transparent text-[11px]', colors[displayType] ?? 'bg-slate-100 text-slate-700')}>{label}</Badge>;
}

export default function VouchersPage() {
  const [search, setSearch] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [page, setPage] = React.useState(1);

  const { data: response, loading, error, refetch } = useApiQuery(
    () => vouchersApi.list({
      page,
      limit: 50,
      search: search || undefined,
      status: statusFilter !== 'all' ? statusFilter : undefined,
    }),
    [page, search, statusFilter],
  );

  const vouchers = React.useMemo(() => {
    if (!response || !('data' in response)) return [];
    const data = response.data;
    return Array.isArray(data) ? data : (data?.data ?? []);
  }, [response]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Vouchers</h1>
          <p className="text-sm text-muted-foreground">{vouchers.length} vouchers</p>
        </div>
        <Link href="/vouchers/new">
          <Button><Plus className="h-4 w-4 mr-1.5" /> New Voucher</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-6 py-3 border-b">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by number or guest..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 h-9"><SelectValue placeholder="All status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="issued">Issued</SelectItem>
            <SelectItem value="used">Used</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="px-6 py-3 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
          <p className="text-sm text-amber-800 dark:text-amber-200">Using sample data — connect to backend for real data</p>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Voucher #</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Guest / Lead</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {vouchers.map((voucher: any) => (
                <TableRow key={voucher.id}>
                  <TableCell className="font-medium text-sm">{voucher.voucherNumber}</TableCell>
                  <TableCell><TypeBadge type={voucher.type} /></TableCell>
                  <TableCell className="text-sm">{voucher.leadId ?? voucher.contactId ?? 'N/A'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(voucher.issueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </TableCell>
                  <TableCell className="font-medium text-sm">
                    ₹{(voucher.items?.reduce((sum: number, item: any) => sum + ((item.amount ?? 0)), 0) ?? 0).toLocaleString('en-IN')}
                  </TableCell>
                  <TableCell><StatusBadge status={voucher.status ?? 'draft'} /></TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/vouchers/${voucher.id}`}><Eye className="h-3.5 w-3.5 mr-2" />View</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem><Download className="h-3.5 w-3.5 mr-2" />Download PDF</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
