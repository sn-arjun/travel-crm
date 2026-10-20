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
import { voipApi, type VoipNumber, type AvailableNumber, type NumberOffer } from '@/lib/api/voip';
import { useFeatureGate } from '@/hooks/use-feature-gate';
import { PageContainer } from '@/components/layout/page-container';

function apiMessage(err: unknown, fallback: string): string {
  const message = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : '';
  return message || fallback;
}

function apiCode(err: unknown): string | undefined {
  return err && typeof err === 'object' && 'code' in err ? ((err as { code?: string }).code ?? undefined) : undefined;
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

const KYC_EMPTY = { businessName: '', address: '', registrationNumber: '', documentUrl: '' };

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

  // What a number costs and what is needed before buying one (price, documents, add-on). Absent when the call fails.
  const { data: offerResponse, refetch: refetchOffer } = useApiQuery(() => voipApi.numberOffer.get(), []);
  const offer: NumberOffer | null = React.useMemo(() => {
    if (!offerResponse || !('data' in offerResponse)) return null;
    return (offerResponse.data as NumberOffer) ?? null;
  }, [offerResponse]);
  const [kycOpen, setKycOpen] = React.useState(false);
  const [kycForm, setKycForm] = React.useState(KYC_EMPTY);
  const [kycSaving, setKycSaving] = React.useState(false);
  const [searching, setSearching] = React.useState(false);
  const [buying, setBuying] = React.useState<string | null>(null);
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
    setSearching(true);
    try {
      const result = await voipApi.numbers.search({
        areaCode: searchForm.areaCode || undefined,
        contains: searchForm.contains || undefined,
      });
      setSearchResults(((result && 'data' in result ? result.data : []) as AvailableNumber[]) ?? []);
      // The first search turns calling on for the agency, so the offer may have changed.
      refetchOffer({ silent: true });
    } catch (err) {
      toast.error(apiMessage(err, 'Failed to search available numbers'));
    } finally {
      setSearching(false);
    }
  };

  const handlePurchase = async (n: AvailableNumber) => {
    setBuying(n.phoneNumber);
    try {
      await voipApi.numbers.purchase({ phoneNumber: n.phoneNumber, friendlyName: n.friendlyName });
      toast.success('Phone number purchased');
      setSearchOpen(false);
      setSearchResults(null);
      setSearchForm({ areaCode: '', contains: '' });
      refetch();
      refetchOffer({ silent: true });
    } catch (err) {
      const code = apiCode(err);
      if (code === 'KYC_REQUIRED') {
        toast.error(apiMessage(err, 'Business documents are needed before you can buy a number.'));
        setSearchOpen(false);
        setKycOpen(true);
      } else if (code === 'NUMBER_ADDON_REQUIRED') {
        toast.error('Add a phone number to your plan first: open Settings > Billing > Buy more.');
      } else {
        toast.error(apiMessage(err, 'Failed to purchase phone number'));
      }
    } finally {
      setBuying(null);
    }
  };

  const submitKyc = async () => {
    const f = kycForm;
    if (!f.businessName.trim() || !f.address.trim()) {
      toast.error('Enter the business name and address.');
      return;
    }
    setKycSaving(true);
    try {
      await voipApi.kyc.submit({
        details: { businessName: f.businessName.trim(), address: f.address.trim(), ...(f.registrationNumber.trim() && { registrationNumber: f.registrationNumber.trim() }) },
        files: f.documentUrl.trim() ? [{ name: 'Document', url: f.documentUrl.trim() }] : [],
      });
      toast.success('Documents sent for review');
      setKycOpen(false);
      setKycForm(KYC_EMPTY);
      refetchOffer({ silent: true });
    } catch (err) {
      toast.error(apiMessage(err, 'Failed to send documents'));
    } finally {
      setKycSaving(false);
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
          {num.rental?.status === 'release_scheduled' && num.rental.releaseAt && (
            <Badge className="bg-ds-danger-subtle text-ds-danger-on-subtle text-xs">
              {num.rental.releaseReason === 'unpaid' ? 'Rent unpaid: releases ' : 'Releases '}
              {new Date(num.rental.releaseAt).toLocaleDateString()}
            </Badge>
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
        <SectionCard title={reason === 'country_unavailable' ? 'Calling is not available in your country yet' : 'Phone numbers are not available on your plan'}>
          <p className="mb-ds-4 text-sm text-ds-foreground-muted">
            {reason === 'country_unavailable'
              ? 'Phone calls are offered to agencies in the United Kingdom, United States, Australia and Singapore for now.'
              : reason === 'cap_exceeded'
              ? 'You have reached your VoIP usage limit for this billing period.'
              : 'Upgrade your plan to purchase and manage VoIP phone numbers.'}
          </p>
          {reason !== 'country_unavailable' && (
            <Button asChild>
              <a href={upgradeHref}>{reason === 'cap_exceeded' ? 'View plans' : 'Upgrade to enable'}</a>
            </Button>
          )}
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

      {offer && (
        <SectionCard title="Number rental">
          <div className="flex flex-col gap-ds-2 text-sm text-ds-foreground-muted" data-testid="number-rental-info">
            {offer.price ? (
              <p>
                Each number is {money(offer.price.monthly, offer.price.currency)} a month plus tax (the provider cost plus {offer.price.includesMarginPct}%), taken as the
                phone number add-on. {offer.addon.freeThisMonth} unused this month.
              </p>
            ) : (
              <p>Number pricing for your region is not available yet. Please contact support.</p>
            )}
            {offer.kyc.required && (
              <p className="flex flex-wrap items-center gap-ds-2">
                Business documents for {offer.calling.country}:
                <Badge className="text-xs">
                  {offer.kyc.status === 'approved' ? 'Approved' : offer.kyc.status === 'pending' ? 'In review' : offer.kyc.status === 'rejected' ? 'Rejected' : 'Needed'}
                </Badge>
                {offer.kyc.status === 'rejected' && offer.kyc.document?.reviewNote && <span>{offer.kyc.document.reviewNote}</span>}
                {offer.kyc.status !== 'approved' && offer.kyc.status !== 'pending' && (
                  <Button size="sm" variant="outline" onClick={() => setKycOpen(true)}>Send documents</Button>
                )}
              </p>
            )}
          </div>
        </SectionCard>
      )}

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
              <Button onClick={handleSearch} disabled={searching} className="gap-ds-2">
                {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
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
                          {offer?.price ? ` - ${money(offer.price.monthly, offer.price.currency)}/month` : ''}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handlePurchase(n)}
                        disabled={buying !== null}
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

      <Dialog open={kycOpen} onOpenChange={setKycOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Business documents</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-ds-3 py-ds-4">
            <p className="text-sm text-ds-foreground-muted">
              Phone companies in your country need to know which business a number belongs to. We review these before you can buy a number.
            </p>
            <div className="flex flex-col gap-ds-2">
              <Label htmlFor="kycBusinessName">Business name</Label>
              <Input id="kycBusinessName" value={kycForm.businessName} onChange={(e) => setKycForm((p) => ({ ...p, businessName: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-ds-2">
              <Label htmlFor="kycAddress">Business address</Label>
              <Input id="kycAddress" value={kycForm.address} onChange={(e) => setKycForm((p) => ({ ...p, address: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-ds-2">
              <Label htmlFor="kycRegistration">Company registration number (if you have one)</Label>
              <Input id="kycRegistration" value={kycForm.registrationNumber} onChange={(e) => setKycForm((p) => ({ ...p, registrationNumber: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-ds-2">
              <Label htmlFor="kycDocumentUrl">Link to a certificate or proof of address</Label>
              <Input id="kycDocumentUrl" type="url" placeholder="https://" value={kycForm.documentUrl} onChange={(e) => setKycForm((p) => ({ ...p, documentUrl: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKycOpen(false)}>Cancel</Button>
            <Button onClick={submitKyc} disabled={kycSaving} className="gap-ds-2">
              {kycSaving && <Loader2 className="size-4 animate-spin" />}
              Send for review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Remove phone number"
        description={`This will release ${deleteTarget?.phoneNumber ?? 'this number'}. It stops receiving calls at once and is given back to the provider; this action cannot be undone.`}
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
