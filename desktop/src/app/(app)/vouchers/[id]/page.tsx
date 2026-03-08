'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft, Edit2, Download, Loader2, CheckCircle2, Circle, Check,
  Hotel, Car, Plane, Binoculars,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { vouchersApi, type Voucher, type UpdateVoucherStatusRequest } from '@/lib/api/vouchers';
import { SendMessageDialog } from '@/components/communication/send-message-dialog';

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status?: string }) {
  const s = status ?? 'draft';
  const styles: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    confirmed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  };
  return (
    <Badge className={cn('border-transparent text-[11px]', styles[s] ?? 'bg-slate-100 text-slate-700')}>
      {s.charAt(0).toUpperCase() + s.slice(1)}
    </Badge>
  );
}

// ── Status Timeline ───────────────────────────────────────────────────────────
function StatusTimeline({ voucher }: { voucher: Voucher }) {
  const steps = [
    { key: 'draft', label: 'Draft', ts: voucher.createdAt },
    { key: 'sent', label: 'Sent', ts: voucher.sentAt },
    { key: 'confirmed', label: 'Confirmed', ts: voucher.confirmedAt },
  ];
  const currentIdx = steps.findIndex((s) => s.key === voucher.status);

  return (
    <div className="flex items-center gap-0">
      {steps.map((step, i) => {
        const isDone = i <= currentIdx;
        const isCurrent = i === currentIdx;
        return (
          <React.Fragment key={step.key}>
            <div className="flex flex-col items-center gap-1 min-w-[80px]">
              <div className={cn(
                'h-8 w-8 rounded-full flex items-center justify-center border-2 transition-colors',
                isDone
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-muted bg-background text-muted-foreground',
              )}>
                {isDone && !isCurrent ? <Check className="h-4 w-4" /> : (
                  isCurrent ? <Circle className="h-3 w-3 fill-current" /> : <Circle className="h-3 w-3" />
                )}
              </div>
              <p className={cn('text-xs font-medium', isDone ? 'text-foreground' : 'text-muted-foreground')}>
                {step.label}
              </p>
              {step.ts && isDone && (
                <p className="text-[10px] text-muted-foreground text-center">
                  {new Date(step.ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </p>
              )}
            </div>
            {i < steps.length - 1 && (
              <div className={cn(
                'flex-1 h-0.5 mb-5 transition-colors',
                i < currentIdx ? 'bg-primary' : 'bg-muted',
              )} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Type-specific detail cards ────────────────────────────────────────────────
function HotelDetails({ details }: { details: Record<string, any> }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Hotel className="h-4 w-4 text-blue-500" /> Hotel Details
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <DetailRow label="Hotel Name" value={details.hotelName} />
          <DetailRow label="Address" value={details.hotelAddress} />
          <DetailRow label="Check-in" value={details.checkIn} />
          <DetailRow label="Check-out" value={details.checkOut} />
          <DetailRow label="Room Type" value={details.roomType} />
          <DetailRow label="Room Count" value={details.roomCount?.toString()} />
          <DetailRow label="Meal Plan" value={details.mealPlan} />
          <DetailRow label="Confirmation #" value={details.confirmationNumber} />
          {details.guestNames?.length > 0 && (
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground mb-1">Guests</p>
              <div className="flex flex-wrap gap-1">
                {details.guestNames.map((n: string, i: number) => (
                  <Badge key={i} variant="secondary" className="text-xs">{n}</Badge>
                ))}
              </div>
            </div>
          )}
          {details.specialRequests && (
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground mb-1">Special Requests</p>
              <p>{details.specialRequests}</p>
            </div>
          )}
          {details.emergencyContact && (
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground mb-1">Emergency Contact</p>
              <p>{details.emergencyContact}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TransportDetails({ details }: { details: Record<string, any> }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Car className="h-4 w-4 text-amber-500" /> Transport Details
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <DetailRow label="Vehicle Type" value={details.vehicleType} />
          <DetailRow label="Driver Name" value={details.driverName} />
          <DetailRow label="Driver Phone" value={details.driverPhone} />
          <DetailRow label="Pickup Location" value={details.pickupLocation} />
          <DetailRow label="Pickup Time" value={details.pickupTime} />
          <DetailRow label="Drop Location" value={details.dropLocation} />
          {details.pickupMapsLink && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Pickup Map</p>
              <a href={details.pickupMapsLink} target="_blank" rel="noopener noreferrer" className="text-primary text-xs hover:underline">Open Map</a>
            </div>
          )}
          {details.dropMapsLink && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Drop Map</p>
              <a href={details.dropMapsLink} target="_blank" rel="noopener noreferrer" className="text-primary text-xs hover:underline">Open Map</a>
            </div>
          )}
          {details.route && (
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground mb-1">Route / Itinerary</p>
              <p>{details.route}</p>
            </div>
          )}
          {details.sightseeing?.length > 0 && (
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground mb-1">Sightseeing</p>
              <div className="flex flex-wrap gap-1">
                {details.sightseeing.map((s: string, i: number) => (
                  <Badge key={i} variant="secondary" className="text-xs">{s}</Badge>
                ))}
              </div>
            </div>
          )}
          {details.terms && (
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground mb-1">Terms</p>
              <p className="text-xs text-muted-foreground">{details.terms}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function FlightDetails({ details }: { details: Record<string, any> }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Plane className="h-4 w-4 text-violet-500" /> Flight Details
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <DetailRow label="Airline" value={details.airline} />
          <DetailRow label="Flight #" value={details.flightNumber} />
          <DetailRow label="PNR" value={details.pnr} />
          <DetailRow label="Class" value={details.travelClass} />
          <DetailRow label="From" value={`${details.departureAirport}${details.departureTerminal ? ` T${details.departureTerminal}` : ''}`} />
          <DetailRow label="To" value={`${details.arrivalAirport}${details.arrivalTerminal ? ` T${details.arrivalTerminal}` : ''}`} />
          <DetailRow label="Departure" value={details.departureTime} />
          <DetailRow label="Arrival" value={details.arrivalTime} />
          <DetailRow label="Baggage" value={details.baggageAllowance} />
          <DetailRow label="Seat Numbers" value={details.seatNumbers} />
          <DetailRow label="Meal Preference" value={details.mealPreference} />
          {details.passengers?.length > 0 && (
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground mb-2">Passengers</p>
              <div className="space-y-1">
                {details.passengers.map((p: { name: string; pnr?: string }, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1">
                    <span>{p.name}</span>
                    {p.pnr && <span className="text-muted-foreground font-mono">PNR: {p.pnr}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ActivityDetails({ details }: { details: Record<string, any> }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Binoculars className="h-4 w-4 text-green-500" /> Activity Details
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <DetailRow label="Activity" value={details.activityName} />
          <DetailRow label="Date/Time" value={details.dateTime} />
          <DetailRow label="Meeting Point" value={details.meetingPoint} />
          <DetailRow label="Duration" value={details.duration} />
          <DetailRow label="Operator Contact" value={details.operatorContact} />
          <DetailRow label="Emergency Contact" value={details.emergencyContact} />
          {details.meetingPointMapsLink && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Meeting Point Map</p>
              <a href={details.meetingPointMapsLink} target="_blank" rel="noopener noreferrer" className="text-primary text-xs hover:underline">Open Map</a>
            </div>
          )}
          {details.inclusions?.length > 0 && (
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground mb-1">Inclusions</p>
              <div className="flex flex-wrap gap-1">
                {details.inclusions.map((s: string, i: number) => (
                  <Badge key={i} variant="secondary" className="text-xs">{s}</Badge>
                ))}
              </div>
            </div>
          )}
          {details.whatToBring?.length > 0 && (
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground mb-1">What to Bring</p>
              <div className="flex flex-wrap gap-1">
                {details.whatToBring.map((s: string, i: number) => (
                  <Badge key={i} variant="outline" className="text-xs">{s}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function DetailRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function VoucherDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [sendDialogOpen, setSendDialogOpen] = React.useState(false);
  const [confirmStatusOpen, setConfirmStatusOpen] = React.useState(false);
  const [pendingStatus, setPendingStatus] = React.useState<'sent' | 'confirmed' | null>(null);

  const { data: voucherResponse, loading, error, refetch } = useApiQuery(
    () => vouchersApi.getById(id),
    [id],
  );

  const statusMutation = useApiMutation<UpdateVoucherStatusRequest, any>((data) =>
    vouchersApi.updateStatus(id, data),
  );

  const voucher: Voucher | null = React.useMemo(() => {
    if (!voucherResponse || !('data' in voucherResponse)) return null;
    return (voucherResponse.data as any) ?? null;
  }, [voucherResponse]);

  const handleStatusTransition = (status: 'sent' | 'confirmed') => {
    setPendingStatus(status);
    setConfirmStatusOpen(true);
  };

  const confirmStatus = async () => {
    if (!pendingStatus) return;
    const result = await statusMutation.mutate({ status: pendingStatus });
    if (result !== undefined) {
      toast.success(`Voucher marked as ${pendingStatus}`);
      refetch();
    } else {
      toast.error(statusMutation.error?.message ?? 'Failed to update status');
    }
    setConfirmStatusOpen(false);
    setPendingStatus(null);
  };

  const handleDownloadPdf = async () => {
    try {
      const blob = await vouchersApi.getPdf(id);
      const url = URL.createObjectURL(blob as Blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${voucher?.title ?? 'voucher'}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('PDF downloaded');
    } catch {
      toast.error('Failed to download PDF');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!voucher || error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Voucher not found</p>
          <Button onClick={() => router.push('/vouchers')}>Back to Vouchers</Button>
        </div>
      </div>
    );
  }

  const details = voucher.details ?? {};
  const isDraft = voucher.status === 'draft';
  const isSent = voucher.status === 'sent';

  // Contact info for SendMessageDialog — derive from lead name
  const sendContact = {
    id: voucher.leadId,
    name: voucher.leadName ?? 'Guest',
    email: details.guestEmail ?? null,
    phone: details.guestPhone ?? details.driverPhone ?? null,
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
              {voucher.title}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={voucher.status} />
              <span className="text-sm text-muted-foreground capitalize">{voucher.type}</span>
              {voucher.leadName && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-sm text-muted-foreground">{voucher.leadName}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isDraft && (
            <Button variant="outline" size="sm" onClick={() => router.push(`/vouchers/${id}/edit`)}>
              <Edit2 className="h-4 w-4 mr-1" /> Edit
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setSendDialogOpen(true)}>
            Send
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
            <Download className="h-4 w-4 mr-1" /> PDF
          </Button>
          {isDraft && (
            <Button size="sm" onClick={() => handleStatusTransition('sent')}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> Mark as Sent
            </Button>
          )}
          {isSent && (
            <Button size="sm" onClick={() => handleStatusTransition('confirmed')}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> Mark as Confirmed
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Status Timeline */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Status</CardTitle></CardHeader>
            <CardContent><StatusTimeline voucher={voucher} /></CardContent>
          </Card>

          {/* Type-specific detail card */}
          {voucher.type === 'hotel' && <HotelDetails details={details} />}
          {voucher.type === 'transport' && <TransportDetails details={details} />}
          {voucher.type === 'flight' && <FlightDetails details={details} />}
          {voucher.type === 'activity' && <ActivityDetails details={details} />}

          {/* Voucher metadata */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Voucher Info</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Language</p>
                  <p className="font-medium">{voucher.language?.toUpperCase() ?? 'EN'}</p>
                </div>
                {voucher.supplierName && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Supplier</p>
                    <p className="font-medium">{voucher.supplierName}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Created</p>
                  <p className="font-medium">
                    {new Date(voucher.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                {voucher.sentVia && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Sent Via</p>
                    <p className="font-medium capitalize">{voucher.sentVia}</p>
                  </div>
                )}
                {voucher.itineraryItemId && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground mb-0.5">Linked Itinerary Item</p>
                    <p className="font-medium font-mono text-xs">{voucher.itineraryItemId}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          {voucher.notes && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Notes</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{voucher.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Send Message Dialog (Communication Hub) */}
      <SendMessageDialog
        open={sendDialogOpen}
        onOpenChange={setSendDialogOpen}
        contact={sendContact}
      />

      {/* Status Confirm Dialog */}
      <Dialog open={confirmStatusOpen} onOpenChange={setConfirmStatusOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {pendingStatus === 'sent' ? 'Mark as Sent?' : 'Mark as Confirmed?'}
            </DialogTitle>
            <DialogDescription>
              {pendingStatus === 'sent'
                ? 'This will update the voucher status to Sent. The voucher can then be moved to Confirmed.'
                : 'This will mark the voucher as Confirmed. This is the final status and cannot be reversed.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmStatusOpen(false)}>Cancel</Button>
            <Button onClick={confirmStatus} disabled={statusMutation.loading}>
              {statusMutation.loading && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
