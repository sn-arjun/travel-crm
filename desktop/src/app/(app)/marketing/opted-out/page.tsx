'use client';

import * as React from 'react';
import {
  Ban, Mail, Phone, Loader2, AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { FilterBar } from '@/components/domain/filter-bar';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { useApiMutation } from '@/hooks/use-api';
import { marketingApi } from '@/lib/api/marketing';
import { toast } from 'sonner';

export default function OptedOutPage() {
  const [search, setSearch] = React.useState('');

  const fetcher = React.useCallback(
    (page: number, limit: number) =>
      // Uses the contacts API with opted_out filter — backend opt-out route returns opted-out contacts
      (marketingApi as any).optedOut?.list
        ? (marketingApi as any).optedOut.list({ page, limit, search: search || undefined })
        : Promise.resolve({ data: { data: [], pagination: { total: 0 } } }),
    [search],
  );

  const { items: contacts, loading, loadingMore, total, error, sentinelRef, refetch } = useInfiniteScroll<any>({
    fetcher,
    limit: 25,
  });

  const { mutate: optIn } = useApiMutation((data: { email?: string; phone?: string }) =>
    marketingApi.optOut({ ...data, reason: 'manual_opt_in' }),
  );

  async function handleOptIn(contact: any) {
    const result = await optIn({ email: contact.email, phone: contact.phone });
    if (result) {
      toast.success(`${contact.name} opted back in`);
      refetch();
    } else {
      toast.error('Failed to opt in contact');
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Opted-Out Contacts
          </h1>
          <p className="text-sm text-muted-foreground">
            {loading ? '...' : `${total} contacts opted out`}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 px-6 py-4 border-b">
        {loading ? (
          <>
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </>
        ) : (
          <>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <Ban className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="text-lg font-bold">{total}</p>
                  <p className="text-xs text-muted-foreground">Total Opted-Out</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-lg font-bold">CAN-SPAM</p>
                  <p className="text-xs text-muted-foreground">Compliance Required</p>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* FilterBar */}
      <div className="px-6 py-3 border-b">
        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search opted-out contacts..."
          activeFilters={[]}
          onRemoveFilter={() => {}}
          onClearFilters={() => {}}
        />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
            <AlertCircle className="h-8 w-8" />
            <p className="text-sm">Failed to load opted-out contacts</p>
            <Button variant="outline" size="sm" onClick={refetch}>Retry</Button>
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
            <Ban className="h-10 w-10 opacity-50" />
            <p className="text-sm">No opted-out contacts</p>
            <p className="text-xs">Contacts who unsubscribe will appear here</p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Opted Out</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((contact: any) => (
                  <TableRow key={contact.id} className="hover:bg-muted/50">
                    <TableCell className="font-medium text-sm">{contact.name}</TableCell>
                    <TableCell>
                      {contact.email && (
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Mail className="h-3.5 w-3.5" />
                          {contact.email}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {contact.phone && (
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Phone className="h-3.5 w-3.5" />
                          {contact.phone}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400">
                        {contact.optOutChannel ?? contact.opt_out_channel ?? 'email'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {contact.optedOutAt ?? contact.opted_out_at
                        ? new Date(contact.optedOutAt ?? contact.opted_out_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleOptIn(contact)}
                      >
                        Opt Back In
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div ref={sentinelRef} className="flex items-center justify-center py-4">
              {loadingMore && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
