'use client';

import * as React from 'react';
import { AlertCircle, Plus, Trash2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

import { PageContainer } from '@/components/layout/page-container';
import {
  Alert, AlertDescription, Button, CurrencyInput, Input, Label, PageHeader, SectionCard, Skeleton, Spinner, Switch, Textarea,
} from '@/components/ui';
import { publishGroupToursSettings } from '@/hooks/use-group-tours';
import { departuresApi, type ConfirmMode, type DepositType, type GroupToursSettings, type ShowSeatsLeft } from '@/lib/api/departures';
import { customFieldKey, departureErrorText } from '@/lib/departures';
import { useT } from '@/lib/i18n';
import { useAuthStore } from '@/stores/auth-store';
import { GroupToursGate } from '../../departures/_components/group-tours-gate';
import { SimpleSelect } from '../../departures/_components/simple-select';
import { IntField } from './_components/int-field';
import { MessageRules } from './_components/message-rules';
import { PassengerFieldsCard } from './_components/passenger-fields-card';

function Row({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-ds-1">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-ds-foreground-muted">{hint}</p>}
    </div>
  );
}

function SwitchRow({ label, hint, checked, onChange, disabled, testId }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; testId?: string }) {
  return (
    <label className="flex items-start justify-between gap-ds-4">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-ds-foreground-muted">{hint}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={label} data-testid={testId} />
    </label>
  );
}

/** The scheduled messages. A suggestion's link (?tab=messages&rule=...&departure=...) opens the preview of that rule on that departure. */
function ScheduledMessagesSection() {
  const params = useSearchParams();
  const ruleId = params.get('rule');
  const initial = ruleId && params.get('tab') === 'messages' ? { ruleId, departureId: params.get('departure') } : null;
  return <MessageRules initialPreview={initial} />;
}

function GroupToursSettingsForm() {
  const t = useT();
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');
  const [form, setForm] = React.useState<GroupToursSettings | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const ro = !isAdmin;

  React.useEffect(() => {
    let cancelled = false;
    departuresApi
      .getSettings()
      .then((s) => !cancelled && setForm(s))
      .catch((err) => !cancelled && setError(departureErrorText(err, t, 'groupTours.page.loadFailed')));
    return () => {
      cancelled = true;
    };
    // Load once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <PageContainer width="narrow">
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </PageContainer>
    );
  }
  if (!form) {
    return (
      <PageContainer width="narrow">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </PageContainer>
    );
  }

  const set = <K extends keyof GroupToursSettings>(key: K, value: GroupToursSettings[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      const saved = await departuresApi.saveSettings(form);
      setForm(saved);
      publishGroupToursSettings(saved); // the sidebar shows or hides Departures and Tours at once
      toast.success(t('groupTours.page.saved'));
    } catch (err) {
      toast.error(departureErrorText(err, t, 'groupTours.page.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  const confirmModes = [
    { value: 'manual', label: t('groupTours.confirmMode.manual') },
    { value: 'auto_when_available', label: t('groupTours.confirmMode.auto') },
    { value: 'on_deposit', label: t('groupTours.confirmMode.deposit') },
  ];

  return (
    <PageContainer width="narrow">
      <PageHeader
        title={t('groupTours.page.title')}
        description={t('groupTours.page.description')}
        actions={
          <Button onClick={() => void save()} disabled={saving || ro} data-testid="group-tours-save">
            {saving && <Spinner className="size-4" />}
            {t('common.save')}
          </Button>
        }
      />
      {ro && (
        <Alert>
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{t('groupTours.page.adminOnly')}</AlertDescription>
        </Alert>
      )}

      <SectionCard title={t('groupTours.switch.title')} description={t('groupTours.switch.description')}>
        <SwitchRow label={t('groupTours.switch.label')} hint={t('groupTours.switch.hint')} checked={form.enabled} disabled={ro} onChange={(v) => set('enabled', v)} testId="group-tours-enabled" />
      </SectionCard>

      <SectionCard title={t('groupTours.seats.title')} description={t('groupTours.seats.description')}>
        <div className="grid gap-ds-4 sm:grid-cols-2">
          <Row label={t('groupTours.seats.holdHours')} hint={t('groupTours.seats.holdHoursHint')} htmlFor="gt-hold">
            <IntField id="gt-hold" value={form.holdExpiryHours} min={1} max={1440} disabled={ro} onChange={(v) => set('holdExpiryHours', v)} />
          </Row>
          <Row label={t('groupTours.seats.vehicleCapacity')} hint={t('groupTours.seats.vehicleCapacityHint')} htmlFor="gt-vehicle">
            <IntField id="gt-vehicle" value={form.defaultVehicleCapacity} min={1} max={200} disabled={ro} onChange={(v) => set('defaultVehicleCapacity', v)} />
          </Row>
        </div>
      </SectionCard>

      <SectionCard title={t('groupTours.confirmation.title')} description={t('groupTours.confirmation.description')}>
        <div className="space-y-ds-4">
          <Row label={t('groupTours.confirmation.mode')} htmlFor="gt-confirm-mode">
            <SimpleSelect id="gt-confirm-mode" value={form.confirmMode} disabled={ro} onChange={(v) => set('confirmMode', (v as ConfirmMode) ?? 'manual')} options={confirmModes} className="max-w-md" />
          </Row>
          <p className="text-xs text-ds-foreground-muted">{t(`groupTours.confirmation.modeHint.${form.confirmMode}`)}</p>
          <SwitchRow label={t('groupTours.confirmation.markWon')} hint={t('groupTours.confirmation.markWonHint')} checked={form.markLeadWonOnConfirm} disabled={ro} onChange={(v) => set('markLeadWonOnConfirm', v)} />
        </div>
      </SectionCard>

      <SectionCard title={t('groupTours.waitlist.title')} description={t('groupTours.waitlist.description')}>
        <div className="space-y-ds-4">
          <SwitchRow label={t('groupTours.waitlist.enabled')} checked={form.waitlist.enabled} disabled={ro} onChange={(v) => set('waitlist', { ...form.waitlist, enabled: v })} />
          {form.waitlist.enabled && (
            <div className="grid gap-ds-4 sm:grid-cols-2">
              <Row label={t('groupTours.waitlist.offerMode')} htmlFor="gt-offer-mode">
                <SimpleSelect
                  id="gt-offer-mode"
                  value={form.waitlist.offerMode}
                  disabled={ro}
                  onChange={(v) => set('waitlist', { ...form.waitlist, offerMode: (v as 'suggest' | 'auto_hold') ?? 'suggest' })}
                  options={[
                    { value: 'suggest', label: t('groupTours.waitlist.suggest') },
                    { value: 'auto_hold', label: t('groupTours.waitlist.autoHold') },
                  ]}
                />
              </Row>
              <Row label={t('groupTours.waitlist.offerHours')} htmlFor="gt-offer-hours">
                <IntField id="gt-offer-hours" value={form.waitlist.offerHoldHours} min={1} max={720} disabled={ro} onChange={(v) => set('waitlist', { ...form.waitlist, offerHoldHours: v })} />
              </Row>
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title={t('groupTours.rules.title')} description={t('groupTours.rules.description')}>
        <div className="grid gap-ds-4 sm:grid-cols-2">
          <Row label={t('groupTours.rules.bookingCutoff')} hint={t('groupTours.rules.bookingCutoffHint')} htmlFor="gt-booking-cutoff">
            <IntField id="gt-booking-cutoff" value={form.bookingCutoffDays} min={0} max={365} disabled={ro} onChange={(v) => set('bookingCutoffDays', v)} />
          </Row>
          <Row label={t('groupTours.rules.extrasCutoff')} hint={t('groupTours.rules.extrasCutoffHint')} htmlFor="gt-extras-cutoff">
            <IntField id="gt-extras-cutoff" value={form.extrasCutoffDays} min={0} max={365} disabled={ro} onChange={(v) => set('extrasCutoffDays', v)} />
          </Row>
        </div>
      </SectionCard>

      <React.Suspense fallback={<Skeleton className="h-24 w-full" />}>
        <ScheduledMessagesSection />
      </React.Suspense>

      <PassengerFieldsCard value={form.passengerFields} onChange={(v) => set('passengerFields', v)} disabled={ro} />

      <SectionCard title={t('groupTours.rooms.title')} description={t('groupTours.rooms.description')}>
        <div className="space-y-ds-3" data-testid="room-types-card">
          {form.roomTypes.map((r, i) => (
            <div key={r.key} className="grid items-end gap-ds-3 sm:grid-cols-[1fr_8rem_auto]">
              <Row label={t('groupTours.rooms.label')} htmlFor={`gt-room-label-${i}`}>
                <Input id={`gt-room-label-${i}`} value={r.label} disabled={ro} onChange={(e) => set('roomTypes', form.roomTypes.map((x) => (x.key === r.key ? { ...x, label: e.target.value } : x)))} />
              </Row>
              <Row label={t('groupTours.rooms.occupancy')} htmlFor={`gt-room-occ-${i}`}>
                <IntField id={`gt-room-occ-${i}`} value={r.occupancy} min={1} max={12} disabled={ro} onChange={(v) => set('roomTypes', form.roomTypes.map((x) => (x.key === r.key ? { ...x, occupancy: v } : x)))} />
              </Row>
              <Button variant="ghost" size="icon-sm" aria-label={t('groupTours.rooms.remove', { label: r.label })} disabled={ro} onClick={() => set('roomTypes', form.roomTypes.filter((x) => x.key !== r.key))}>
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={ro}
            onClick={() => {
              const label = t('groupTours.rooms.newLabel', { n: form.roomTypes.length + 1 });
              set('roomTypes', [...form.roomTypes, { key: customFieldKey(label, form.roomTypes.map((x) => x.key)), label, occupancy: 2 }]);
            }}
          >
            <Plus aria-hidden="true" /> {t('groupTours.rooms.add')}
          </Button>
          <SwitchRow label={t('groupTours.rooms.shareMatching')} hint={t('groupTours.rooms.shareMatchingHint')} checked={form.shareMatching} disabled={ro} onChange={(v) => set('shareMatching', v)} />
        </div>
      </SectionCard>

      <SectionCard title={t('groupTours.preferredSeat.title')}>
        <SwitchRow label={t('groupTours.preferredSeat.label')} hint={t('groupTours.preferredSeat.hint')} checked={form.preferredSeat.enabled} disabled={ro} onChange={(v) => set('preferredSeat', { enabled: v })} />
      </SectionCard>

      <SectionCard title={t('groupTours.shown.title')} description={t('groupTours.shown.description')}>
        <div className="grid gap-ds-4 sm:grid-cols-2">
          <Row label={t('groupTours.shown.mode')} htmlFor="gt-show-seats">
            <SimpleSelect
              id="gt-show-seats"
              value={form.showSeatsLeft}
              disabled={ro}
              onChange={(v) => set('showSeatsLeft', (v as ShowSeatsLeft) ?? 'below_threshold')}
              options={[
                { value: 'always', label: t('groupTours.shown.always') },
                { value: 'below_threshold', label: t('groupTours.shown.belowThreshold') },
                { value: 'never', label: t('groupTours.shown.never') },
              ]}
            />
          </Row>
          {form.showSeatsLeft === 'below_threshold' && (
            <Row label={t('groupTours.shown.threshold')} hint={t('groupTours.shown.thresholdHint')} htmlFor="gt-threshold">
              <IntField id="gt-threshold" value={form.seatsLeftThreshold} min={1} max={500} disabled={ro} onChange={(v) => set('seatsLeftThreshold', v)} />
            </Row>
          )}
        </div>
      </SectionCard>

      <SectionCard title={t('groupTours.deposit.title')} description={t('groupTours.deposit.description')}>
        <div className="grid gap-ds-4 sm:grid-cols-2">
          <Row label={t('groupTours.deposit.type')} htmlFor="gt-deposit-type">
            <SimpleSelect
              id="gt-deposit-type"
              value={form.deposit.type}
              disabled={ro}
              onChange={(v) => set('deposit', { type: (v as DepositType) ?? 'none', value: v && v !== 'none' ? form.deposit.value : null })}
              options={[
                { value: 'none', label: t('groupTours.deposit.none') },
                { value: 'percent', label: t('groupTours.deposit.percent') },
                { value: 'per_seat', label: t('groupTours.deposit.perSeat') },
                { value: 'fixed', label: t('groupTours.deposit.fixed') },
              ]}
            />
          </Row>
          {form.deposit.type !== 'none' && (
            <Row label={t('groupTours.deposit.value')} htmlFor="gt-deposit-value">
              {form.deposit.type === 'percent' ? (
                <Input
                  id="gt-deposit-value"
                  type="number"
                  min={0}
                  max={100}
                  disabled={ro}
                  value={form.deposit.value ?? ''}
                  onChange={(e) => set('deposit', { ...form.deposit, value: e.target.value === '' ? null : Number(e.target.value) })}
                />
              ) : (
                <CurrencyInput id="gt-deposit-value" disabled={ro} value={form.deposit.value ?? undefined} onChange={(v) => set('deposit', { ...form.deposit, value: v ?? null })} />
              )}
            </Row>
          )}
        </div>
      </SectionCard>

      <SectionCard title={t('groupTours.terms.title')} description={t('groupTours.terms.description')}>
        <div className="space-y-ds-4">
          <SwitchRow label={t('groupTours.terms.require')} checked={form.publicBooking.requireTerms} disabled={ro} onChange={(v) => set('publicBooking', { ...form.publicBooking, requireTerms: v })} />
          <Row label={t('groupTours.terms.text')} hint={t('groupTours.terms.textHint')} htmlFor="gt-terms">
            <Textarea id="gt-terms" rows={4} disabled={ro} value={form.publicBooking.termsText} onChange={(e) => set('publicBooking', { ...form.publicBooking, termsText: e.target.value })} />
          </Row>
          <SwitchRow label={t('groupTours.terms.marketing')} hint={t('groupTours.terms.marketingHint')} checked={form.publicBooking.marketingOptIn} disabled={ro} onChange={(v) => set('publicBooking', { ...form.publicBooking, marketingOptIn: v })} />
        </div>
      </SectionCard>

      <SectionCard title={t('groupTours.crew.title')}>
        <SwitchRow label={t('groupTours.crew.driverSeesPassengers')} hint={t('groupTours.crew.driverSeesPassengersHint')} checked={form.driverSeesPassengers} disabled={ro} onChange={(v) => set('driverSeesPassengers', v)} />
      </SectionCard>
    </PageContainer>
  );
}

export default function GroupToursSettingsPage() {
  // Reachable with the agency switch off: that is where it is turned on. Only the plan decides here.
  return (
    <GroupToursGate requireEnabled={false}>
      <GroupToursSettingsForm />
    </GroupToursGate>
  );
}
