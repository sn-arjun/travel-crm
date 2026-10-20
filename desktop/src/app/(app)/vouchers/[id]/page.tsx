'use client';


import { formatCalendarDay, formatLocaleDate, formatLocaleTime } from '@/lib/format';
import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Download, Pencil, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { DetailPage } from '@/components/domain';
import { SectionCard } from '@/components/ui/section-card';
import { Tag, Spinner, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Button } from '@/components/ui';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { vouchersApi, type Voucher, type UpdateVoucherStatusRequest } from '@/lib/api/vouchers';
import { fromDateOnly } from '../_date';

const DATE_FMT: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };

/** Renders stored date-only or ISO datetime strings as a readable date; leaves unparseable text as-is. */
function fmtDate(s?: string): string | undefined {
  if (!s) return s;
  const d = fromDateOnly(s);
  return d && !Number.isNaN(d.getTime()) ? formatCalendarDay(d, DATE_FMT) : s;
}

/** Like fmtDate, but keeps the time of day for stored ISO datetimes ("12 Oct 2026, 10:30 am"). */
function fmtDateTime(s?: string): string | undefined {
  if (!s) return s;
  if (!s.includes('T')) return fmtDate(s);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return `${formatLocaleDate(d, DATE_FMT)}, ${formatLocaleTime(d, { hour: 'numeric', minute: '2-digit' })}`;
}

function statusTone(status: string): 'success' | 'danger' | 'info' | 'warning' | 'neutral' {
  if (status === 'confirmed') return 'success';
  if (status === 'sent') return 'info';
  return 'neutral';
}

function DetailRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs text-ds-foreground-muted mb-0.5">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

function VoucherOverview({ voucher }: { voucher: Voucher }) {
  const d = voucher.details ?? {};
  return (
    <div className="grid gap-ds-4 sm:grid-cols-2">
      <SectionCard title="Voucher info">
        <div className="grid grid-cols-2 gap-ds-4">
          <DetailRow label="Lead" value={voucher.leadName} />
          <DetailRow label="Supplier" value={voucher.supplierName} />
          <DetailRow label="Language" value={voucher.language?.toUpperCase()} />
          <DetailRow
            label="Created"
            value={formatLocaleDate(voucher.createdAt, { day: 'numeric', month: 'short', year: 'numeric' })}
          />
          {voucher.sentVia && <DetailRow label="Sent via" value={voucher.sentVia} />}
          {voucher.notes && (
            <div className="col-span-2">
              <p className="text-xs text-ds-foreground-muted mb-0.5">Notes</p>
              <p className="text-sm whitespace-pre-wrap">{voucher.notes}</p>
            </div>
          )}
        </div>
      </SectionCard>

      {voucher.type === 'hotel' && (
        <SectionCard title="Hotel details">
          <div className="grid grid-cols-2 gap-ds-4">
            <DetailRow label="Hotel name" value={d.hotelName} />
            <DetailRow label="Address" value={d.hotelAddress} />
            <DetailRow label="Check-in" value={fmtDate(d.checkIn)} />
            <DetailRow label="Check-out" value={fmtDate(d.checkOut)} />
            <DetailRow label="Room type" value={d.roomType} />
            <DetailRow label="Meal plan" value={d.mealPlan} />
            <DetailRow label="Confirmation #" value={d.confirmationNumber} />
            {d.guestNames && d.guestNames.length > 0 && (
              <div className="col-span-2">
                <p className="text-xs text-ds-foreground-muted mb-1">Guests</p>
                <div className="flex flex-wrap gap-ds-1">
                  {d.guestNames.map((n: string) => (
                    <Tag key={n}>{n}</Tag>
                  ))}
                </div>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {voucher.type === 'transport' && (
        <SectionCard title="Transport details">
          <div className="grid grid-cols-2 gap-ds-4">
            <DetailRow label="Vehicle type" value={d.vehicleType} />
            <DetailRow label="Driver" value={d.driverName} />
            <DetailRow label="Driver phone" value={d.driverPhone} />
            <DetailRow label="Pickup location" value={d.pickupLocation} />
            <DetailRow label="Pickup time" value={fmtDateTime(d.pickupTime)} />
            <DetailRow label="Drop location" value={d.dropLocation} />
            {d.route && (
              <div className="col-span-2">
                <p className="text-xs text-ds-foreground-muted mb-0.5">Route</p>
                <p className="text-sm">{d.route}</p>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {voucher.type === 'flight' && (
        <SectionCard title="Flight details">
          <div className="grid grid-cols-2 gap-ds-4">
            <DetailRow label="Airline" value={d.airline} />
            <DetailRow label="Flight #" value={d.flightNumber} />
            <DetailRow label="PNR" value={d.pnr} />
            <DetailRow label="Class" value={d.travelClass} />
            <DetailRow label="From" value={d.departureAirport} />
            <DetailRow label="To" value={d.arrivalAirport} />
            <DetailRow label="Departure" value={fmtDateTime(d.departureTime)} />
            <DetailRow label="Arrival" value={fmtDateTime(d.arrivalTime)} />
            {d.passengers && d.passengers.length > 0 && (
              <div className="col-span-2">
                <p className="text-xs text-ds-foreground-muted mb-1">Passengers</p>
                <div className="flex flex-wrap gap-ds-1">
                  {d.passengers.map((p: { name: string }) => (
                    <Tag key={p.name}>{p.name}</Tag>
                  ))}
                </div>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {voucher.type === 'activity' && (
        <SectionCard title="Activity details">
          <div className="grid grid-cols-2 gap-ds-4">
            <DetailRow label="Activity" value={d.activityName} />
            <DetailRow label="Date/Time" value={fmtDateTime(d.dateTime)} />
            <DetailRow label="Meeting point" value={d.meetingPoint} />
            <DetailRow label="Duration" value={d.duration} />
          </div>
        </SectionCard>
      )}
    </div>
  );
}

export default function VoucherDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [confirmStatusOpen, setConfirmStatusOpen] = React.useState(false);
  const [pendingStatus, setPendingStatus] = React.useState<'sent' | 'confirmed' | null>(null);

  const { data: voucherResponse, loading, refetch } = useApiQuery(() => vouchersApi.getById(id), [id]);
  const voucher = voucherResponse?.data ?? null;

  const statusMutation = useApiMutation<UpdateVoucherStatusRequest, unknown>((data) =>
    vouchersApi.updateStatus(id, data),
  );

  const handleDownloadPdf = async () => {
    try {
      const blob = await vouchersApi.getPdf(id);
      const url = URL.createObjectURL(blob as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${voucher?.title ?? 'voucher'}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('PDF downloaded');
    } catch {
      toast.error('Failed to download PDF');
    }
  };

  const confirmStatus = async () => {
    if (!pendingStatus) return;
    const result = await statusMutation.mutate({ status: pendingStatus });
    if (result !== null) {
      toast.success(`Voucher marked as ${pendingStatus}`);
      refetch();
    } else {
      toast.error('Failed to update status');
    }
    setConfirmStatusOpen(false);
    setPendingStatus(null);
  };

  if (loading || !voucher) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner className="size-8" />
      </div>
    );
  }

  const d = voucher.details ?? {};
  const isDraft = voucher.status === 'draft';
  const isSent = voucher.status === 'sent';

  return (
    <>
      <DetailPage<Voucher>
        entity={voucher}
        title={voucher.title}
        subtitle={`${voucher.type.charAt(0).toUpperCase()}${voucher.type.slice(1)} voucher`}
        status={<Tag tone={statusTone(voucher.status)}>{voucher.status}</Tag>}
        onBack={() => router.back()}
        messaging={{
          recipientId: voucher.leadId,
          recipientName: voucher.leadName ?? 'Guest',
          email: d.guestEmail,
          phone: d.guestPhone ?? d.driverPhone,
        }}
        primaryActions={
          <>
            {isDraft && (
              <Button variant="outline" size="sm" onClick={() => router.push(`/vouchers/${id}/edit`)} className="gap-ds-2">
                <Pencil aria-hidden="true" /> Edit
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleDownloadPdf} className="gap-ds-2">
              <Download aria-hidden="true" /> PDF
            </Button>
            {isDraft && (
              <Button size="sm" onClick={() => { setPendingStatus('sent'); setConfirmStatusOpen(true); }} className="gap-ds-2">
                <CheckCircle2 aria-hidden="true" /> Mark as sent
              </Button>
            )}
            {isSent && (
              <Button size="sm" onClick={() => { setPendingStatus('confirmed'); setConfirmStatusOpen(true); }} className="gap-ds-2">
                <CheckCircle2 aria-hidden="true" /> Mark as confirmed
              </Button>
            )}
          </>
        }
        overview={<VoucherOverview voucher={voucher} />}
      />

      <Dialog open={confirmStatusOpen} onOpenChange={setConfirmStatusOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{pendingStatus === 'sent' ? 'Mark as sent?' : 'Mark as confirmed?'}</DialogTitle>
            <DialogDescription>
              {pendingStatus === 'sent'
                ? 'This updates the voucher status to Sent.'
                : 'This marks the voucher as Confirmed. This is the final status and cannot be reversed.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmStatusOpen(false)}>Cancel</Button>
            <Button onClick={confirmStatus} disabled={statusMutation.loading} className="gap-ds-2">
              {statusMutation.loading && <Spinner className="size-4" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
