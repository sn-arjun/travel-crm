'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Mail, MessageSquare, Copy, Download, MapPin, Calendar, Users, DollarSign, Loader2, Trash2, Plus, Link2, Link2Off, ExternalLink, Eye, Pencil, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { itinerariesApi } from '@/lib/api/itineraries';
import { SendMessageDialog } from '@/components/communication/send-message-dialog';
import { useAuthStore } from '@/stores/auth-store';
import { API_BASE_URL } from '@/lib/api/config';
import type { Itinerary } from '@travelcrm/shared';


function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };
  return <Badge className={cn('border-transparent text-[11px]', styles[status])}>{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>;
}

export default function ItineraryDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  // RBAC: get user role from auth store
  const user = useAuthStore((s) => s.user);
  const role = (user as any)?.role ?? '';
  const canSeeCost = role === 'admin' || role === 'sales_manager' || role === 'manager';

  // Send dialog state
  const [sendDialogOpen, setSendDialogOpen] = React.useState(false);
  const [sendChannel, setSendChannel] = React.useState<'email' | 'whatsapp'>('email');

  // Share link state
  const [shareLink, setShareLink] = React.useState<string | null>(null);
  const [shareLinkLoading, setShareLinkLoading] = React.useState(false);

  const { data: itinerary, loading, error, refetch } = useApiQuery(
    () => itinerariesApi.getById(id).then(res => {
      if (res && typeof res === 'object' && 'data' in res) {
        return (res as any).data as Itinerary;
      }
      return res as Itinerary;
    }),
    [id],
  );

  const { mutate: deleteItinerary, loading: deleteLoading } = useApiMutation(
    (itemId: string) => itinerariesApi.delete(itemId),
  );

  const { mutate: cloneItinerary, loading: cloneLoading } = useApiMutation(
    (itemId: string) => itinerariesApi.clone(itemId, {}).then(res => {
      if (res && typeof res === 'object' && 'data' in res) {
        return (res as any).data;
      }
      return res;
    }),
  );

  // Versions
  const { data: versionsData, loading: versionsLoading, refetch: refetchVersions } = useApiQuery(
    () => itinerariesApi.getVersions(id).then(res => {
      if (res && typeof res === 'object' && 'data' in res) {
        const d = (res as any).data;
        if (Array.isArray(d)) return d;
        if (d && typeof d === 'object' && 'data' in d && Array.isArray(d.data)) return d.data;
        return [];
      }
      return [];
    }),
    [id],
  );

  const versions = versionsData ?? [];

  const { mutate: createVersion, loading: createVersionLoading } = useApiMutation(
    (itemId: string) => itinerariesApi.createNewVersion(itemId, {}).then(res => {
      if (res && typeof res === 'object' && 'data' in res) {
        return (res as any).data;
      }
      return res;
    }),
  );

  const handleClone = async () => {
    try {
      const result = await cloneItinerary(id);
      if (result && typeof result === 'object' && 'id' in result) {
        toast.success('Itinerary cloned successfully');
        router.push(`/itineraries/${(result as any).id}`);
      } else {
        toast.error('Failed to clone itinerary');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to clone itinerary';
      toast.error(errorMsg);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this itinerary? This action cannot be undone.')) {
      return;
    }
    try {
      await deleteItinerary(id);
      toast.success('Itinerary deleted successfully');
      router.push('/itineraries');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to delete itinerary';
      toast.error(errorMsg);
    }
  };

  // Create new version handler
  const handleCreateVersion = async () => {
    try {
      const result = await createVersion(id);
      if (result && typeof result === 'object' && 'id' in result) {
        toast.success('New version created');
        router.push(`/itineraries/${(result as any).id}`);
      } else {
        toast.success('New version created');
        refetchVersions();
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create new version';
      toast.error(errorMsg);
    }
  };

  // Generate share link handler
  const handleGenerateShareLink = async () => {
    setShareLinkLoading(true);
    try {
      const result = await itinerariesApi.createShareLink(id, { expiryDays: 30, accessLevel: 'view' });
      const data = (result as any)?.data ?? result;
      // Backend returns { shareUrl, shareToken }
      const url = data?.shareUrl ?? data?.link ?? data?.url;
      if (url) {
        setShareLink(url);
        await navigator.clipboard.writeText(url);
        toast.success('Share link generated and copied to clipboard');
      } else {
        toast.error('Failed to generate share link');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to generate share link';
      toast.error(errorMsg);
    } finally {
      setShareLinkLoading(false);
    }
  };

  // Revoke share link handler
  const handleRevokeShareLink = async () => {
    setShareLinkLoading(true);
    try {
      await itinerariesApi.revokeShareLink(id);
      setShareLink(null);
      toast.success('Share link revoked');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to revoke share link';
      toast.error(errorMsg);
    } finally {
      setShareLinkLoading(false);
    }
  };

  // PDF preview handler (opens in-app preview page)
  const handlePdfPreview = () => {
    router.push(`/itineraries/${id}/pdf`);
  };

  // PDF download handler (downloads actual PDF from backend)
  const handlePdfDownload = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : '';
    const url = `${API_BASE_URL}/itineraries/${id}/pdf${token ? `?token=${token}` : ''}`;
    window.open(url, '_blank');
    toast.success('PDF download started');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !itinerary) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">
            {error ? `Error: ${error.message}` : 'Itinerary not found'}
          </p>
          <Button onClick={() => router.push('/itineraries')}>Back to Itineraries</Button>
        </div>
      </div>
    );
  }

  // Backend returns days at root level with items inside each day
  const itin = itinerary as any;
  const days = itin.days ?? [];
  const inclusions: string[] = Array.isArray(itin.inclusions) ? itin.inclusions : [];
  const exclusions: string[] = Array.isArray(itin.exclusions) ? itin.exclusions : [];
  const termsConditions: string = itin.termsConditions ?? '';

  // Use backend-calculated totals
  const totalCost = itin.totalCost ?? 0;
  const totalSelling = itin.totalSelling ?? itin.grandTotal ?? 0;
  const grandTotal = itin.grandTotal ?? 0;
  const margin = totalSelling - totalCost;
  const marginPct = totalSelling > 0 ? ((margin / totalSelling) * 100).toFixed(1) : '0';
  const currency = itin.currency ?? 'INR';
  const currencySymbol = currency === 'INR' ? '\u20B9' : currency === 'USD' ? '$' : currency === 'EUR' ? '\u20AC' : currency + ' ';

  // Build contact object for SendMessageDialog from lead/contact data
  const contact = itin.contact ?? {};
  const lead = itin.lead ?? {};
  const leadContact = {
    id: contact.id ?? lead.id ?? id,
    name: contact.name ?? lead.title ?? 'Client',
    email: contact.email ?? null,
    phone: contact.phone ?? null,
  };

  // Share link active state
  const shareLinkActive = itin.shareLinkActive ?? !!shareLink;
  const viewCount = itin.viewCount ?? 0;
  const lastViewedAt = itin.lastViewedAt ?? null;

  // Calculate days count for duration display
  const daysCount = days.length || 1;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon-sm" onClick={() => router.push('/itineraries')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>{itinerary.title}</h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
              <StatusBadge status={itinerary.status ?? 'draft'} />
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {daysCount}D/{Math.max(0, daysCount - 1)}N
              </span>
              {lead.destination && (
                <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{lead.destination}</span>
              )}
              {contact.name && (
                <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{contact.name}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Edit button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/itineraries/${id}/edit`)}
          >
            <Pencil className="h-4 w-4 mr-1" /> Edit
          </Button>
          {/* Email button */}
          <Button
            variant="outline"
            size="sm"
            disabled={deleteLoading}
            onClick={() => { setSendChannel('email'); setSendDialogOpen(true); }}
          >
            <Mail className="h-4 w-4 mr-1" /> Email
          </Button>
          {/* WhatsApp button */}
          <Button
            variant="outline"
            size="sm"
            disabled={deleteLoading}
            onClick={() => { setSendChannel('whatsapp'); setSendDialogOpen(true); }}
          >
            <MessageSquare className="h-4 w-4 mr-1" /> WhatsApp
          </Button>
          {/* Preview PDF button */}
          <Button variant="outline" size="sm" disabled={deleteLoading} onClick={handlePdfPreview}>
            <FileText className="h-4 w-4 mr-1" /> Preview PDF
          </Button>
          {/* Download PDF button */}
          <Button variant="outline" size="sm" disabled={deleteLoading} onClick={handlePdfDownload}>
            <Download className="h-4 w-4 mr-1" /> Download PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handleClone} disabled={cloneLoading}>
            <Copy className="h-4 w-4 mr-1" /> Duplicate
          </Button>
          <Button variant="outline" size="sm" onClick={handleDelete} disabled={deleteLoading} className="text-red-600">
            <Trash2 className="h-4 w-4 mr-1" /> Delete
          </Button>
        </div>
      </div>

      {/* SendMessageDialog */}
      <SendMessageDialog
        open={sendDialogOpen}
        onOpenChange={setSendDialogOpen}
        contact={leadContact}
        defaultChannel={sendChannel}
      />

      {/* Tabs */}
      <div className="flex-1 overflow-auto">
        <Tabs defaultValue="itinerary" className="h-full flex flex-col">
          <TabsList className="px-6 py-3 border-b rounded-none w-full justify-start">
            <TabsTrigger value="itinerary">Itinerary</TabsTrigger>
            {canSeeCost && <TabsTrigger value="costs">Costs</TabsTrigger>}
            <TabsTrigger value="versions">Versions</TabsTrigger>
            <TabsTrigger value="share">Share</TabsTrigger>
          </TabsList>

          {/* Itinerary Tab */}
          <TabsContent value="itinerary" className="flex-1 overflow-auto p-6">
            <div className="max-w-4xl mx-auto space-y-4">
              {/* Summary Cards */}
              <div className={cn('grid gap-4 mb-6', canSeeCost ? 'grid-cols-4' : 'grid-cols-2')}>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-xs text-muted-foreground mb-1">Travel Dates</div>
                    <p className="font-semibold text-sm">
                      {itinerary.startDate && itinerary.endDate
                        ? `${new Date(itinerary.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} - ${new Date(itinerary.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
                        : 'N/A'}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-xs text-muted-foreground mb-1">Duration</div>
                    <p className="font-semibold text-sm">{daysCount} Days / {Math.max(0, daysCount - 1)} Nights</p>
                  </CardContent>
                </Card>
                {canSeeCost && (
                  <>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-xs text-muted-foreground mb-1">Total Cost</div>
                        <p className="font-semibold text-sm">{currencySymbol}{totalCost.toLocaleString('en-IN')}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-xs text-muted-foreground mb-1">Grand Total</div>
                        <p className="font-semibold text-sm text-green-600">{currencySymbol}{grandTotal.toLocaleString('en-IN')}</p>
                      </CardContent>
                    </Card>
                  </>
                )}
              </div>

              {/* Inclusions */}
              {inclusions.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base text-green-700 dark:text-green-400">Inclusions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      {inclusions.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Exclusions */}
              {exclusions.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base text-red-700 dark:text-red-400">Exclusions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      {exclusions.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Day-by-Day Activities */}
              <div className="space-y-3">
                {days.length > 0 ? (
                  days.map((day: any, idx: number) => {
                    const items = day.items ?? [];
                    return (
                      <Card key={day.id ?? idx}>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base">
                            Day {day.dayNumber ?? idx + 1}{day.title ? ` - ${day.title}` : ''}
                            {day.city && <span className="text-sm font-normal text-muted-foreground ml-2">({day.city})</span>}
                          </CardTitle>
                          {day.description && (
                            <div
                              className="text-sm text-muted-foreground prose prose-sm dark:prose-invert max-w-none mt-1"
                              dangerouslySetInnerHTML={{ __html: day.description }}
                            />
                          )}
                        </CardHeader>
                        <CardContent className="space-y-2">
                          {items.length > 0 ? (
                            items.map((item: any, itemIdx: number) => {
                              // Parse detailsJson if it's a string
                              const details = typeof item.detailsJson === 'string'
                                ? (() => { try { return JSON.parse(item.detailsJson); } catch { return {}; } })()
                                : (item.detailsJson ?? {});

                              const itemName = item.title
                                || details.hotelName || details.airline || details.activityName
                                || details.restaurantName || `${item.type} Activity`;

                              const itemDetail = details.checkInDate && details.checkOutDate
                                ? `${details.checkInDate} to ${details.checkOutDate}`
                                : details.departureAirport && details.arrivalAirport
                                ? `${details.departureAirport} \u2192 ${details.arrivalAirport}`
                                : details.pickupLocation && details.dropLocation
                                ? `${details.pickupLocation} \u2192 ${details.dropLocation}`
                                : details.duration || '';

                              return (
                                <div key={item.id ?? itemIdx} className="flex gap-3 p-3 rounded-lg bg-muted/30">
                                  <div className="text-sm flex-1">
                                    <p className="font-medium">{itemName}</p>
                                    {itemDetail && (
                                      <p className="text-xs text-muted-foreground">{itemDetail}</p>
                                    )}
                                    {canSeeCost && (item.sellingPrice || item.costPrice) ? (
                                      <p className="text-xs text-muted-foreground mt-1">
                                        {currencySymbol}{(item.sellingPrice ?? item.costPrice ?? 0).toLocaleString('en-IN')}
                                        {item.quantity > 1 && ` x ${item.quantity}`}
                                      </p>
                                    ) : null}
                                  </div>
                                  <Badge variant="outline" className="text-[10px] h-fit capitalize">
                                    {item.type}
                                  </Badge>
                                </div>
                              );
                            })
                          ) : (
                            <p className="text-sm text-muted-foreground italic">No activities planned</p>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })
                ) : (
                  <Card>
                    <CardContent className="pt-6">
                      <p className="text-sm text-muted-foreground italic">No days planned yet</p>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Terms & Conditions */}
              {termsConditions && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Terms & Conditions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{termsConditions}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Costs Tab (only visible to authorized roles) */}
          {canSeeCost && (
            <TabsContent value="costs" className="flex-1 overflow-auto p-6">
              <div className="max-w-4xl mx-auto">
                <Card>
                  <CardHeader><CardTitle className="text-base">Cost Breakdown</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="text-sm space-y-2">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total Cost:</span>
                          <span className="font-medium">{currencySymbol}{totalCost.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total Selling:</span>
                          <span className="font-medium">{currencySymbol}{totalSelling.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Tax:</span>
                          <span className="font-medium">{currencySymbol}{(itin.totalTax ?? 0).toLocaleString('en-IN')}</span>
                        </div>
                        <div className="border-t pt-2 flex justify-between font-semibold">
                          <span>Grand Total:</span>
                          <span className="text-green-600">{currencySymbol}{grandTotal.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex justify-between font-semibold text-sm">
                          <span>Margin ({marginPct}%):</span>
                          <span className={cn(margin > 0 ? 'text-green-600' : 'text-red-500')}>
                            {currencySymbol}{margin.toLocaleString('en-IN')}
                          </span>
                        </div>
                      </div>

                      {days.length > 0 && (
                        <div className="border-t pt-4">
                          <h4 className="text-sm font-semibold mb-3">Items by Day</h4>
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
                              {days.flatMap((day: any, dayIdx: number) =>
                                (day.items ?? []).map((item: any, itemIdx: number) => (
                                  <TableRow key={`${dayIdx}-${itemIdx}`}>
                                    <TableCell className="text-sm">Day {day.dayNumber ?? dayIdx + 1}</TableCell>
                                    <TableCell className="text-sm">{item.title || 'Item'}</TableCell>
                                    <TableCell className="text-right text-sm capitalize">{item.type}</TableCell>
                                    <TableCell className="text-right text-sm">{currencySymbol}{(item.costPrice ?? 0).toLocaleString('en-IN')}</TableCell>
                                    <TableCell className="text-right text-sm">{currencySymbol}{(item.sellingPrice ?? 0).toLocaleString('en-IN')}</TableCell>
                                  </TableRow>
                                ))
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
          <TabsContent value="versions" className="flex-1 overflow-auto p-6">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-muted-foreground">Version History</h3>
                <Button size="sm" onClick={handleCreateVersion} disabled={createVersionLoading}>
                  {createVersionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                  Create New Version
                </Button>
              </div>

              <div className="space-y-3">
                {/* Current itinerary as a version card */}
                <Card className="border-primary bg-primary/5">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">
                        Version {itin.version ?? 1} <Badge className="ml-2">Current</Badge>
                      </CardTitle>
                      <span className="text-xs text-muted-foreground">
                        {itinerary.createdAt ? new Date(itinerary.createdAt).toLocaleDateString('en-IN') : 'Recently'}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Current version - {daysCount} day itinerary
                      {lead.destination ? ` for ${lead.destination}` : ''}
                    </p>
                  </CardContent>
                </Card>

                {/* Fetched version history */}
                {versionsLoading && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                )}

                {!versionsLoading && versions.length > 0 && versions.map((ver: any) => (
                  <Card
                    key={ver.id}
                    className="cursor-pointer hover:shadow-sm transition-shadow"
                    onClick={() => router.push(`/itineraries/${ver.id}`)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">
                          Version {ver.versionNumber ?? ver.version_number ?? ver.version ?? '?'}
                        </CardTitle>
                        <span className="text-xs text-muted-foreground">
                          {ver.createdAt ? new Date(ver.createdAt).toLocaleDateString('en-IN') : ''}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        {ver.changes ?? `Created by ${ver.createdBy ?? 'user'}`}
                      </p>
                    </CardContent>
                  </Card>
                ))}

                {!versionsLoading && versions.length === 0 && (
                  <p className="text-sm text-muted-foreground italic mt-4">
                    No previous versions. Click &quot;Create New Version&quot; to save a snapshot.
                  </p>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Share Tab */}
          <TabsContent value="share" className="flex-1 overflow-auto p-6">
            <div className="max-w-2xl mx-auto space-y-4">
              {/* Share Link Section */}
              <Card>
                <CardHeader><CardTitle className="text-base">Public Share Link</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {(shareLinkActive || shareLink) ? (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={shareLink ?? `Share link generated - click Generate to get a new URL`}
                          readOnly
                          className="flex-1 px-3 py-2 rounded-md border text-sm bg-muted/30"
                        />
                        {shareLink && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              if (shareLink) {
                                navigator.clipboard.writeText(shareLink);
                                toast.success('Link copied to clipboard');
                              }
                            }}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      {viewCount > 0 && (
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> {viewCount} views</span>
                          {lastViewedAt && (
                            <span>Last viewed: {new Date(lastViewedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                          )}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleGenerateShareLink}
                          disabled={shareLinkLoading}
                        >
                          {shareLinkLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Link2 className="h-4 w-4 mr-1" />}
                          Regenerate Link
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600"
                          onClick={handleRevokeShareLink}
                          disabled={shareLinkLoading}
                        >
                          {shareLinkLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Link2Off className="h-4 w-4 mr-1" />}
                          Revoke Link
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        Generate a public link that clients can use to view this itinerary.
                      </p>
                      <Button
                        size="sm"
                        onClick={handleGenerateShareLink}
                        disabled={shareLinkLoading}
                      >
                        {shareLinkLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Link2 className="h-4 w-4 mr-1" />}
                        Generate Share Link
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Send via Communication Hub */}
              <Card>
                <CardHeader><CardTitle className="text-base">Send to Client</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => { setSendChannel('email'); setSendDialogOpen(true); }}
                    >
                      <Mail className="h-4 w-4 mr-1" /> Send via Email
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => { setSendChannel('whatsapp'); setSendDialogOpen(true); }}
                    >
                      <MessageSquare className="h-4 w-4 mr-1" /> Send via WhatsApp
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Export */}
              <Card>
                <CardHeader><CardTitle className="text-base">Export</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={handlePdfPreview}>
                      <FileText className="h-4 w-4 mr-2" /> Preview PDF
                    </Button>
                    <Button variant="outline" className="flex-1" onClick={handlePdfDownload}>
                      <Download className="h-4 w-4 mr-2" /> Download PDF
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
