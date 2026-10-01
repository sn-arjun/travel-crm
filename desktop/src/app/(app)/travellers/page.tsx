'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Pencil, Trash2, Plus, UserRound } from 'lucide-react';
import { ListPage } from '@/components/domain';
import {
  Button, Tag,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui';
import { travellersApi, parseDateOnly, normalizeTraveller, type Traveller } from '@/lib/api/visa';
import { toast } from 'sonner';

function expiryTone(expiry?: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (!expiry) return 'neutral';
  const diff = parseDateOnly(expiry).getTime() - Date.now();
  if (diff < 0) return 'danger';
  if (diff < 180 * 86400000) return 'warning';
  return 'success';
}

function formatDate(value?: string) {
  return value
    ? parseDateOnly(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';
}

export default function TravellersPage() {
  const router = useRouter();
  // Bumping the key remounts ListPage so the list refetches after a delete.
  const [listKey, setListKey] = React.useState(0);
  const [pendingDelete, setPendingDelete] = React.useState<Traveller | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await travellersApi.delete(pendingDelete.id);
      toast.success(`${pendingDelete.firstName} ${pendingDelete.lastName} deleted`);
      setPendingDelete(null);
      setListKey((k) => k + 1);
    } catch {
      toast.error('Failed to delete traveller');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
    <ListPage<Traveller>
      key={listKey}
      title="Travellers"
      description="Passenger records with passport and travel document details."
      getRowId={(t) => t.id}
      fetcher={async ({ page, limit, search }) => {
        const res = await travellersApi.list({ page, limit, search: search || undefined });
        const d = res.data as any;
        const rows = Array.isArray(d) ? d : d?.data ?? [];
        const items = rows.map(normalizeTraveller);
        return { ...res, data: Array.isArray(d) ? items : { ...d, data: items } };
      }}
      searchPlaceholder="Search by name or passport number..."
      columns={[
        {
          key: 'name', header: 'Name', sortable: true,
          cell: (t) => <span className="font-medium text-sm">{t.firstName} {t.lastName}</span>,
        },
        {
          key: 'passportNumber', header: 'Passport Number',
          cell: (t) => <span className="font-mono text-sm">{t.passportNumber || '—'}</span>,
        },
        {
          key: 'nationality', header: 'Nationality',
          cell: (t) => t.nationality || '—',
        },
        {
          key: 'dateOfBirth', header: 'Date of Birth', sortable: true,
          cell: (t) => formatDate(t.dateOfBirth),
        },
        {
          key: 'passportExpiryDate', header: 'Passport Expiry',
          cell: (t) => (
            <Tag tone={expiryTone(t.passportExpiryDate)}>{formatDate(t.passportExpiryDate)}</Tag>
          ),
        },
      ]}
      primaryAction={
        <Button size="sm" onClick={() => router.push('/travellers/new')}>
          <Plus aria-hidden="true" /> Add traveller
        </Button>
      }
      rowActions={(t) => (
        <>
          <Button variant="ghost" size="icon-sm" aria-label="View" onClick={() => router.push(`/travellers/${t.id}`)}>
            <Eye />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => router.push(`/travellers/${t.id}/edit`)}>
            <Pencil />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={() => setPendingDelete(t)}>
            <Trash2 />
          </Button>
        </>
      )}
      onRowClick={(t) => router.push(`/travellers/${t.id}`)}
      bulkActions={[
        {
          label: 'Delete',
          icon: <Trash2 aria-hidden="true" />,
          destructive: true,
          onSelect: async (rows) => {
            await Promise.all(rows.map((r) => travellersApi.delete(r.id)));
            toast.success(`${rows.length} traveller(s) deleted`);
            setListKey((k) => k + 1);
          },
        },
      ]}
      onExport={(rows) => {
        const header = ['First Name', 'Last Name', 'Passport Number', 'Nationality', 'Date of Birth', 'Passport Expiry', 'Email', 'Phone'];
        const lines = rows.map((t) => [
          t.firstName, t.lastName, t.passportNumber, t.nationality ?? '', t.dateOfBirth ?? '',
          t.passportExpiryDate ?? '', t.email ?? '', t.phone ?? '',
        ].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
        const csv = [header.join(','), ...lines].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `travellers_export_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }}
      emptyIcon={<UserRound className="size-12" aria-hidden="true" />}
      emptyTitle="No travellers yet"
      emptyDescription="Add your first traveller to start tracking passports and travel documents."
      emptyAction={
        <Button size="sm" onClick={() => router.push('/travellers/new')}>
          <Plus aria-hidden="true" /> Add traveller
        </Button>
      }
    />
    <Dialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Traveller</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete {pendingDelete?.firstName} {pendingDelete?.lastName}? This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPendingDelete(null)} disabled={deleting}>Cancel</Button>
          <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
