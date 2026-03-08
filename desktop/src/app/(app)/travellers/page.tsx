'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search, Loader2, User, MoreHorizontal, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useApiQuery } from '@/hooks/use-api';
import { travellersApi, type Traveller } from '@/lib/api/visa';
import { cn } from '@/lib/utils';

function getInitials(first: string, last: string) {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
}

export default function TravellersPage() {
  const router = useRouter();
  const [search, setSearch] = React.useState('');
  const [nationalityFilter, setNationalityFilter] = React.useState('all');
  const [page, setPage] = React.useState(1);

  const { data: response, loading, error } = useApiQuery(
    () => travellersApi.list({ page, limit: 50, search: search || undefined }),
    [page, search],
  );

  const travellers: Traveller[] = React.useMemo(() => {
    if (!response || !('data' in response)) return [];
    const data = response.data;
    return Array.isArray(data) ? data : (data as any)?.data ?? [];
  }, [response]);

  const filtered = React.useMemo(() => {
    if (nationalityFilter === 'all') return travellers;
    return travellers.filter((t) => t.nationality === nationalityFilter);
  }, [travellers, nationalityFilter]);

  const nationalities = React.useMemo(() => {
    const set = new Set(travellers.map((t) => t.nationality).filter(Boolean));
    return Array.from(set).sort();
  }, [travellers]);

  function isPassportExpiringSoon(expiry?: string) {
    if (!expiry) return false;
    const diff = new Date(expiry).getTime() - Date.now();
    return diff > 0 && diff < 180 * 24 * 60 * 60 * 1000; // 6 months
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Travellers</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} travellers</p>
        </div>
        <Button asChild>
          <Link href="/travellers/new"><Plus className="h-4 w-4 mr-1.5" /> Add Traveller</Link>
        </Button>
      </div>

      <div className="flex items-center gap-3 px-6 py-3 border-b">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search travellers..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={nationalityFilter} onValueChange={setNationalityFilter}>
          <SelectTrigger className="w-40 h-9"><SelectValue placeholder="All nationalities" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Nationalities</SelectItem>
            {nationalities.map((n) => (
              <SelectItem key={n} value={n!}>{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="px-6 py-3 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
          <p className="text-sm text-amber-800 dark:text-amber-200">Using sample data -- connect to backend for real data</p>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Passport Number</TableHead>
                <TableHead>Nationality</TableHead>
                <TableHead>Date of Birth</TableHead>
                <TableHead>Passport Expiry</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => (
                <TableRow key={t.id} className="cursor-pointer hover:bg-muted/50" onClick={() => router.push(`/travellers/${t.id}`)}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">{getInitials(t.firstName, t.lastName)}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-sm">{t.firstName} {t.lastName}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{t.passportNumber}</TableCell>
                  <TableCell className="text-sm">{t.nationality ?? 'N/A'}</TableCell>
                  <TableCell className="text-sm">
                    {t.dateOfBirth ? new Date(t.dateOfBirth).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {t.customFields?.passportExpiry ? (
                      <span className={cn(isPassportExpiringSoon(t.customFields.passportExpiry as string) && 'text-amber-600 font-semibold')}>
                        {new Date(t.customFields.passportExpiry as string).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {isPassportExpiringSoon(t.customFields.passportExpiry as string) && (
                          <AlertCircle className="h-3 w-3 inline ml-1" />
                        )}
                      </span>
                    ) : 'N/A'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{t.email || t.phone || 'N/A'}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" onClick={(e) => e.stopPropagation()}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => router.push(`/travellers/${t.id}`)}>View details</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    <User className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No travellers found</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
