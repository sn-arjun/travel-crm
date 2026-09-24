'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Activity, LogIn, LogOut, Pencil, Plus, Settings, Trash2, FileText } from 'lucide-react';
import { ListPage, type ListFilter } from '@/components/domain/list-page';
import type { DataTableColumn } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { activityLogsApi, type ActivityLogEntry } from '@/lib/api/users';

const ACTION_ICONS: Record<string, React.ReactNode> = {
  create: <Plus aria-hidden="true" className="size-3.5" />,
  update: <Pencil aria-hidden="true" className="size-3.5" />,
  delete: <Trash2 aria-hidden="true" className="size-3.5" />,
  login: <LogIn aria-hidden="true" className="size-3.5" />,
  logout: <LogOut aria-hidden="true" className="size-3.5" />,
  view: <FileText aria-hidden="true" className="size-3.5" />,
  settings: <Settings aria-hidden="true" className="size-3.5" />,
};

const ACTION_OPTIONS = ['create', 'update', 'delete', 'login', 'logout'];
const ENTITY_OPTIONS = ['contact', 'lead', 'invoice', 'task', 'user', 'settings'];

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function initialsOf(name?: string) {
  return (name || 'U')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function ActivityLogPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetUserId = searchParams?.get('userId') ?? undefined;

  const [action, setAction] = React.useState('all');
  const [entityType, setEntityType] = React.useState('all');
  const [filtersOpen, setFiltersOpen] = React.useState(false);

  const filters: ListFilter[] = React.useMemo(() => {
    const list: ListFilter[] = [];
    if (action !== 'all') list.push({ id: 'action', label: 'Action', value: action });
    if (entityType !== 'all') list.push({ id: 'entityType', label: 'Entity', value: entityType });
    if (presetUserId) list.push({ id: 'userId', label: 'User', value: presetUserId });
    return list;
  }, [action, entityType, presetUserId]);

  const columns: DataTableColumn<ActivityLogEntry>[] = [
    {
      key: 'user',
      header: 'User',
      cell: (e) => (
        <div className="flex items-center gap-ds-2">
          <Avatar className="size-7">
            <AvatarFallback className="text-xs">{initialsOf(e.userName)}</AvatarFallback>
          </Avatar>
          <span className="text-sm">{e.userName ?? e.userId}</span>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      cell: (e) => (
        <Badge variant="secondary" className="gap-ds-1 capitalize">
          {ACTION_ICONS[e.action] ?? ACTION_ICONS.view}
          {e.action}
        </Badge>
      ),
    },
    {
      key: 'entity',
      header: 'Entity',
      cell: (e) => (
        <div>
          <span className="text-sm capitalize">{e.entityType}</span>
          {e.entityName && <p className="text-xs text-ds-foreground-muted">{e.entityName}</p>}
        </div>
      ),
    },
    {
      key: 'details',
      header: 'Details',
      cell: (e) => <span className="max-w-[240px] truncate text-sm text-ds-foreground-muted">{e.details ?? '—'}</span>,
    },
    { key: 'ipAddress', header: 'IP address', cell: (e) => <span className="font-mono text-xs">{e.ipAddress ?? '—'}</span> },
    { key: 'createdAt', header: 'Timestamp', sortable: true, cell: (e) => formatDate(e.createdAt) },
  ];

  return (
    <>
    <ListPage<ActivityLogEntry>
      title="Activity log"
      description="Track all actions performed in the system."
      getRowId={(e) => e.id}
      fetcher={({ page, limit }) =>
        activityLogsApi.list({
          page,
          limit,
          ...(action !== 'all' ? { action } : {}),
          ...(entityType !== 'all' ? { entityType } : {}),
          ...(presetUserId ? { userId: presetUserId } : {}),
        })
      }
      extractItems={(r) => {
        const data = (r as { data?: { data?: ActivityLogEntry[] } })?.data;
        return data?.data ?? [];
      }}
      extractTotal={(r) => {
        const data = (r as { data?: { pagination?: { total?: number } } })?.data;
        return data?.pagination?.total ?? 0;
      }}
      columns={columns}
      searchPlaceholder="Search user or entity…"
      filters={filters}
      onOpenFilters={() => setFiltersOpen(true)}
      onRemoveFilter={(id) => {
        if (id === 'action') setAction('all');
        if (id === 'entityType') setEntityType('all');
        if (id === 'userId') router.push('/settings/activity-log');
      }}
      onClearFilters={() => {
        setAction('all');
        setEntityType('all');
        router.push('/settings/activity-log');
      }}
      emptyIcon={<Activity aria-hidden="true" className="size-10" />}
      emptyTitle="No activity logs found"
      emptyDescription="Actions taken across the system will show up here."
    />

    <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Filter activity log</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-ds-4 py-ds-2">
          <div className="flex flex-col gap-ds-1">
            <Label>Action</Label>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {ACTION_OPTIONS.map((a) => (
                  <SelectItem key={a} value={a} className="capitalize">
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-ds-1">
            <Label>Entity</Label>
            <Select value={entityType} onValueChange={setEntityType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All entities</SelectItem>
                {ENTITY_OPTIONS.map((e) => (
                  <SelectItem key={e} value={e} className="capitalize">
                    {e}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => setFiltersOpen(false)}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
