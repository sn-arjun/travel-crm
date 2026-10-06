'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  Phone,
  Plus,
  Star,
  StarOff,
  MessageSquare,
  PhoneCall,
  Search,
  Trash2,
} from 'lucide-react';
import {
  Button,
  Input,
  Label,
  PageHeader,
  SectionCard,
  DataTable,
  type DataTableColumn,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Badge,
  EmptyState,
  Skeleton,
  ConfirmDialog,
} from '@/components/ui';
import { toast } from 'sonner';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { voipApi, type VoipNumber, type AvailableNumber } from '@/lib/api/voip';
import { useFeatureGate } from '@/hooks/use-feature-gate';
import { PageContainer } from '@/components/layout/page-container';

function PhoneNumbersPageContent() {
  const router = useRouter();
  const { enabled, reason, upgradeHref, loading: gateLoading } = useFeatureGate('voip_calling');

  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchForm, setSearchForm] = React.useState({ areaCode: '', contains: '' });
  const [searchResults, setSearchResults] = React.useState<AvailableNumber[] | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<VoipNumber | null>(null);

  const { data: numbersResponse, loading, refetch } = useApiQuery(
    () => voipApi.numbers.list(),
    [],
  );

  const numbers: VoipNumber[] = React.useMemo(() => {
    if (!numbersResponse || !('data' in numbersResponse)) return [];
    return (numbersResponse.data as VoipNumber[]) ?? [];
  }, [numbersResponse]);

  const searchMutation = useApiMutation((data: { areaCode?: string; contains?: string }) =>
    voipApi.numbers.search(data),
  );
  const purchaseMutation = useApiMutation((data: { phoneNumber: string; friendlyName?: string }) =>
    voipApi.numbers.purchase(data),
  );
  const updateMutation = useApiMutation((input: { id: string; isDefault: boolean }) =>
    voipApi.numbers.update(input.id, { isDefault: input.isDefault }),
  );
  const removeMutation = useApiMutation((id: string) => voipApi.numbers.remove(id));

  const primaryId = React.useMemo(
    () => numbers.find((n) => n.isDefault)?.id ?? null,
    [numbers],
  );

  const handleSearch = async () => {
    setSearchResults(null);
    const result = await searchMutation.mutate({
      areaCode: searchForm.areaCode || undefined,
      contains: searchForm.contains || undefined,
    });
    if (result && 'data' in result) {
      setSearchResults((result.data as AvailableNumber[]) ?? []);
    } else {
      toast.error(searchMutation.error?.message ?? 'Failed to search available numbers');
    }
  };

  const handlePurchase = async (n: AvailableNumber) => {
    const result = await purchaseMutation.mutate({ phoneNumber: n.phoneNumber, friendlyName: n.friendlyName });
    if (result) {
      toast.success('Phone number purchased');
      setSearchOpen(false);
      setSearchResults(null);
      setSearchForm({ areaCode: '', contains: '' });
      refetch();
    } else {
      toast.error(purchaseMutation.error?.message ?? 'Failed to purchase phone number');
    }
  };

  const handleSetPrimary = async (num: VoipNumber) => {
    const result = await updateMutation.mutate({ id: num.id, isDefault: true });
    if (result) {
      toast.success('Primary number updated');
      refetch();
    } else {
      toast.error(updateMutation.error?.message ?? 'Failed to update number');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const result = await removeMutation.mutate(deleteTarget.id);
    if (result !== null) {
      toast.success('Phone number removed');
      refetch();
    } else {
      toast.error(removeMutation.error?.message ?? 'Failed to remove phone number');
    }
    setDeleteTarget(null);
  };

  const columns: DataTableColumn<VoipNumber>[] = [
    {
      key: 'number',
      header: 'Number',
      cell: (num) => (
        <div className="flex items-center gap-ds-2">
          <span className="font-mono text-sm font-medium text-ds-foreground">{num.phoneNumber}</span>
          {num.id === primaryId && (
            <Badge className="bg-ds-warning-subtle text-ds-warning-on-subtle text-xs">Primary</Badge>
          )}
        </div>
      ),
    },
    {
      key: 'friendlyName',
      header: 'Friendly Name',
      cell: (num) => <span className="text-sm text-ds-foreground-muted">{num.friendlyName ?? '-'}</span>,
    },
    {
      key: 'capabilities',
      header: 'Capabilities',
      cell: (num) => (
        <div className="flex items-center gap-ds-2 text-ds-foreground-muted">
          {num.capabilities?.voice && <PhoneCall className="size-3.5" aria-label="Voice" />}
          {num.capabilities?.sms && <MessageSquare className="size-3.5" aria-label="SMS" />}
        </div>
      ),
    },
    {
      key: 'assignedName',
      header: 'Assigned To',
      cell: (num) => <span className="text-sm text-ds-foreground-muted">{num.assignedName ?? '-'}</span>,
    },
  ];

  const backButton = (
    <Button variant="ghost" size="icon" onClick={() => router.push('/settings')} aria-label="Back to settings">
      <ArrowLeft className="size-4" />
    </Button>
  );

  if (gateLoading || loading) {
    return (
      <div className="flex flex-col gap-ds-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="flex flex-col gap-ds-4">
        <PageHeader title="Phone Numbers" description="Manage your VoIP phone numbers and their assignments" back={backButton} />
        <SectionCard title="Phone numbers are not available on your plan">
          <p className="mb-ds-4 text-sm text-ds-foreground-muted">
            {reason === 'cap_exceeded'
              ? 'You have reached your VoIP usage limit for this billing period.'
              : 'Upgrade your plan to purchase and manage VoIP phone numbers.'}
          </p>
          <Button asChild>
            <a href={upgradeHref}>{reason === 'cap_exceeded' ? 'View plans' : 'Upgrade to enable'}</a>
          </Button>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-ds-6">
      <PageHeader
        title="Phone Numbers"
        description="Manage your VoIP phone numbers and their assignments"
        count={numbers.length}
        back={backButton}
        actions={
          <Button onClick={() => setSearchOpen(true)} className="gap-ds-2">
            <Plus className="size-4" />
            Add Number
          </Button>
        }
      />

      <SectionCard flush>
        <DataTable<VoipNumber>
          columns={columns}
          data={numbers}
          getRowId={(n) => n.id}
          rowActions={(num) => (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={num.id === primaryId ? 'Primary number' : 'Set as primary'}
                onClick={() => handleSetPrimary(num)}
                disabled={num.id === primaryId || updateMutation.loading}
              >
                {num.id === primaryId ? (
                  <Star className="size-4 fill-ds-warning text-ds-warning" />
                ) : (
                  <StarOff className="size-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Delete"
                onClick={() => setDeleteTarget(num)}
              >
                <Trash2 className="size-4" />
              </Button>
            </>
          )}
          emptyState={
            <EmptyState
              icon={<Phone className="size-8" />}
              title="No phone numbers configured"
              description="Search for an available number and purchase one to get started."
              action={
                <Button onClick={() => setSearchOpen(true)} variant="outline" className="gap-ds-2">
                  <Plus className="size-4" />
                  Add First Number
                </Button>
              }
            />
          }
        />
      </SectionCard>

      <Dialog open={searchOpen} onOpenChange={(open) => { setSearchOpen(open); if (!open) setSearchResults(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Phone Number</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-ds-4 py-ds-4">
            <div className="flex items-end gap-ds-2">
              <div className="flex-1 flex flex-col gap-ds-2">
                <Label htmlFor="areaCode">Area code</Label>
                <Input
                  id="areaCode"
                  value={searchForm.areaCode}
                  onChange={(e) => setSearchForm((p) => ({ ...p, areaCode: e.target.value }))}
                  placeholder="e.g., 415"
                />
              </div>
              <div className="flex-1 flex flex-col gap-ds-2">
                <Label htmlFor="contains">Contains digits</Label>
                <Input
                  id="contains"
                  value={searchForm.contains}
                  onChange={(e) => setSearchForm((p) => ({ ...p, contains: e.target.value }))}
                  placeholder="e.g., 777"
                />
              </div>
              <Button onClick={handleSearch} disabled={searchMutation.loading} className="gap-ds-2">
                {searchMutation.loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                Search
              </Button>
            </div>

            {searchResults !== null && (
              <div className="flex flex-col gap-ds-2 max-h-72 overflow-y-auto">
                {searchResults.length === 0 ? (
                  <p className="text-sm text-ds-foreground-muted py-ds-4 text-center">
                    No available numbers found. Try a different area code.
                  </p>
                ) : (
                  searchResults.map((n) => (
                    <div
                      key={n.phoneNumber}
                      className="flex items-center justify-between rounded-ds-md border border-ds-border px-ds-3 py-ds-2"
                    >
                      <div>
                        <p className="font-mono text-sm font-medium text-ds-foreground">{n.phoneNumber}</p>
                        <p className="text-xs text-ds-foreground-muted">
                          {n.region || n.friendlyName || 'Available'}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handlePurchase(n)}
                        disabled={purchaseMutation.loading}
                      >
                        Purchase
                      </Button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSearchOpen(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Remove phone number"
        description={`This will release ${deleteTarget?.phoneNumber ?? 'this number'}. This action cannot be undone.`}
        confirmLabel="Remove"
        tone="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}

export default function PhoneNumbersPage() {
  return (
    <PageContainer>
      <PhoneNumbersPageContent />
    </PageContainer>
  );
}
