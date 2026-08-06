'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Ban, Mail, Phone, Loader2, AlertCircle, UserCheck,
  RefreshCw, MessageSquare, Smartphone,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { FilterBar } from '@/components/domain/filter-bar';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { useApiMutation } from '@/hooks/use-api';
import { marketingApi, type OptedOutContact } from '@/lib/api/marketing';
import { toast } from 'sonner';

function channelIcon(channel?: string) {
  switch (channel) {
    case 'email':
      return <Mail className="h-3.5 w-3.5" />;
    case 'sms':
      return <MessageSquare className="h-3.5 w-3.5" />;
    case 'whatsapp':
      return <Smartphone className="h-3.5 w-3.5" />;
    default:
      return <Ban className="h-3.5 w-3.5" />;
  }
}

function channelColor(channel?: string) {
  switch (channel) {
    case 'email':
      return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800';
    case 'sms':
      return 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800';
    case 'whatsapp':
      return 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800';
    default:
      return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800';
  }
}

export default function OptedOutPage() {
  const [search, setSearch] = React.useState('');
  const [channelFilter, setChannelFilter] = React.useState('all');
  const [resubscribeContact, setResubscribeContact] = React.useState<OptedOutContact | null>(null);

  const fetcher = React.useCallback(
    (page: number, limit: number) =>
      marketingApi.optedOut.list({
        page,
        limit,
        search: search || undefined,
        channel: channelFilter !== 'all' ? channelFilter : undefined,
      }),
    [search, channelFilter],
  );

  const { items: contacts, loading, loadingMore, total, error, sentinelRef, refetch } =
    useInfiniteScroll<OptedOutContact>({
      fetcher,
      limit: 25,
    });

  const { mutate: resubscribe, loading: resubscribing } = useApiMutation(
    (contactId: string) => marketingApi.optedOut.resubscribe(contactId),
  );

  async function handleResubscribe() {
    if (!resubscribeContact) return;
    const result = await resubscribe(resubscribeContact.id);
    if (result !== null) {
      toast.success(`${resubscribeContact.name || 'Contact'} has been re-subscribed`);
      refetch();
    } else {
      toast.error('Failed to re-subscribe contact');
    }
    setResubscribeContact(null);
  }

  // Derive channel breakdown from loaded items
  const channelCounts = React.useMemo(() => {
    const counts: Record<string, number> = { email: 0, sms: 0, whatsapp: 0, manual: 0 };
    contacts.forEach((c) => {
      const ch = c.optOutChannel || 'manual';
      if (ch in counts) counts[ch] = (counts[ch] ?? 0) + 1;
      else counts['manual'] = (counts['manual'] ?? 0) + 1;
    });
    return counts;
  }, [contacts]);

  const activeFilters = [
    ...(channelFilter !== 'all' ? [{ id: 'channel', label: 'Channel', value: channelFilter }] : []),
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/marketing">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1
              className="text-xl font-bold tracking-tight"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Opted-Out Contacts
            </h1>
            <p className="text-sm text-muted-foreground">
              {loading
                ? '...'
                : `${total} contact${total !== 1 ? 's' : ''} opted out of marketing communications`}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={refetch} disabled={loading}>
          <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-6 py-4 border-b">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)
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
                <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Mail className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-lg font-bold">{channelCounts.email}</p>
                  <p className="text-xs text-muted-foreground">Via Email</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Smartphone className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-lg font-bold">{(channelCounts['whatsapp'] ?? 0) + (channelCounts['sms'] ?? 0)}</p>
                  <p className="text-xs text-muted-foreground">Via SMS/WhatsApp</p>
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
      <div className="flex items-center gap-3 px-6 py-3 border-b flex-wrap">
        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by name, email, or phone..."
          activeFilters={activeFilters}
          onRemoveFilter={(id) => {
            if (id === 'channel') setChannelFilter('all');
          }}
          onClearFilters={() => setChannelFilter('all')}
          actions={
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="w-36 h-9">
                <SelectValue placeholder="Channel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Channels</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
          }
        />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
            <AlertCircle className="h-8 w-8" />
            <p className="text-sm">Failed to load opted-out contacts</p>
            <Button variant="outline" size="sm" onClick={refetch}>
              Retry
            </Button>
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
            <Ban className="h-10 w-10 opacity-50" />
            <p className="text-sm font-medium">No opted-out contacts</p>
            <p className="text-xs max-w-xs text-center">
              Contacts who unsubscribe from your marketing communications will appear here.
            </p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Opted Out Date</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((contact) => (
                  <TableRow key={contact.id} className="hover:bg-muted/50 group">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                          <Ban className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                        </div>
                        <span className="text-sm font-medium">
                          {contact.name || 'Unknown'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {contact.email ? (
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Mail className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate max-w-[200px]">{contact.email}</span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {contact.phone ? (
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Phone className="h-3.5 w-3.5 shrink-0" />
                          {contact.phone}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {contact.optedOutAt
                        ? new Date(contact.optedOutAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-xs capitalize gap-1 ${channelColor(contact.optOutChannel)}`}
                      >
                        {channelIcon(contact.optOutChannel)}
                        {contact.optOutChannel || 'manual'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <p className="text-xs text-muted-foreground max-w-[180px] truncate">
                        {contact.optOutReason || '-'}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => setResubscribeContact(contact)}
                      >
                        <UserCheck className="h-3 w-3" />
                        Re-subscribe
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div ref={sentinelRef} className="flex items-center justify-center py-4">
              {loadingMore && (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              )}
            </div>
          </>
        )}
      </div>

      {/* Re-subscribe Confirmation Dialog */}
      <Dialog
        open={!!resubscribeContact}
        onOpenChange={() => setResubscribeContact(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Re-subscribe Contact</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to re-subscribe{' '}
            <span className="font-medium text-foreground">
              {resubscribeContact?.name || 'this contact'}
            </span>
            ? They will start receiving marketing communications again.
          </p>
          {resubscribeContact?.optOutReason && (
            <div className="rounded-lg border p-3 bg-muted/50">
              <p className="text-xs text-muted-foreground font-medium mb-1">
                Original opt-out reason
              </p>
              <p className="text-sm">{resubscribeContact.optOutReason}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setResubscribeContact(null)}>
              Cancel
            </Button>
            <Button onClick={handleResubscribe} disabled={resubscribing}>
              {resubscribing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  Re-subscribing...
                </>
              ) : (
                <>
                  <UserCheck className="h-4 w-4 mr-1.5" />
                  Re-subscribe
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
