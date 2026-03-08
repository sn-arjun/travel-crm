'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search, Building2, MoreHorizontal, Phone, Mail, Loader, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useApiQuery } from '@/hooks/use-api';
import { suppliersApi } from '@/lib/api/suppliers';
import type { Supplier } from '@travelcrm/shared';

function getInitials(name: string) { return name.split(' ').map((n: any) => n[0]).join('').toUpperCase().slice(0, 2); }

export default function AccountsPage() {
  const router = useRouter();
  const [search, setSearch] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState('all');

  const { data: response, loading, error } = useApiQuery<any>(
    () => suppliersApi.list({ search: search || undefined, category: typeFilter !== 'all' ? typeFilter : undefined }),
    [search, typeFilter],
  );

  const responseData = response?.data;
  const suppliers = (Array.isArray(responseData) ? responseData : (responseData?.data ?? [])) as Supplier[];

  const filtered = React.useMemo(() => {
    if (!suppliers || !Array.isArray(suppliers)) return [];
    let result = [...suppliers];
    if (search) { const q = search.toLowerCase(); result = result.filter((s: any) => (s.companyName || s.name || '').toLowerCase().includes(q) || (s.contactPerson || '').toLowerCase().includes(q)); }
    return result;
  }, [suppliers, search]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="h-12 w-12 text-red-500" />
        <p className="text-muted-foreground">Failed to load suppliers</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div><h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Accounts & Suppliers</h1><p className="text-sm text-muted-foreground">{filtered.length} accounts</p></div>
        <Link href="/suppliers/new"><Button><Plus className="h-4 w-4 mr-1.5" /> Add Supplier</Button></Link>
      </div>

      <div className="flex items-center gap-3 px-6 py-3 border-b">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search suppliers..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40 h-9"><SelectValue placeholder="All types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="hotel">Hotel</SelectItem>
            <SelectItem value="transport">Transport</SelectItem>
            <SelectItem value="airline">Airline</SelectItem>
            <SelectItem value="activity_provider">Activity Provider</SelectItem>
            <SelectItem value="guide">Guide</SelectItem>
            <SelectItem value="visa_agent">Visa Agent</SelectItem>
            <SelectItem value="insurance">Insurance</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p>No suppliers found</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Contact Person</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((sup: any) => (
                <TableRow key={sup.id} className="cursor-pointer" onClick={() => router.push(`/suppliers/${sup.id}`)}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8"><AvatarFallback className="text-xs">{getInitials((sup as any).companyName || sup.name || '')}</AvatarFallback></Avatar>
                      <span className="font-medium text-sm">{(sup as any).companyName || sup.name || ''}</span>
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="outline" className="text-xs capitalize">{(sup.category || sup.type || '').replace('_', ' ')}</Badge></TableCell>
                  <TableCell className="text-sm">{sup.contactPerson ?? ''}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{sup.email ?? ''}</TableCell>
                  <TableCell className="text-sm">{sup.phone ?? ''}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={sup.isActive ? 'bg-green-100 text-green-700 border-transparent dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 border-transparent dark:bg-red-900/30 dark:text-red-400'}>
                      {sup.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => router.push(`/suppliers/${sup.id}`)}>View details</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => router.push(`/suppliers/${sup.id}/edit`)}>Edit</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">Deactivate</DropdownMenuItem>
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
