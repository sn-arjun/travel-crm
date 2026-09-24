'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Loader2, Mail, Pencil, Phone, Plus, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ListPage } from '@/components/domain';
import type { DataTableColumn } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SendMessageDialog } from '@/components/communication/send-message-dialog';
import { useApiQuery } from '@/hooks/use-api';
import { suppliersApi } from '@/lib/api/suppliers';

interface SupplierRow {
  id: string;
  company_name?: string;
  name?: string;
  category?: string;
  contact_person?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  rating?: number;
  status?: string;
  is_preferred?: boolean;
  isPreferred?: boolean;
}

const CATEGORY_OPTIONS = [
  { value: 'hotel', label: 'Hotel' },
  { value: 'airline', label: 'Airline' },
  { value: 'transport', label: 'Transport' },
  { value: 'activity_provider', label: 'Activity Provider' },
  { value: 'guide', label: 'Guide' },
  { value: 'visa_agent', label: 'Visa Agent' },
  { value: 'insurance', label: 'Insurance' },
];

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

function toCsvValue(v: unknown) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function exportSuppliersCsv(params: { category?: string; status?: string; isPreferred?: boolean; search: string }) {
  const rows: SupplierRow[] = [];
  let page = 1;
  const limit = 100;
  while (true) {
    const res: any = await suppliersApi.list({
      page,
      limit,
      search: params.search || undefined,
      category: params.category,
      status: params.status,
      isPreferred: params.isPreferred || undefined,
    });
    const items: SupplierRow[] = res?.data?.data ?? (Array.isArray(res?.data) ? res.data : []);
    rows.push(...items);
    const total = res?.data?.pagination?.total ?? items.length;
    if (rows.length >= total || items.length === 0) break;
    page += 1;
  }

  const header = ['Company', 'Category', 'Contact Person', 'Email', 'Phone', 'Rating', 'Status', 'Preferred'];
  const lines = [header.join(',')];
  for (const s of rows) {
    lines.push([
      toCsvValue(s.company_name || s.name),
      toCsvValue(s.category),
      toCsvValue(s.contact_person || s.contactPerson),
      toCsvValue(s.email),
      toCsvValue(s.phone),
      toCsvValue(s.rating),
      toCsvValue(s.status),
      toCsvValue(s.is_preferred || s.isPreferred ? 'Yes' : 'No'),
    ].join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `suppliers-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function SupplierDetailPanel({ supplierId }: { supplierId: string }) {
  const router = useRouter();
  const [sendOpen, setSendOpen] = React.useState(false);
  const { data, loading } = useApiQuery(() => suppliersApi.getById(supplierId), [supplierId]);
  const s: any = data?.data;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-ds-foreground-muted" />
      </div>
    );
  }
  if (!s) return null;

  const name = s.company_name || s.name || 'Unknown';
  const isPreferred = s.is_preferred ?? s.isPreferred ?? false;

  return (
    <div className="flex flex-col gap-ds-4">
      <div className="flex items-center gap-ds-4">
        <Avatar className="h-14 w-14">
          <AvatarFallback className="text-lg font-semibold">{getInitials(name)}</AvatarFallback>
        </Avatar>
        <div>
          <div className="flex items-center gap-ds-2">
            <Badge variant="outline" className="text-[10px] capitalize">{(s.category ?? 'other').replace(/_/g, ' ')}</Badge>
            {isPreferred && (
              <Badge className="text-[10px] bg-ds-warning-subtle text-ds-warning-on-subtle">
                <Star className="h-3 w-3" aria-hidden="true" /> Preferred
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-ds-2 flex-wrap">
        {s.phone && (
          <Button variant="outline" size="sm" onClick={() => router.push(`/communication/calls/dial?phone=${encodeURIComponent(s.phone)}`)}>
            <Phone aria-hidden="true" /> Call
          </Button>
        )}
        {s.email && (
          <Button variant="outline" size="sm" onClick={() => setSendOpen(true)}>
            <Mail aria-hidden="true" /> Email
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => router.push(`/suppliers/${supplierId}/edit`)}>
          <Pencil aria-hidden="true" /> Edit
        </Button>
        <Button variant="ghost" size="sm" onClick={() => router.push(`/suppliers/${supplierId}`)}>
          <Eye aria-hidden="true" /> Full Profile
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-ds-2 text-sm">
        <div className="flex justify-between">
          <span className="text-ds-foreground-muted">Contact Person</span>
          <span className="font-medium">{s.contact_person || s.contactPerson || '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ds-foreground-muted">Email</span>
          <span className="font-medium">{s.email || '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ds-foreground-muted">Phone</span>
          <span className="font-medium">{s.phone || '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ds-foreground-muted">Status</span>
          <Badge variant={s.status === 'inactive' ? 'secondary' : 'outline'}>{s.status ?? 'active'}</Badge>
        </div>
        <div className="flex justify-between">
          <span className="text-ds-foreground-muted">Rating</span>
          <span className="font-medium">{s.rating ? `${s.rating} ★` : '—'}</span>
        </div>
      </div>

      {s.email && (
        <SendMessageDialog
          open={sendOpen}
          onOpenChange={setSendOpen}
          contact={{ id: supplierId, name, email: s.email, phone: s.phone }}
        />
      )}
    </div>
  );
}

export default function SuppliersPage() {
  const router = useRouter();
  const [categoryFilter, setCategoryFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [preferredFilter, setPreferredFilter] = React.useState(false);
  const [refetchKey, setRefetchKey] = React.useState(0);
  const lastSearchRef = React.useRef('');

  const activeFilters = React.useMemo(() => {
    const f: { id: string; label: string; value: string }[] = [];
    if (categoryFilter !== 'all') f.push({ id: 'category', label: 'Category', value: categoryFilter.replace(/_/g, ' ') });
    if (statusFilter !== 'all') f.push({ id: 'status', label: 'Status', value: statusFilter });
    if (preferredFilter) f.push({ id: 'preferred', label: 'Preferred', value: 'Yes' });
    return f;
  }, [categoryFilter, statusFilter, preferredFilter]);

  const columns: DataTableColumn<SupplierRow>[] = [
    {
      key: 'company_name',
      header: 'Company',
      sortable: true,
      hideable: false,
      cell: (s) => (
        <div className="flex items-center gap-ds-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs">{getInitials(s.company_name || s.name || '')}</AvatarFallback>
          </Avatar>
          <span className="font-medium text-sm flex items-center gap-ds-1">
            {s.company_name || s.name}
            {(s.is_preferred || s.isPreferred) && (
              <Star className="h-3.5 w-3.5 text-ds-warning fill-current" aria-label="Preferred" />
            )}
          </span>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      sortable: true,
      cell: (s) => <Badge variant="outline" className="text-xs capitalize">{(s.category ?? 'other').replace(/_/g, ' ')}</Badge>,
    },
    { key: 'contact_person', header: 'Contact Person', cell: (s) => <span className="text-sm">{s.contact_person || s.contactPerson || '—'}</span> },
    { key: 'email', header: 'Email', cell: (s) => <span className="text-sm text-ds-foreground-muted">{s.email ?? '—'}</span> },
    { key: 'phone', header: 'Phone', cell: (s) => <span className="text-sm">{s.phone ?? '—'}</span> },
    {
      key: 'rating',
      header: 'Rating',
      align: 'right',
      sortable: true,
      cell: (s) => <span className="text-sm">{s.rating ? `${s.rating} ★` : '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (s) => <Badge variant={s.status === 'inactive' ? 'secondary' : 'outline'}>{s.status ?? 'active'}</Badge>,
    },
  ];

  return (
    <div className="p-ds-6">
      <ListPage<SupplierRow>
        key={refetchKey}
        title="Suppliers"
        description="Manage your supplier network."
        getRowId={(s) => s.id}
        fetcher={({ page, limit, search }) => {
          lastSearchRef.current = search;
          return suppliersApi.list({
            page,
            limit,
            search: search || undefined,
            category: categoryFilter !== 'all' ? categoryFilter : undefined,
            status: statusFilter !== 'all' ? statusFilter : undefined,
            isPreferred: preferredFilter || undefined,
          });
        }}
        extractItems={(r: any) => r?.data?.data ?? (Array.isArray(r?.data) ? r.data : [])}
        extractTotal={(r: any) => r?.data?.pagination?.total ?? 0}
        columns={columns}
        searchPlaceholder="Search suppliers..."
        filters={activeFilters}
        onRemoveFilter={(id) => {
          if (id === 'category') setCategoryFilter('all');
          if (id === 'status') setStatusFilter('all');
          if (id === 'preferred') setPreferredFilter(false);
        }}
        onClearFilters={() => { setCategoryFilter('all'); setStatusFilter('all'); setPreferredFilter(false); }}
        headerActions={
          <>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-40 h-9"><SelectValue placeholder="All categories" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {CATEGORY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32 h-9"><SelectValue placeholder="All status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant={preferredFilter ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPreferredFilter((v) => !v)}
              className="h-9"
            >
              <Star aria-hidden="true" className={preferredFilter ? 'fill-current' : ''} /> Preferred
            </Button>
          </>
        }
        primaryAction={
          <Button size="sm" onClick={() => router.push('/suppliers/new')}>
            <Plus aria-hidden="true" /> Add Supplier
          </Button>
        }
        rowActions={(s) => (
          <>
            <Button variant="ghost" size="icon-sm" aria-label="View" onClick={() => router.push(`/suppliers/${s.id}`)}>
              <Eye aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => router.push(`/suppliers/${s.id}/edit`)}>
              <Pencil aria-hidden="true" />
            </Button>
            {s.phone && (
              <Button variant="ghost" size="icon-sm" aria-label="Call" onClick={() => router.push(`/communication/calls/dial?phone=${encodeURIComponent(s.phone!)}`)}>
                <Phone aria-hidden="true" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Delete"
              onClick={async () => {
                if (confirm(`Delete ${s.company_name || s.name}?`)) {
                  try {
                    await suppliersApi.delete(s.id);
                    toast.success('Supplier deleted');
                    setRefetchKey((k) => k + 1);
                  } catch {
                    toast.error('Failed to delete supplier');
                  }
                }
              }}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </>
        )}
        renderDetail={(s) => <SupplierDetailPanel supplierId={s.id} />}
        detailTitle={(s) => s.company_name || s.name || 'Supplier'}
        bulkActions={[
          {
            label: 'Delete',
            icon: <Trash2 aria-hidden="true" />,
            destructive: true,
            onSelect: async (rows) => {
              await Promise.all(rows.map((r) => suppliersApi.delete(r.id)));
              toast.success(`${rows.length} supplier${rows.length > 1 ? 's' : ''} deleted`);
              setRefetchKey((k) => k + 1);
            },
          },
        ]}
        onExport={() =>
          exportSuppliersCsv({
            category: categoryFilter !== 'all' ? categoryFilter : undefined,
            status: statusFilter !== 'all' ? statusFilter : undefined,
            isPreferred: preferredFilter || undefined,
            search: lastSearchRef.current,
          })
        }
        emptyTitle="No suppliers yet"
        emptyDescription="Add your first supplier to get started."
        emptyIcon={<Star aria-hidden="true" />}
      />
    </div>
  );
}
