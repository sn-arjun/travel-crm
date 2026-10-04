'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Pencil, Phone, Mail, Trash2, Info } from 'lucide-react';
import { ListPage } from '@/components/domain';
import { Button, Tag, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Alert, AlertDescription } from '@/components/ui';
import { suppliersApi } from '@/lib/api/suppliers';
import { SendMessageDialog } from '@/components/communication/send-message-dialog';
import { toast } from 'sonner';
import type { Supplier } from '@travelcrm/shared';
import { toLocalDateString } from '@/lib/dates';

const CATEGORY_OPTIONS = [
  { value: 'hotel', label: 'Hotel' },
  { value: 'transport', label: 'Transport' },
  { value: 'airline', label: 'Airline' },
  { value: 'activity_provider', label: 'Activity Provider' },
  { value: 'guide', label: 'Guide' },
  { value: 'visa_agent', label: 'Visa Agent' },
  { value: 'insurance', label: 'Insurance' },
];

function toCsv(rows: Supplier[]) {
  const header = ['Company', 'Category', 'Contact Person', 'Email', 'Phone', 'Status'];
  const lines = rows.map((s: any) => [
    s.companyName ?? s.company_name ?? s.name ?? '',
    (s.category ?? s.type ?? '').replace(/_/g, ' '),
    s.contactPerson ?? s.contact_person ?? '',
    s.email ?? '',
    s.phone ?? '',
    (s.isActive ?? s.is_active) ? 'Active' : 'Inactive',
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
  return [header.join(','), ...lines].join('\n');
}

export default function AccountsPage() {
  const router = useRouter();
  const [categoryFilter, setCategoryFilter] = React.useState('');
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [msgDialogOpen, setMsgDialogOpen] = React.useState(false);
  const [msgContact, setMsgContact] = React.useState<{ id: string; name: string; email?: string | null; phone?: string | null }>({ id: '', name: '' });

  const activeFilters = [
    categoryFilter && { id: 'category', label: 'Category', value: CATEGORY_OPTIONS.find((c) => c.value === categoryFilter)?.label ?? categoryFilter },
  ].filter(Boolean) as { id: string; label: string; value: string }[];

  function openSendMessage(sup: any) {
    setMsgContact({
      id: sup.id,
      name: sup.companyName || sup.company_name || sup.name || '',
      email: sup.email || null,
      phone: sup.phone || null,
    });
    setMsgDialogOpen(true);
  }

  return (
    <>
      <div className="px-ds-6 pt-ds-4">
        <Alert>
          <Info aria-hidden="true" />
          <AlertDescription>Accounts is a filtered view of your Suppliers. Opening a row takes you to the full Supplier record.</AlertDescription>
        </Alert>
      </div>

      <ListPage<Supplier>
        refreshKey={refreshKey}
        title="Accounts"
        description="Corporate accounts — a filtered view of Suppliers."
        getRowId={(s) => s.id}
        fetcher={({ page, limit, search }) =>
          suppliersApi.list({
            page,
            limit,
            search: search || undefined,
            category: categoryFilter || undefined,
          })
        }
        searchPlaceholder="Search accounts..."
        columns={[
          {
            key: 'company', header: 'Company', sortable: true,
            cell: (s: any) => <span className="font-medium text-sm">{s.companyName || s.company_name || s.name || '—'}</span>,
          },
          {
            key: 'category', header: 'Category', sortable: true,
            cell: (s: any) => <Tag tone="info">{(s.category ?? s.type ?? '').replace(/_/g, ' ')}</Tag>,
          },
          { key: 'contactPerson', header: 'Contact Person', cell: (s: any) => s.contactPerson ?? s.contact_person ?? '—' },
          { key: 'email', header: 'Email', cell: (s: any) => s.email ?? '—' },
          { key: 'phone', header: 'Phone', cell: (s: any) => s.phone ?? '—' },
          {
            key: 'status', header: 'Status', sortable: true,
            cell: (s: any) => {
              const active = s.isActive ?? s.is_active;
              return <Tag tone={active ? 'success' : 'danger'}>{active ? 'Active' : 'Inactive'}</Tag>;
            },
          },
        ]}
        headerActions={
          <Select value={categoryFilter || 'all'} onValueChange={(v) => setCategoryFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-44 h-9"><SelectValue placeholder="All categories" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {CATEGORY_OPTIONS.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
        filters={activeFilters}
        onRemoveFilter={() => setCategoryFilter('')}
        onClearFilters={() => setCategoryFilter('')}
        rowActions={(s: any) => (
          <>
            <Button variant="ghost" size="icon-sm" aria-label="View" onClick={() => router.push(`/suppliers/${s.id}`)}>
              <Eye />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => router.push(`/suppliers/${s.id}/edit`)}>
              <Pencil />
            </Button>
            {s.phone && (
              <Button variant="ghost" size="icon-sm" aria-label="Call" onClick={() => router.push(`/communication/calls/dial?phone=${encodeURIComponent(s.phone)}`)}>
                <Phone />
              </Button>
            )}
            {s.email && (
              <Button variant="ghost" size="icon-sm" aria-label="Email" onClick={() => openSendMessage(s)}>
                <Mail />
              </Button>
            )}
            <Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={async () => {
              try {
                await suppliersApi.delete(s.id);
                toast.success('Account deleted');
                setRefreshKey((k) => k + 1);
              } catch { toast.error('Failed to delete account'); }
            }}>
              <Trash2 />
            </Button>
          </>
        )}
        onRowClick={(s) => router.push(`/suppliers/${s.id}`)}
        bulkActions={[
          {
            label: 'Delete',
            icon: <Trash2 aria-hidden="true" />,
            destructive: true,
            onSelect: async (rows) => {
              await Promise.all(rows.map((r) => suppliersApi.delete(r.id)));
              toast.success(`${rows.length} account(s) deleted`);
              setRefreshKey((k) => k + 1);
            },
          },
        ]}
        onExport={async () => {
          try {
            const all: Supplier[] = [];
            let page = 1;
            const limit = 100;
            for (;;) {
              const res = await suppliersApi.list({ page, limit, category: categoryFilter || undefined });
              const data = (res as any)?.data;
              const items: Supplier[] = Array.isArray(data) ? data : (data?.data ?? []);
              all.push(...items);
              const total = Array.isArray(data) ? items.length : (data?.pagination?.total ?? items.length);
              if (all.length >= total || items.length === 0) break;
              page += 1;
            }
            const blob = new Blob([toCsv(all)], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `accounts_export_${toLocalDateString(new Date())}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success('Accounts exported successfully');
          } catch {
            toast.error('Failed to export accounts');
          }
        }}
        emptyTitle="No accounts yet"
        emptyDescription="Accounts are sourced from Suppliers — add your first supplier to get started."
        emptyAction={
          <Button size="sm" onClick={() => router.push('/suppliers/new')}>Add supplier</Button>
        }
      />

      <SendMessageDialog
        open={msgDialogOpen}
        onOpenChange={setMsgDialogOpen}
        contact={msgContact}
      />
    </>
  );
}
