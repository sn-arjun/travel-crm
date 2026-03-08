'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Plus, Search, Send, MoreHorizontal, Loader, AlertCircle,
  Mail, MessageSquare, Share2, Bell, BarChart3, Eye, Pause, Play,
  Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { campaignsApi, type CreateCampaignRequest } from '@/lib/api/campaigns';

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
    scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    running: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    paused: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    completed: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
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
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [showCreate, setShowCreate] = React.useState(false);

  // Create form state
  const [newName, setNewName] = React.useState('');
  const [newType, setNewType] = React.useState<'email' | 'sms' | 'social' | 'push'>('email');
  const [newSubject, setNewSubject] = React.useState('');
  const [newContent, setNewContent] = React.useState('');

  const { data: response, loading, error, refetch } = useApiQuery<any>(
    () => campaignsApi.list({
      limit: 100,
      search: search || undefined,
      status: statusFilter !== 'all' ? statusFilter : undefined,
      type: typeFilter !== 'all' ? typeFilter : undefined,
    }),
    [search, statusFilter, typeFilter],
  );

  const { mutate: createCampaign, loading: creating } = useApiMutation(
    (data: CreateCampaignRequest) => campaignsApi.create(data),
  );

  const { mutate: sendCampaign } = useApiMutation(
    (id: string) => campaignsApi.send(id),
  );

  const campaigns: any[] = React.useMemo(() => {
    const data = response?.data;
    return Array.isArray(data) ? data : (data?.data ?? []);
  }, [response]);

  // Stats
  const activeCampaigns = campaigns.filter((c) => c.status === 'running').length;
  const totalSent = campaigns.reduce((sum, c) => sum + (c.sentCount ?? c.sent ?? 0), 0);
  const avgOpenRate = campaigns.length > 0
    ? (campaigns.reduce((sum, c) => sum + (c.openRate ?? 0), 0) / campaigns.length).toFixed(1)
    : '0';

  async function handleCreate() {
    if (!newName.trim()) {
      toast.error('Campaign name is required');
      return;
    }
    if (!newContent.trim()) {
      toast.error('Campaign content is required');
      return;
    }

    const result = await createCampaign({
      name: newName.trim(),
      type: newType,
      subject: newSubject || undefined,
      content: newContent,
      status: 'draft',
    });

    if (result) {
      toast.success('Campaign created');
      setShowCreate(false);
      setNewName('');
      setNewSubject('');
      setNewContent('');
      refetch();
    } else {
      toast.error('Failed to create campaign');
    }
  }

  async function handleSend(id: string) {
    const result = await sendCampaign(id);
    if (result) {
      toast.success('Campaign sent');
      refetch();
    } else {
      toast.error('Failed to send campaign');
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Marketing Campaigns
          </h1>
          <p className="text-sm text-muted-foreground">{campaigns.length} campaigns</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> New Campaign
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 px-6 py-4 border-b">
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
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search campaigns..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
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
            <SelectItem value="social">Social</SelectItem>
            <SelectItem value="push">Push</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
            <AlertCircle className="h-8 w-8" />
            <p>Failed to load campaigns</p>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
            <Send className="h-10 w-10 opacity-50" />
            <p className="text-sm">No campaigns found</p>
            <Button variant="outline" size="sm" onClick={() => setShowCreate(true)}>
              Create your first campaign
            </Button>
          </div>
        ) : (
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
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((campaign: any) => (
                <TableRow key={campaign.id} className="hover:bg-muted/50">
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
                    {campaign.startDate
                      ? new Date(campaign.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                      : campaign.createdAt
                      ? new Date(campaign.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                      : '-'}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          <BarChart3 className="h-3.5 w-3.5 mr-2" /> View Analytics
                        </DropdownMenuItem>
                        <DropdownMenuItem>Edit</DropdownMenuItem>
                        {campaign.status === 'draft' && (
                          <DropdownMenuItem onClick={() => handleSend(campaign.id)}>
                            <Send className="h-3.5 w-3.5 mr-2" /> Send Now
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Campaign</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Campaign Name <span className="text-destructive">*</span></Label>
              <Input
                placeholder="e.g., Summer Sale 2026"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={newType} onValueChange={(v) => setNewType(v as typeof newType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                    <SelectItem value="social">Social</SelectItem>
                    <SelectItem value="push">Push</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input
                  placeholder="Email subject line"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Content <span className="text-destructive">*</span></Label>
              <Textarea
                placeholder="Campaign content..."
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                rows={5}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? 'Creating...' : 'Create Campaign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
