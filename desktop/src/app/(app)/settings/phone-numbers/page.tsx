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
import { voipApi, type VoipNumber, type AvailableNumber, type NumberOffer, type NumberRequirements, type RegulatoryState } from '@/lib/api/voip';
import { useFeatureGate } from '@/hooks/use-feature-gate';
import { PageContainer } from '@/components/layout/page-container';
import { useT } from '@/lib/i18n';
import { formatCurrency, formatDate } from '@/lib/utils';
import { BundleStatus } from './_components/bundle-status';
import { RequirementsForm } from './_components/requirements-form';

function apiMessage(err: unknown, fallback: string): string {
  const message = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : '';
  return message || fallback;
}

function apiCode(err: unknown): string | undefined {
  return err && typeof err === 'object' && 'code' in err ? ((err as { code?: string }).code ?? undefined) : undefined;
}

const KYC_EMPTY = { businessName: '', address: '', registrationNumber: '', documentUrl: '' };

/** A country without a requirement list reports only pending / approved / rejected; show it with the same states. */
function stateOfLegacy(status: string | undefined): RegulatoryState {
  if (status === 'pending') return 'submitted';
  if (status === 'approved' || status === 'rejected') return status;
  return 'none';
}

function PhoneNumbersPageContent() {
  const t = useT();
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

  // The country's requirement list and where the documents stand (R137). Absent when the call fails: the older document flow shows instead.
  const { data: requirementsResponse, refetch: refetchRequirements } = useApiQuery(() => voipApi.requirements.get(), []);
  const requirements: NumberRequirements | null = React.useMemo(() => {
    if (!requirementsResponse || !('data' in requirementsResponse)) return null;
    return (requirementsResponse.data as NumberRequirements) ?? null;
  }, [requirementsResponse]);

  const [kycOpen, setKycOpen] = React.useState(false);
  const [kycForm, setKycForm] = React.useState(KYC_EMPTY);
  const [kycSaving, setKycSaving] = React.useState(false);
  const [kycError, setKycError] = React.useState<string | null>(null);
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

  const refreshOffer = () => {
    refetchOffer({ silent: true });
    refetchRequirements({ silent: true });
  };

  // Documents: needed at all, the state they are in, and the form that fits the country.
  const docsRequired = requirements ? requirements.kycRequired : !!offer?.kyc.required;
  const docState: RegulatoryState = requirements ? requirements.state : stateOfLegacy(offer?.kyc.status);
  const failureReason = requirements?.failureReason ?? offer?.kyc.document?.reviewNote ?? null;
  const requirementList = requirements?.bundleFlow && requirements.requirements && requirements.requirements.length > 0 ? requirements.requirements : null;
  const docCountry = requirements?.country ?? offer?.calling.country ?? '';

  // Why the Buy number button is off: the documents are not approved yet, or the country has no price yet.
  const buyBlockedReason: string | null = React.useMemo(() => {
    if (docsRequired && docState !== 'approved') return t(`calling.buy.blocked.${docState}`);
    if (offer && !offer.price) return offer.priceReason === 'PRICE_NOT_CONFIGURED' ? t('calling.price.notSet') : t('calling.price.unavailable');
    return null;
  }, [docsRequired, docState, offer, t]);

  const openDocuments = () => {
    setKycError(null);
    setKycOpen(true);
  };

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
      refreshOffer();
    } catch (err) {
      toast.error(apiMessage(err, t('calling.search.failed')));
    } finally {
      setSearching(false);
    }
  };

  const handlePurchase = async (n: AvailableNumber) => {
    setBuying(n.phoneNumber);
    try {
      await voipApi.numbers.purchase({ phoneNumber: n.phoneNumber, friendlyName: n.friendlyName });
      toast.success(t('calling.buy.done'));
      setSearchOpen(false);
      setSearchResults(null);
      setSearchForm({ areaCode: '', contains: '' });
      refetch();
      refreshOffer();
    } catch (err) {
      const code = apiCode(err);
      if (code === 'KYC_REQUIRED') {
        toast.error(apiMessage(err, t('calling.buy.docsNeeded')));
        setSearchOpen(false);
        refreshOffer();
        if (docState === 'none' || docState === 'rejected') openDocuments();
      } else if (code === 'KYC_PENDING_PROVIDER') {
        toast.error(apiMessage(err, t('calling.bundle.provider_review.message')));
        refreshOffer();
      } else if (code === 'NUMBER_ADDON_REQUIRED') {
        toast.error(t('calling.buy.addonNeeded'));
      } else if (code === 'PRICE_NOT_CONFIGURED') {
        toast.error(t('calling.price.notSet'));
        refreshOffer();
      } else {
        toast.error(apiMessage(err, t('calling.buy.failed')));
      }
    } finally {
      setBuying(null);
    }
  };

  const afterDocumentsSent = () => {
    toast.success(t('calling.kyc.sent'));
    setKycOpen(false);
    setKycForm(KYC_EMPTY);
    setKycError(null);
    refreshOffer();
  };

  // The structured form (a country with a requirement list): answers and files in one multipart request.
  const submitRequirements = async (form: FormData) => {
    setKycSaving(true);
    setKycError(null);
    try {
      await voipApi.requirements.submit(form);
      afterDocumentsSent();
    } catch (err) {
      const problems = err && typeof err === 'object' && 'details' in err ? ((err as { details?: { problems?: Array<{ message: string }> } }).details?.problems ?? []) : [];
      setKycError(problems.length > 0 ? problems.map((p) => p.message).join(' ') : apiMessage(err, t('calling.kyc.failed')));
    } finally {
      setKycSaving(false);
    }
  };

  // The earlier form (a country without a list): a few fields and a link.
  const submitKyc = async () => {
    const f = kycForm;
    if (!f.businessName.trim() || !f.address.trim()) {
      toast.error(t('calling.kyc.enterNameAddress'));
      return;
    }
    setKycSaving(true);
    try {
      await voipApi.kyc.submit({
        details: { businessName: f.businessName.trim(), address: f.address.trim(), ...(f.registrationNumber.trim() && { registrationNumber: f.registrationNumber.trim() }) },
        files: f.documentUrl.trim() ? [{ name: t('calling.kyc.documentName'), url: f.documentUrl.trim() }] : [],
      });
      afterDocumentsSent();
    } catch (err) {
      toast.error(apiMessage(err, t('calling.kyc.failed')));
    } finally {
      setKycSaving(false);
    }
  };

  const handleSetPrimary = async (num: VoipNumber) => {
    const result = await updateMutation.mutate({ id: num.id, isDefault: true });
    if (result) {
      toast.success(t('calling.numbers.primaryUpdated'));
      refetch();
    } else {
      toast.error(updateMutation.error?.message ?? t('calling.numbers.updateFailed'));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const result = await removeMutation.mutate(deleteTarget.id);
    if (result !== null) {
      toast.success(t('calling.numbers.removed'));
      refetch();
    } else {
      toast.error(removeMutation.error?.message ?? t('calling.numbers.removeFailed'));
    }
    setDeleteTarget(null);
  };

  const columns: DataTableColumn<VoipNumber>[] = [
    {
      key: 'number',
      header: t('calling.numbers.col.number'),
      cell: (num) => (
        <div className="flex items-center gap-ds-2">
          <span className="font-mono text-sm font-medium text-ds-foreground">{num.phoneNumber}</span>
          {num.id === primaryId && (
            <Badge className="bg-ds-warning-subtle text-ds-warning-on-subtle text-xs">{t('calling.numbers.primary')}</Badge>
          )}
          {num.rental?.status === 'release_scheduled' && num.rental.releaseAt && (
            <Badge className="bg-ds-danger-subtle text-ds-danger-on-subtle text-xs">
              {num.rental.releaseReason === 'unpaid'
                ? t('calling.numbers.releasesUnpaid', { date: formatDate(num.rental.releaseAt) })
                : t('calling.numbers.releases', { date: formatDate(num.rental.releaseAt) })}
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: 'friendlyName',
      header: t('calling.numbers.col.friendlyName'),
      cell: (num) => <span className="text-sm text-ds-foreground-muted">{num.friendlyName ?? '-'}</span>,
    },
    {
      key: 'capabilities',
      header: t('calling.numbers.col.capabilities'),
      cell: (num) => (
        <div className="flex items-center gap-ds-2 text-ds-foreground-muted">
          {num.capabilities?.voice && <PhoneCall className="size-3.5" aria-label={t('calling.numbers.voice')} />}
          {num.capabilities?.sms && <MessageSquare className="size-3.5" aria-label={t('calling.numbers.sms')} />}
        </div>
      ),
    },
    {
      key: 'assignedName',
      header: t('calling.numbers.col.assignedTo'),
      cell: (num) => <span className="text-sm text-ds-foreground-muted">{num.assignedName ?? '-'}</span>,
    },
  ];

  const backButton = (
    <Button variant="ghost" size="icon" onClick={() => router.push('/settings')} aria-label={t('calling.common.backToSettings')}>
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
        <PageHeader title={t('calling.numbers.title')} description={t('calling.numbers.description')} back={backButton} />
        <SectionCard title={reason === 'country_unavailable' ? t('calling.gate.countryUnavailableTitle') : t('calling.numbers.gate.notOnPlan')}>
          <p className="mb-ds-4 text-sm text-ds-foreground-muted">
            {reason === 'country_unavailable'
              ? t('calling.gate.countryUnavailableBody')
              : reason === 'cap_exceeded'
              ? t('calling.gate.capExceeded')
              : t('calling.numbers.gate.upgradeBody')}
          </p>
          {reason !== 'country_unavailable' && (
            <Button asChild>
              <a href={upgradeHref}>{reason === 'cap_exceeded' ? t('calling.gate.viewPlans') : t('calling.gate.upgrade')}</a>
            </Button>
          )}
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-ds-6">
      <PageHeader
        title={t('calling.numbers.title')}
        description={t('calling.numbers.description')}
        count={numbers.length}
        back={backButton}
        actions={
          <Button onClick={() => setSearchOpen(true)} className="gap-ds-2">
            <Plus className="size-4" />
            {t('calling.numbers.add')}
          </Button>
        }
      />

      {offer && (
        <SectionCard title={t('calling.rental.title')}>
          <div className="flex flex-col gap-ds-3 text-sm text-ds-foreground-muted" data-testid="number-rental-info">
            {offer.price ? (
              <p data-testid="number-price">
                {t('calling.rental.price', {
                  price: formatCurrency(offer.price.monthly, offer.price.currency),
                  margin: offer.price.includesMarginPct,
                  free: offer.addon.freeThisMonth,
                })}
              </p>
            ) : (
              <p data-testid="number-price-missing">
                {offer.priceReason === 'PRICE_NOT_CONFIGURED' ? t('calling.price.notSet') : t('calling.price.unavailable')}
              </p>
            )}
            {docsRequired && (
              <div className="flex flex-col gap-ds-2" data-testid="number-documents">
                <p className="font-medium text-ds-foreground">{t('calling.docs.title', { country: docCountry })}</p>
                <BundleStatus state={docState} failureReason={failureReason} onStart={openDocuments} onResubmit={openDocuments} />
              </div>
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
                aria-label={num.id === primaryId ? t('calling.numbers.primaryNumber') : t('calling.numbers.setPrimary')}
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
                aria-label={t('calling.common.delete')}
                onClick={() => setDeleteTarget(num)}
              >
                <Trash2 className="size-4" />
              </Button>
            </>
          )}
          emptyState={
            <EmptyState
              icon={<Phone className="size-8" />}
              title={t('calling.numbers.empty.title')}
              description={t('calling.numbers.empty.description')}
              action={
                <Button onClick={() => setSearchOpen(true)} variant="outline" className="gap-ds-2">
                  <Plus className="size-4" />
                  {t('calling.numbers.empty.action')}
                </Button>
              }
            />
          }
        />
      </SectionCard>

      <Dialog open={searchOpen} onOpenChange={(open) => { setSearchOpen(open); if (!open) setSearchResults(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('calling.search.title')}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-ds-4 py-ds-4">
            {buyBlockedReason && (
              <div className="flex flex-wrap items-center justify-between gap-ds-2 rounded-ds-md border border-ds-border bg-ds-surface-sunken px-ds-3 py-ds-2 text-sm text-ds-foreground-muted" data-testid="buy-blocked-reason">
                <span>{buyBlockedReason}</span>
                {docsRequired && (docState === 'none' || docState === 'rejected') && (
                  <Button size="sm" variant="outline" onClick={() => { setSearchOpen(false); openDocuments(); }}>
                    {docState === 'rejected' ? t('calling.bundle.rejected.action') : t('calling.bundle.none.action')}
                  </Button>
                )}
              </div>
            )}
            <div className="flex items-end gap-ds-2">
              <div className="flex-1 flex flex-col gap-ds-2">
                <Label htmlFor="areaCode">{t('calling.search.areaCode')}</Label>
                <Input
                  id="areaCode"
                  value={searchForm.areaCode}
                  onChange={(e) => setSearchForm((p) => ({ ...p, areaCode: e.target.value }))}
                  placeholder={t('calling.search.areaCodeExample')}
                />
              </div>
              <div className="flex-1 flex flex-col gap-ds-2">
                <Label htmlFor="contains">{t('calling.search.contains')}</Label>
                <Input
                  id="contains"
                  value={searchForm.contains}
                  onChange={(e) => setSearchForm((p) => ({ ...p, contains: e.target.value }))}
                  placeholder={t('calling.search.containsExample')}
                />
              </div>
              <Button onClick={handleSearch} disabled={searching} className="gap-ds-2">
                {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                {t('calling.search.action')}
              </Button>
            </div>

            {searchResults !== null && (
              <div className="flex flex-col gap-ds-2 max-h-72 overflow-y-auto">
                {searchResults.length === 0 ? (
                  <p className="text-sm text-ds-foreground-muted py-ds-4 text-center">
                    {t('calling.search.none')}
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
                          {n.region || n.friendlyName || t('calling.search.available')}
                          {offer?.price ? ` - ${t('calling.search.perMonth', { price: formatCurrency(offer.price.monthly, offer.price.currency) })}` : ''}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handlePurchase(n)}
                        disabled={buying !== null || buyBlockedReason !== null}
                        title={buyBlockedReason ?? undefined}
                        data-testid="buy-number"
                      >
                        {t('calling.buy.action')}
                      </Button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSearchOpen(false)}>{t('calling.common.cancel')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={kycOpen} onOpenChange={setKycOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('calling.kyc.title')}</DialogTitle>
          </DialogHeader>
          {requirementList ? (
            <div className="flex flex-col gap-ds-3 py-ds-4">
              <p className="text-sm text-ds-foreground-muted">{t('calling.kyc.intro')}</p>
              <RequirementsForm
                requirements={requirementList}
                numberTypes={requirements?.numberTypes}
                document={offer?.kyc.document ?? requirements?.document ?? null}
                numberType={requirements?.numberType}
                submitting={kycSaving}
                error={kycError}
                onSubmit={submitRequirements}
                onCancel={() => setKycOpen(false)}
              />
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-ds-3 py-ds-4">
                <p className="text-sm text-ds-foreground-muted">{t('calling.kyc.intro')}</p>
                <div className="flex flex-col gap-ds-2">
                  <Label htmlFor="kycBusinessName">{t('calling.kyc.businessName')}</Label>
                  <Input id="kycBusinessName" value={kycForm.businessName} onChange={(e) => setKycForm((p) => ({ ...p, businessName: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-ds-2">
                  <Label htmlFor="kycAddress">{t('calling.kyc.address')}</Label>
                  <Input id="kycAddress" value={kycForm.address} onChange={(e) => setKycForm((p) => ({ ...p, address: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-ds-2">
                  <Label htmlFor="kycRegistration">{t('calling.kyc.registration')}</Label>
                  <Input id="kycRegistration" value={kycForm.registrationNumber} onChange={(e) => setKycForm((p) => ({ ...p, registrationNumber: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-ds-2">
                  <Label htmlFor="kycDocumentUrl">{t('calling.kyc.documentLink')}</Label>
                  <Input id="kycDocumentUrl" type="url" placeholder="https://" value={kycForm.documentUrl} onChange={(e) => setKycForm((p) => ({ ...p, documentUrl: e.target.value }))} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setKycOpen(false)}>{t('calling.common.cancel')}</Button>
                <Button onClick={submitKyc} disabled={kycSaving} className="gap-ds-2">
                  {kycSaving && <Loader2 className="size-4 animate-spin" />}
                  {t('calling.kyc.send')}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t('calling.numbers.remove.title')}
        description={t('calling.numbers.remove.description', { number: deleteTarget?.phoneNumber ?? t('calling.numbers.remove.thisNumber') })}
        confirmLabel={t('calling.numbers.remove.confirm')}
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
