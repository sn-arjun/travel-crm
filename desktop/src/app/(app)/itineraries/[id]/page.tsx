'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Mail, MessageSquare, Copy, Download, MapPin, Calendar, Users, Loader2, Trash2, Plus, Link2, Link2Off,
  Eye, Pencil, FileText, MoreHorizontal,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { PageContainer } from '@/components/layout/page-container';
import { AssistantPanel } from '@/components/domain/assistant/assistant-panel';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/page-header';
import { cn, formatCurrency } from '@/lib/utils';
import { useApiQuery } from '@/hooks/use-api';
import {
  itinerariesApi, toItineraryDetail, formatDestination, errorMessage,
  type ItineraryItem, type ItineraryVersion,
} from '@/lib/api/itineraries';
import { leadsApi } from '@/lib/api/leads';
import { unwrapEntity, unwrapList } from '@/lib/api/envelope';
import { formatDisplayDate, parseLocalDate } from '@/lib/dates';
import {
  SendMessageDialog, type MessageVariables,
} from '@/components/communication/send-message-dialog';
import { useAuthStore } from '@/stores/auth-store';
import { getApiBaseUrl } from '@/lib/api/config';

/** Trip facts the itinerary borrows from its lead. */
interface LeadTrip {
  destinations?: string[];
  destination?: unknown;
  travelDate?: string | null;
  returnDate?: string | null;
  paxAdults?: number;
  paxChildren?: number;
  paxInfants?: number;
}

type VersionRow = ItineraryVersion & { version?: number; version_number?: number };

interface ItemDetails {
  hotelName?: string;
  airline?: string;
  activityName?: string;
  restaurantName?: string;
  checkInDate?: string;
  checkOutDate?: string;
  departureAirport?: string;
  arrivalAirport?: string;
  pickupLocation?: string;
  dropLocation?: string;
  duration?: string;
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-ds-surface-sunken text-ds-foreground-muted',
  sent: 'bg-ds-info-subtle text-ds-info-on-subtle',
  approved: 'bg-ds-success-subtle text-ds-success-on-subtle',
  rejected: 'bg-ds-danger-subtle text-ds-danger-on-subtle',
  expired: 'bg-ds-warning-subtle text-ds-warning-on-subtle',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge className={cn('border-transparent text-xs', STATUS_STYLES[status])}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

function parseDetails(value: string | undefined): ItemDetails {
  if (!value) return {};
  try {
    return JSON.parse(value) as ItemDetails;
  } catch {
    return {};
  }
}

function describeItem(item: ItineraryItem): { name: string; detail: string } {
  const d = parseDetails(item.detailsJson);
  const name = item.title || d.hotelName || d.airline || d.activityName || d.restaurantName || `${item.type} activity`;
  const detail =
    d.checkInDate && d.checkOutDate ? `${formatDisplayDate(d.checkInDate)} to ${formatDisplayDate(d.checkOutDate)}`
    : d.departureAirport && d.arrivalAirport ? `${d.departureAirport} → ${d.arrivalAirport}`
    : d.pickupLocation && d.dropLocation ? `${d.pickupLocation} → ${d.dropLocation}`
    : d.duration || '';
  return { name, detail };
}

function paxSummary(lead: LeadTrip | null): string | undefined {
  if (!lead) return undefined;
  const parts: string[] = [];
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (lead.paxAdults) parts.push(plural(lead.paxAdults, 'adult', 'adults'));
  if (lead.paxChildren) parts.push(plural(lead.paxChildren, 'child', 'children'));
  if (lead.paxInfants) parts.push(plural(lead.paxInfants, 'infant', 'infants'));
  return parts.length > 0 ? parts.join(', ') : undefined;
}

export default function ItineraryDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { confirm, dialog: confirmDialog } = useConfirm();

  // RBAC: get user role from auth store
  const role = useAuthStore((s) => s.user?.role ?? '') as string;
  const canSeeCost = role === 'admin' || role === 'sales_manager' || role === 'manager';

  const [sendDialogOpen, setSendDialogOpen] = React.useState(false);
  const [sendChannel, setSendChannel] = React.useState<'email' | 'whatsapp'>('email');

  const [shareLink, setShareLink] = React.useState<string | null>(null);
  const [shareLinkLoading, setShareLinkLoading] = React.useState(false);
  const [deleteLoading, setDeleteLoading] = React.useState(false);
  const [cloneLoading, setCloneLoading] = React.useState(false);
  const [createVersionLoading, setCreateVersionLoading] = React.useState(false);

  const { data: itinerary, loading, error } = useApiQuery(
    () => itinerariesApi.getById(id).then(toItineraryDetail),
    [id],
  );

  const leadId = itinerary?.leadId;
  const { data: leadTrip } = useApiQuery<LeadTrip | null>(
    () => (leadId ? leadsApi.getById(leadId).then((res) => unwrapEntity<LeadTrip>(res)) : Promise.resolve(null)),
    [leadId],
  );

  const { data: versionsData, loading: versionsLoading, refetch: refetchVersions } = useApiQuery<VersionRow[]>(
    () => itinerariesApi.getVersions(id).then((res) => unwrapList<VersionRow>(res).data),
    [id],
  );
  const versions = versionsData ?? [];

  const handleClone = async () => {
    setCloneLoading(true);
    try {
      const result = unwrapEntity<{ id?: string }>(await itinerariesApi.clone(id, {}));
      if (result?.id) {
        toast.success('Itinerary cloned successfully');
        router.push(`/itineraries/${result.id}`);
      } else {
        toast.error('Failed to clone itinerary');
      }
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to clone itinerary'));
    } finally {
      setCloneLoading(false);
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Delete itinerary',
      description: 'Delete this itinerary? This action cannot be undone.',
      tone: 'destructive',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    setDeleteLoading(true);
    try {
      await itinerariesApi.delete(id);
      toast.success('Itinerary deleted successfully');
      router.push('/itineraries');
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to delete itinerary'));
      setDeleteLoading(false);
    }
  };

  const handleCreateVersion = async () => {
    setCreateVersionLoading(true);
    try {
      const result = unwrapEntity<{ id?: string }>(await itinerariesApi.createNewVersion(id, {}));
      toast.success('New version created');
      if (result?.id) router.push(`/itineraries/${result.id}`);
      else void refetchVersions();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to create new version'));
    } finally {
      setCreateVersionLoading(false);
    }
  };

  const handleGenerateShareLink = async () => {
    setShareLinkLoading(true);
    try {
      const result = unwrapEntity<{ shareUrl?: string; link?: string; url?: string }>(
        await itinerariesApi.createShareLink(id, { expiryDays: 30, accessLevel: 'view' }),
      );
      const url = result?.shareUrl ?? result?.link ?? result?.url;
      if (url) {
        setShareLink(url);
        try {
          await navigator.clipboard.writeText(url);
          toast.success('Share link generated and copied to clipboard');
        } catch {
          toast.success('Share link generated');
        }
      } else {
        toast.error('Failed to generate share link');
      }
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to generate share link'));
    } finally {
      setShareLinkLoading(false);
    }
  };

  const handleRevokeShareLink = async () => {
    setShareLinkLoading(true);
    try {
      await itinerariesApi.revokeShareLink(id);
      setShareLink(null);
      toast.success('Share link revoked');
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to revoke share link'));
    } finally {
      setShareLinkLoading(false);
    }
  };

  const handlePdfPreview = () => router.push(`/itineraries/${id}/pdf`);

  const handlePdfDownload = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : '';
    window.open(`${getApiBaseUrl()}/itineraries/${id}/pdf${token ? `?token=${token}` : ''}`, '_blank');
    toast.success('PDF download started');
  };

  const days = React.useMemo(() => itinerary?.days ?? [], [itinerary]);
  const daysCount = days.length || 1;
  const nightsCount = Math.max(0, daysCount - 1);
  const currency = itinerary?.currency ?? 'INR';
  const money = (n: number) => formatCurrency(n, currency);

  const destination = formatDestination(leadTrip?.destinations ?? leadTrip?.destination ?? itinerary?.lead?.destination);
  const contact = itinerary?.contact ?? {};
  const contactName = contact.name ?? '';
  const totalCost = itinerary?.totalCost ?? 0;
  const totalSelling = itinerary?.totalSelling ?? itinerary?.grandTotal ?? 0;
  const grandTotal = itinerary?.grandTotal ?? 0;
  const margin = totalSelling - totalCost;
  const marginPct = totalSelling > 0 ? ((margin / totalSelling) * 100).toFixed(1) : '0';

  const travelStart = leadTrip?.travelDate ? parseLocalDate(leadTrip.travelDate) : null;
  const travelEnd = React.useMemo(() => {
    if (leadTrip?.returnDate) return parseLocalDate(leadTrip.returnDate);
    if (!travelStart || Number.isNaN(travelStart.getTime())) return null;
    const end = new Date(travelStart);
    end.setDate(end.getDate() + nightsCount);
    return end;
  }, [leadTrip?.returnDate, travelStart, nightsCount]);
  const validTravel = travelStart !== null && !Number.isNaN(travelStart.getTime());

  // Recipient and placeholder values for the Communication Hub composer
  const recipient = {
    id: contact.id ?? itinerary?.leadId ?? id,
    name: contactName || itinerary?.lead?.title || 'Client',
    email: contact.email ?? null,
    phone: contact.phone ?? null,
  };
  const messageVariables = React.useMemo<MessageVariables>(
    () => ({
      destination,
      travel_date: validTravel ? formatDisplayDate(travelStart) : undefined,
      return_date: travelEnd && !Number.isNaN(travelEnd.getTime()) ? formatDisplayDate(travelEnd) : undefined,
      pax_count: paxSummary(leadTrip ?? null),
      amount: grandTotal > 0 ? money(grandTotal) : undefined,
      share_link: shareLink ?? undefined,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [destination, travelStart, travelEnd, validTravel, leadTrip, grandTotal, currency, shareLink],
  );

  function openSend(channel: 'email' | 'whatsapp') {
    setSendChannel(channel);
    setSendDialogOpen(true);
  }

  if (loading) {
    return (
      <PageContainer>
        <div className="flex flex-col gap-ds-4" role="status" aria-busy="true" aria-label="Loading itinerary" data-testid="itinerary-skeleton">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </PageContainer>
    );
  }

  if (error || !itinerary) {
    return (
      <PageContainer>
        <div className="py-ds-9 text-center">
          <p className="mb-ds-4 text-ds-foreground-muted">
            {error ? `Error: ${error.message}` : 'Itinerary not found'}
          </p>
          <Button onClick={() => router.push('/itineraries')}>Back to Itineraries</Button>
        </div>
      </PageContainer>
    );
  }

  const inclusions = Array.isArray(itinerary.inclusions) ? itinerary.inclusions : [];
  const exclusions = Array.isArray(itinerary.exclusions) ? itinerary.exclusions : [];
  const termsConditions = itinerary.termsConditions ?? '';
  const shareLinkActive = itinerary.shareLinkActive ?? !!shareLink;
  const viewCount = itinerary.viewCount ?? 0;
  const lastViewedAt = itinerary.lastViewedAt ?? null;

  const metaParts = [
    `${daysCount}D/${nightsCount}N`,
    destination,
    contactName,
  ].filter(Boolean);

  return (
    <PageContainer>
      <PageHeader
        title={itinerary.title}
        badge={<StatusBadge status={itinerary.status ?? 'draft'} />}
        breadcrumbs={[{ label: 'Itineraries', href: '/itineraries' }, { label: itinerary.title }]}
        description={metaParts.join(' · ')}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => router.push(`/itineraries/${id}/edit`)}>
              <Pencil className="size-4 mr-1" aria-hidden="true" /> Edit
            </Button>
            <Button variant="outline" size="sm" disabled={deleteLoading} onClick={() => openSend('email')}>
              <Mail className="size-4 mr-1" aria-hidden="true" /> Email
            </Button>
            <Button variant="outline" size="sm" disabled={deleteLoading} onClick={() => openSend('whatsapp')}>
              <MessageSquare className="size-4 mr-1" aria-hidden="true" /> WhatsApp
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" aria-label="More actions">
                  <MoreHorizontal className="size-4 mr-1" aria-hidden="true" /> More
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={handlePdfPreview}>
                  <FileText className="size-4" aria-hidden="true" /> Preview PDF
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handlePdfDownload}>
                  <Download className="size-4" aria-hidden="true" /> Download PDF
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void handleClone()} disabled={cloneLoading}>
                  <Copy className="size-4" aria-hidden="true" /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => void handleDelete()} disabled={deleteLoading}>
                  <Trash2 className="size-4" aria-hidden="true" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <SendMessageDialog
        open={sendDialogOpen}
        onOpenChange={setSendDialogOpen}
        contact={recipient}
        defaultChannel={sendChannel}
        variables={messageVariables}
      />
      {confirmDialog}

      <AssistantPanel leadId={leadId ?? undefined} entityType="itinerary" entityId={id} />

      <Tabs defaultValue="itinerary">
        <TabsList>
          <TabsTrigger value="itinerary">Itinerary</TabsTrigger>
          {canSeeCost && <TabsTrigger value="costs">Costs</TabsTrigger>}
          <TabsTrigger value="versions">Versions</TabsTrigger>
          <TabsTrigger value="share">Share</TabsTrigger>
        </TabsList>

        {/* Itinerary Tab */}
        <TabsContent value="itinerary">
          <div className="max-w-4xl space-y-ds-4">
            <div className={cn('grid gap-ds-4', canSeeCost ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2')}>
              <Card>
                <CardContent>
                  <div className="mb-1 flex items-center gap-1 text-xs text-ds-foreground-muted"><Calendar className="size-3.5" aria-hidden="true" /> Travel Dates</div>
                  <p className="text-sm font-semibold">
                    {validTravel && travelEnd
                      ? `${formatDisplayDate(travelStart, 'short')} - ${formatDisplayDate(travelEnd)}`
                      : 'Not set'}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <div className="mb-1 flex items-center gap-1 text-xs text-ds-foreground-muted"><MapPin className="size-3.5" aria-hidden="true" /> Duration</div>
                  <p className="text-sm font-semibold">{daysCount} Days / {nightsCount} Nights</p>
                </CardContent>
              </Card>
              {canSeeCost && (
                <>
                  <Card>
                    <CardContent>
                      <div className="mb-1 text-xs text-ds-foreground-muted">Total Cost</div>
                      <p className="text-sm font-semibold">{money(totalCost)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent>
                      <div className="mb-1 flex items-center gap-1 text-xs text-ds-foreground-muted"><Users className="size-3.5" aria-hidden="true" /> Grand Total</div>
                      <p className="text-sm font-semibold text-ds-success">{money(grandTotal)}</p>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>

            {inclusions.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-ds-success">Inclusions</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-inside list-disc space-y-1 text-sm">
                    {inclusions.map((item, idx) => <li key={idx}>{item}</li>)}
                  </ul>
                </CardContent>
              </Card>
            )}

            {exclusions.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-ds-danger">Exclusions</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-inside list-disc space-y-1 text-sm">
                    {exclusions.map((item, idx) => <li key={idx}>{item}</li>)}
                  </ul>
                </CardContent>
              </Card>
            )}

            <div className="space-y-ds-3">
              {days.length > 0 ? (
                days.map((day, idx) => {
                  const items = day.items ?? [];
                  return (
                    <Card key={day.id ?? idx}>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">
                          Day {day.dayNumber ?? idx + 1}{day.title ? ` - ${day.title}` : ''}
                          {day.city && <span className="ml-2 text-sm font-normal text-ds-foreground-muted">({day.city})</span>}
                        </CardTitle>
                        {day.description && (
                          <div
                            className="prose prose-sm mt-1 max-w-none text-sm text-ds-foreground-muted dark:prose-invert"
                            dangerouslySetInnerHTML={{ __html: day.description }}
                          />
                        )}
                      </CardHeader>
                      <CardContent className="space-y-ds-2">
                        {items.length > 0 ? (
                          items.map((item, itemIdx) => {
                            const { name, detail } = describeItem(item);
                            const unit = item.sellingPrice || item.costPrice || 0;
                            return (
                              <div key={item.id ?? itemIdx} className="flex gap-ds-3 rounded-lg bg-ds-surface-sunken p-ds-3">
                                <div className="min-w-0 flex-1 text-sm">
                                  <p className="font-medium">{name}</p>
                                  {detail && <p className="text-xs text-ds-foreground-muted">{detail}</p>}
                                  {canSeeCost && unit > 0 && (
                                    <p className="mt-1 text-xs text-ds-foreground-muted">
                                      {money(unit)}
                                      {(item.quantity ?? 1) > 1 && ` x ${item.quantity}`}
                                    </p>
                                  )}
                                </div>
                                <Badge variant="outline" className="h-fit text-xs capitalize">{item.type}</Badge>
                              </div>
                            );
                          })
                        ) : (
                          <p className="text-sm italic text-ds-foreground-muted">No activities planned</p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })
              ) : (
                <Card>
                  <CardContent>
                    <p className="text-sm italic text-ds-foreground-muted">No days planned yet</p>
                  </CardContent>
                </Card>
              )}
            </div>

            {termsConditions && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Terms & Conditions</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-sm text-ds-foreground-muted">{termsConditions}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Costs Tab (only visible to authorized roles) */}
        {canSeeCost && (
          <TabsContent value="costs">
            <div className="max-w-4xl">
              <Card>
                <CardHeader><CardTitle className="text-base">Cost Breakdown</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-ds-4">
                    <div className="space-y-ds-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-ds-foreground-muted">Total Cost:</span>
                        <span className="font-medium">{money(totalCost)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ds-foreground-muted">Total Selling:</span>
                        <span className="font-medium">{money(totalSelling)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ds-foreground-muted">Tax:</span>
                        <span className="font-medium">{money(itinerary.totalTax ?? 0)}</span>
                      </div>
                      <div className="flex justify-between border-t border-ds-border pt-ds-2 font-semibold">
                        <span>Grand Total:</span>
                        <span className="text-ds-success">{money(grandTotal)}</span>
                      </div>
                      <div className="flex justify-between text-sm font-semibold">
                        <span>Margin ({marginPct}%):</span>
                        <span className={cn(margin > 0 ? 'text-ds-success' : 'text-ds-danger')}>{money(margin)}</span>
                      </div>
                    </div>

                    {days.some((d) => (d.items ?? []).length > 0) && (
                      <div className="border-t border-ds-border pt-ds-4">
                        <h4 className="mb-ds-3 text-sm font-semibold">Items by Day</h4>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Day</TableHead>
                              <TableHead>Item</TableHead>
                              <TableHead className="text-right">Type</TableHead>
                              <TableHead className="text-right">Cost</TableHead>
                              <TableHead className="text-right">Selling</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {days.flatMap((day, dayIdx) =>
                              (day.items ?? []).map((item, itemIdx) => (
                                <TableRow key={`${dayIdx}-${itemIdx}`}>
                                  <TableCell className="text-sm">Day {day.dayNumber ?? dayIdx + 1}</TableCell>
                                  <TableCell className="text-sm">{item.title || 'Item'}</TableCell>
                                  <TableCell className="text-right text-sm capitalize">{item.type}</TableCell>
                                  <TableCell className="text-right text-sm">{money(item.costPrice ?? 0)}</TableCell>
                                  <TableCell className="text-right text-sm">{money(item.sellingPrice ?? 0)}</TableCell>
                                </TableRow>
                              )),
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        )}

        {/* Versions Tab */}
        <TabsContent value="versions">
          <div className="max-w-4xl">
            <div className="mb-ds-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ds-foreground-muted">Version History</h3>
              <Button size="sm" onClick={() => void handleCreateVersion()} disabled={createVersionLoading}>
                {createVersionLoading ? <Loader2 className="size-4 animate-spin mr-1" aria-hidden="true" /> : <Plus className="size-4 mr-1" aria-hidden="true" />}
                Create New Version
              </Button>
            </div>

            <div className="space-y-ds-3">
              <Card className="border-ds-primary bg-ds-primary-subtle">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      Version {itinerary.version ?? 1} <Badge className="ml-2">Current</Badge>
                    </CardTitle>
                    <span className="text-xs text-ds-foreground-muted">
                      {itinerary.createdAt ? formatDisplayDate(itinerary.createdAt) : 'Recently'}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-ds-foreground-muted">
                    Current version - {daysCount} day itinerary{destination ? ` for ${destination}` : ''}
                  </p>
                </CardContent>
              </Card>

              {versionsLoading && (
                <div className="flex items-center justify-center py-ds-6">
                  <Loader2 className="size-6 animate-spin text-ds-foreground-subtle" aria-label="Loading versions" />
                </div>
              )}

              {!versionsLoading && versions.map((ver) => (
                <Card
                  key={ver.id}
                  className="cursor-pointer transition-shadow hover:shadow-sm"
                  onClick={() => router.push(`/itineraries/${ver.id}`)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">
                        Version {ver.versionNumber ?? ver.version_number ?? ver.version ?? '?'}
                      </CardTitle>
                      <span className="text-xs text-ds-foreground-muted">
                        {ver.createdAt ? formatDisplayDate(ver.createdAt) : ''}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-ds-foreground-muted">
                      {ver.changes ?? 'Saved snapshot'}
                    </p>
                  </CardContent>
                </Card>
              ))}

              {!versionsLoading && versions.length === 0 && (
                <p className="mt-ds-4 text-sm italic text-ds-foreground-muted">
                  No previous versions. Click &quot;Create New Version&quot; to save a snapshot.
                </p>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Share Tab */}
        <TabsContent value="share">
          <div className="max-w-2xl space-y-ds-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Public Share Link</CardTitle></CardHeader>
              <CardContent className="space-y-ds-4">
                {(shareLinkActive || shareLink) ? (
                  <div className="space-y-ds-3">
                    <div className="flex gap-ds-2">
                      <Input
                        readOnly
                        aria-label="Share link"
                        value={shareLink ?? 'Share link generated - click Regenerate to get a new URL'}
                        className="flex-1 bg-ds-surface-sunken"
                      />
                      {shareLink && (
                        <Button
                          size="sm"
                          variant="outline"
                          aria-label="Copy share link"
                          onClick={() => {
                            void navigator.clipboard.writeText(shareLink).then(
                              () => toast.success('Link copied to clipboard'),
                              () => toast.error('Could not copy the link'),
                            );
                          }}
                        >
                          <Copy className="size-4" aria-hidden="true" />
                        </Button>
                      )}
                    </div>
                    {viewCount > 0 && (
                      <div className="flex items-center gap-ds-4 text-xs text-ds-foreground-muted">
                        <span className="flex items-center gap-1"><Eye className="size-3.5" aria-hidden="true" /> {viewCount} views</span>
                        {lastViewedAt && <span>Last viewed: {formatDisplayDate(lastViewedAt)}</span>}
                      </div>
                    )}
                    <div className="flex gap-ds-2">
                      <Button variant="outline" size="sm" onClick={() => void handleGenerateShareLink()} disabled={shareLinkLoading}>
                        {shareLinkLoading ? <Loader2 className="size-4 animate-spin mr-1" aria-hidden="true" /> : <Link2 className="size-4 mr-1" aria-hidden="true" />}
                        Regenerate Link
                      </Button>
                      <Button variant="outline" size="sm" className="text-ds-danger" onClick={() => void handleRevokeShareLink()} disabled={shareLinkLoading}>
                        {shareLinkLoading ? <Loader2 className="size-4 animate-spin mr-1" aria-hidden="true" /> : <Link2Off className="size-4 mr-1" aria-hidden="true" />}
                        Revoke Link
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-ds-3">
                    <p className="text-sm text-ds-foreground-muted">
                      Generate a public link that clients can use to view this itinerary.
                    </p>
                    <Button size="sm" onClick={() => void handleGenerateShareLink()} disabled={shareLinkLoading}>
                      {shareLinkLoading ? <Loader2 className="size-4 animate-spin mr-1" aria-hidden="true" /> : <Link2 className="size-4 mr-1" aria-hidden="true" />}
                      Generate Share Link
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Send to Client</CardTitle></CardHeader>
              <CardContent className="space-y-ds-3">
                <p className="text-xs text-ds-foreground-muted">
                  Sent through the Communication Hub with a template you can edit, and logged against the client&apos;s record.
                </p>
                <div className="flex gap-ds-2">
                  <Button size="sm" variant="outline" className="flex-1" disabled={!recipient.email} onClick={() => openSend('email')}>
                    <Mail className="size-4 mr-1" aria-hidden="true" /> Send via Email
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1" disabled={!recipient.phone} onClick={() => openSend('whatsapp')}>
                    <MessageSquare className="size-4 mr-1" aria-hidden="true" /> Send via WhatsApp
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Export</CardTitle></CardHeader>
              <CardContent className="space-y-ds-2">
                <div className="flex gap-ds-2">
                  <Button variant="outline" className="flex-1" onClick={handlePdfPreview}>
                    <FileText className="size-4 mr-2" aria-hidden="true" /> Preview PDF
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={handlePdfDownload}>
                    <Download className="size-4 mr-2" aria-hidden="true" /> Download PDF
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
