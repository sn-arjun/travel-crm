'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, Ticket } from 'lucide-react';

import { PageContainer } from '@/components/layout/page-container';
import {
  Alert, AlertDescription, Button, PageHeader, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui';
import { useDepartureSeatsLive } from '@/hooks/use-departure-seats-live';
import { useGroupTours } from '@/hooks/use-group-tours';
import { usePermission } from '@/hooks/use-permission';
import { departuresApi, type DepartureDetail } from '@/lib/api/departures';
import { toursApi, type TourDetail } from '@/lib/api/tours';
import { formatDisplayDate } from '@/lib/dates';
import { acceptsSeatRequests, departureErrorText, effectiveSettings } from '@/lib/departures';
import { useLocale } from '@/lib/locale';
import { useT } from '@/lib/i18n';
import { BookingDrawer } from '../_components/booking-drawer';
import { BookingsPanel } from '../_components/bookings-panel';
import { CoachTripsButton } from '../_components/coach-trips-button';
import { ManifestTab } from '../_components/manifest-tab';
import { DepartureOverview } from '../_components/departure-overview';
import { DepartureCostsTab, DeparturePricesTab, DepartureStopsTab } from '../_components/departure-data-tabs';
import { HoldSeatsDialog } from '../_components/hold-seats-dialog';
import { PublicPageCard } from '../_components/public-page-card';
import { DepartureStatusMenu } from '../_components/status-menu';
import { WaitlistPanel } from '../_components/waitlist-panel';

export default function DepartureDetailPage() {
  const t = useT();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const locale = useLocale();
  const { settings } = useGroupTours();
  const canEdit = usePermission('departures', 'edit');

  const [departure, setDeparture] = React.useState<DepartureDetail | null>(null);
  const [tour, setTour] = React.useState<TourDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState('overview');
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [holdOpen, setHoldOpen] = React.useState(false);
  const [openBooking, setOpenBooking] = React.useState<string | null>(null);

  const reload = React.useCallback(async () => {
    try {
      const d = await departuresApi.get(id);
      setDeparture(d);
      setError(null);
      return d;
    } catch (err) {
      setError(departureErrorText(err, t, 'departures.detail.loadFailed'));
      return null;
    }
  }, [id, t]);

  /** Something changed on the bookings side: the seats and every list reload. */
  const changed = React.useCallback(() => {
    void reload();
    setRefreshKey((k) => k + 1);
  }, [reload]);

  React.useEffect(() => {
    void reload();
    // Reload when another departure is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // The tour holds the passenger fields and room types that apply, and the currency.
  const tourId = departure?.tourId;
  React.useEffect(() => {
    if (!tourId) return;
    let cancelled = false;
    toursApi
      .get(tourId)
      .then((x) => !cancelled && setTour(x))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [tourId]);

  // Seat bookings are made from other screens and other people's sessions: the API announces each change, and the window
  // catches up when it is used again. The new seat counts show at once; the lists behind them are read after a short pause,
  // so a burst of changes is one read.
  const liveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => { if (liveTimer.current) clearTimeout(liveTimer.current); }, []);
  useDepartureSeatsLive((e) => {
    if (e.seats) setDeparture((d) => (d ? { ...d, seats: e.seats! } : d));
    if (liveTimer.current) clearTimeout(liveTimer.current);
    liveTimer.current = setTimeout(() => { liveTimer.current = null; changed(); }, 300);
  }, id);

  // Seat bookings are made from other screens and other people's sessions: catch up when the window is used again.
  React.useEffect(() => {
    const onFocus = () => changed();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [changed]);

  if (error) {
    return (
      <PageContainer>
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </PageContainer>
    );
  }
  if (!departure) {
    return (
      <PageContainer>
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-10 w-full max-w-xl" />
        <Skeleton className="h-64 w-full" />
      </PageContainer>
    );
  }

  const eff = settings ? effectiveSettings(departure, tour, settings) : null;
  const fields = eff?.passengerFields ?? [];
  const roomTypes = eff?.roomTypes ?? [];
  const currency = tour?.currency ?? locale.currency;
  const accepts = acceptsSeatRequests(departure.status);
  const dates = departure.endDate !== departure.startDate ? `${formatDisplayDate(departure.startDate)} - ${formatDisplayDate(departure.endDate)}` : formatDisplayDate(departure.startDate);

  return (
    <PageContainer>
      <PageHeader
        title={departure.code}
        description={[departure.tourTitle, dates].filter(Boolean).join(' · ')}
        back={
          <Button variant="ghost" size="icon-sm" aria-label={t('departures.detail.back')} onClick={() => router.push('/departures')}>
            <ArrowLeft aria-hidden="true" />
          </Button>
        }
        status={null}
        actions={
          <>
            {tour && (
              <Link href={`/tours/${tour.id}`}>
                <Button variant="outline" size="sm">{t('departures.detail.openTour')}</Button>
              </Link>
            )}
            <CoachTripsButton departure={departure} canEdit={canEdit} />
            {canEdit && (
              <Button size="sm" onClick={() => setHoldOpen(true)} disabled={!accepts} data-testid="hold-seats-header">
                <Ticket aria-hidden="true" /> {t('departures.bookings.holdSeats')}
              </Button>
            )}
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-ds-3">
        <DepartureStatusMenu departureId={departure.id} status={departure.status} disabled={!canEdit} onChanged={(d) => { setDeparture(d); setRefreshKey((k) => k + 1); }} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">{t('departures.tabs.overview')}</TabsTrigger>
          <TabsTrigger value="bookings">{t('departures.tabs.bookings')}</TabsTrigger>
          <TabsTrigger value="waitlist">{t('departures.tabs.waitlist', { count: departure.seats.waitlisted })}</TabsTrigger>
          <TabsTrigger value="stops">{t('departures.tabs.stops')}</TabsTrigger>
          <TabsTrigger value="prices">{t('departures.tabs.prices')}</TabsTrigger>
          <TabsTrigger value="costs">{t('departures.tabs.costs')}</TabsTrigger>
          <TabsTrigger value="manifest">{t('departures.tabs.manifest')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="pt-ds-4">
          <DepartureOverview key={departure.updatedAt ?? departure.id} departure={departure} tour={tour} settings={settings} canEdit={canEdit} onSaved={(d) => { setDeparture(d); }} />
          <div className="pt-ds-4">
            <PublicPageCard departure={departure} canEdit={canEdit} />
          </div>
        </TabsContent>

        <TabsContent value="bookings" className="pt-ds-4">
          <BookingsPanel departure={departure} refreshKey={refreshKey} canEdit={canEdit} onOpenBooking={setOpenBooking} onChanged={changed} onHold={() => setHoldOpen(true)} />
        </TabsContent>

        <TabsContent value="waitlist" className="pt-ds-4">
          <WaitlistPanel
            departure={departure}
            refreshKey={refreshKey}
            canEdit={canEdit}
            offerMode={settings?.waitlist.offerMode ?? 'suggest'}
            onOpenBooking={setOpenBooking}
            onChanged={changed}
            onHold={() => setHoldOpen(true)}
          />
        </TabsContent>

        <TabsContent value="stops" className="pt-ds-4">
          <DepartureStopsTab departure={departure} canEdit={canEdit} currency={currency} />
        </TabsContent>

        <TabsContent value="prices" className="pt-ds-4">
          <DeparturePricesTab departure={departure} canEdit={canEdit} currency={currency} roomTypes={roomTypes} />
        </TabsContent>

        <TabsContent value="costs" className="pt-ds-4">
          <DepartureCostsTab departure={departure} canEdit={canEdit} currency={currency} />
        </TabsContent>

        <TabsContent value="manifest" className="pt-ds-4">
          <ManifestTab departure={departure} canEdit={canEdit} roomTypes={roomTypes} refreshKey={refreshKey} onChanged={() => setRefreshKey((k) => k + 1)} />
        </TabsContent>
      </Tabs>

      <HoldSeatsDialog
        departure={departure}
        open={holdOpen}
        onOpenChange={setHoldOpen}
        onHeld={changed}
        onRefresh={() => void reload()}
        fields={fields}
        roomTypes={roomTypes}
        waitlistEnabled={settings?.waitlist.enabled ?? true}
        preferredSeat={settings?.preferredSeat.enabled}
      />

      <BookingDrawer
        bookingId={openBooking}
        departure={departure}
        fields={fields}
        roomTypes={roomTypes}
        preferredSeat={settings?.preferredSeat.enabled}
        canEdit={canEdit}
        onClose={() => setOpenBooking(null)}
        onChanged={changed}
      />
    </PageContainer>
  );
}
