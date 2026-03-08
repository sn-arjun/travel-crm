'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus, Send, MoreHorizontal, Mail, MessageSquare, Share2, Bell,
  BarChart3, Eye, Play, Pause, Trash2, Pencil, Loader2,
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { FilterBar } from '@/components/domain/filter-bar';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { useApiMutation } from '@/hooks/use-api';
import { campaignsApi } from '@/lib/api/campaigns';

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
    scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    running: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    sending: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    paused: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    completed: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    sent: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  };
  return (
    <Badge variant="outline" className={cn('border-transparent text-xs capitalize', styles[status] ?? '')}>
      {status}
    </Badge>
  );
}

function typeIcon(type: string) {
  switch (type) {
    case 'email': return <Mail className="h-3.5 w-3.5" />;
    case 'sms': return <MessageSquare className="h-3.5 w-3.5" />;
    case 'social': return <Share2 className="h-3.5 w-3.5" />;
    case 'push': return <Bell className="h-3.5 w-3.5" />;
    default: return <Send className="h-3.5 w-3.5" />;
  }
}

export default function MarketingCampaignsPage() {
  const router = useRouter();
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [drawerCampaign, setDrawerCampaign] = React.useState<any | null>(null);

  const fetcher = React.useCallback(
    (page: number, limit: number) =>
      campaignsApi.list({
        page,
        limit,
        search: search || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        type: typeFilter !== 'all' ? typeFilter : undefined,
      }),
    [search, statusFilter, typeFilter],
  );

  const { items: campaigns, loading, loadingMore, total, error, sentinelRef, refetch } = useInfiniteScroll<any>({
    fetcher,
    limit: 25,
  });

  const { mutate: sendCampaign } = useApiMutation((id: string) => campaignsApi.send(id));
  const { mutate: deleteCampaign } = useApiMutation((id: string) => campaignsApi.delete(id));

  // Stats derived from loaded data
  const activeCampaigns = campaigns.filter((c) => c.status === 'running' || c.status === 'sending').length;
  const totalSent = campaigns.reduce((sum, c) => sum + (c.sentCount ?? c.sent ?? 0), 0);
  const avgOpenRate = campaigns.length > 0
    ? (campaigns.reduce((sum, c) => sum + (c.openRate ?? 0), 0) / campaigns.length).toFixed(1)
    : '0';

  async function handleSend(id: string) {
    const result = await sendCampaign(id);
    if (result) {
      toast.success('Campaign sent');
      refetch();
    } else {
      toast.error('Failed to send campaign');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this campaign?')) return;
    const result = await deleteCampaign(id);
    if (result) {
      toast.success('Campaign deleted');
      refetch();
      if (drawerCampaign?.id === id) setDrawerCampaign(null);
    } else {
      toast.error('Failed to delete campaign');
    }
  }

  const activeFilters = [
    ...(statusFilter !== 'all' ? [{ id: 'status', label: 'Status', value: statusFilter }] : []),
    ...(typeFilter !== 'all' ? [{ id: 'type', label: 'Type', value: typeFilter }] : []),
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Marketing Campaigns
          </h1>
          <p className="text-sm text-muted-foreground">
            {loading ? '...' : `${total} campaigns`}
          </p>
        </div>
        <Button asChild>
          <Link href="/campaigns/new">
            <Plus className="h-4 w-4 mr-1.5" /> New Campaign
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 px-6 py-4 border-b">
        {loading ? (
          <>
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </>
        ) : (
          <>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Play className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-lg font-bold">{activeCampaigns}</p>
                  <p className="text-xs text-muted-foreground">Active Campaigns</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Send className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-lg font-bold">{totalSent.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Total Sent</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                  <Eye className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-lg font-bold">{avgOpenRate}%</p>
                  <p className="text-xs text-muted-foreground">Avg Open Rate</p>
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
          searchPlaceholder="Search campaigns..."
          activeFilters={activeFilters}
          onRemoveFilter={(id) => {
            if (id === 'status') setStatusFilter('all');
            if (id === 'type') setTypeFilter('all');
          }}
          onClearFilters={() => { setStatusFilter('all'); setTypeFilter('all'); }}
          actions={
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32 h-9">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="running">Running</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-28 h-9">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                </SelectContent>
              </Select>
            </div>
          }
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
            <p className="text-sm">Failed to load campaigns</p>
            <Button variant="outline" size="sm" onClick={refetch}>Retry</Button>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
            <Send className="h-10 w-10 opacity-50" />
            <p className="text-sm">No campaigns found</p>
            <Button asChild variant="outline" size="sm">
              <Link href="/campaigns/new">Create your first campaign</Link>
            </Button>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead>Opened</TableHead>
                  <TableHead>Clicked</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((campaign: any) => (
                  <TableRow
                    key={campaign.id}
                    className="hover:bg-muted/50 cursor-pointer group"
                    onClick={() => setDrawerCampaign(campaign)}
                  >
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">{campaign.name}</p>
                        {campaign.subject && (
                          <p className="text-xs text-muted-foreground truncate max-w-xs">{campaign.subject}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {typeIcon(campaign.type ?? 'email')}
                        <span className="text-xs capitalize">{campaign.type ?? 'email'}</span>
                      </div>
                    </TableCell>
                    <TableCell>{statusBadge(campaign.status ?? 'draft')}</TableCell>
                    <TableCell className="text-sm">{(campaign.sentCount ?? campaign.sent ?? 0).toLocaleString()}</TableCell>
                    <TableCell className="text-sm">
                      {campaign.openRate != null ? `${campaign.openRate}%` : '-'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {campaign.clickRate != null ? `${campaign.clickRate}%` : '-'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {campaign.createdAt
                        ? new Date(campaign.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                        : '-'}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setDrawerCampaign(campaign)}
                          title="View"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => router.push(`/campaigns/${campaign.id}`)}
                          title="Analytics"
                        >
                          <BarChart3 className="h-3.5 w-3.5" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/campaigns/${campaign.id}`}>
                                <BarChart3 className="h-3.5 w-3.5 mr-2" /> View Analytics
                              </Link>
                            </DropdownMenuItem>
                            {campaign.status === 'draft' && (
                              <DropdownMenuItem onClick={() => handleSend(campaign.id)}>
                                <Send className="h-3.5 w-3.5 mr-2" /> Send Now
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleDelete(campaign.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
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

      {/* Detail Drawer */}
      <Sheet open={!!drawerCampaign} onOpenChange={(open) => { if (!open) setDrawerCampaign(null); }}>
        <SheetContent className="w-[420px] sm:w-[480px] overflow-y-auto">
          {drawerCampaign && (
            <>
              <SheetHeader>
                <SheetTitle>{drawerCampaign.name}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                <div className="flex items-center gap-2">
                  {statusBadge(drawerCampaign.status ?? 'draft')}
                  <span className="text-sm capitalize text-muted-foreground flex items-center gap-1">
                    {typeIcon(drawerCampaign.type ?? 'email')}
                    {drawerCampaign.type ?? 'email'}
                  </span>
                </div>
                {drawerCampaign.subject && (
                  <div>
                    <p className="text-xs text-muted-foreground font-medium mb-1">Subject</p>
                    <p className="text-sm">{drawerCampaign.subject}</p>
                  </div>
                )}
                <Separator />
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border p-3">
                    <p className="text-lg font-bold">{(drawerCampaign.sentCount ?? drawerCampaign.sent ?? 0).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Sent</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-lg font-bold">{drawerCampaign.openRate != null ? `${drawerCampaign.openRate}%` : '-'}</p>
                    <p className="text-xs text-muted-foreground">Open Rate</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-lg font-bold">{drawerCampaign.clickRate != null ? `${drawerCampaign.clickRate}%` : '-'}</p>
                    <p className="text-xs text-muted-foreground">Click Rate</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-lg font-bold">{(drawerCampaign.failedCount ?? 0).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Failed</p>
                  </div>
                </div>
                <Separator />
                <div className="flex flex-col gap-2">
                  <Button asChild variant="outline" className="w-full">
                    <Link href={`/campaigns/${drawerCampaign.id}`}>
                      <BarChart3 className="h-4 w-4 mr-2" /> View Full Analytics
                    </Link>
                  </Button>
                  {drawerCampaign.status === 'draft' && (
                    <Button
                      variant="default"
                      className="w-full"
                      onClick={() => { handleSend(drawerCampaign.id); setDrawerCampaign(null); }}
                    >
                      <Send className="h-4 w-4 mr-2" /> Send Now
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={() => handleDelete(drawerCampaign.id)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" /> Delete Campaign
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
