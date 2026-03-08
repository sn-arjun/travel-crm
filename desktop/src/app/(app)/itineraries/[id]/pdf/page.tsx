'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Download, Printer, Loader2, FileText, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useApiQuery } from '@/hooks/use-api';
import { itinerariesApi } from '@/lib/api/itineraries';
import { API_BASE_URL } from '@/lib/api/config';
import { toast } from 'sonner';
import type { Itinerary } from '@travelcrm/shared';

export default function ItineraryPdfPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const { data: itinerary, loading, error } = useApiQuery(
    () => itinerariesApi.getById(id).then((res) => {
      if (res && typeof res === 'object' && 'data' in res) return (res as any).data as Itinerary;
      return res as Itinerary;
    }),
    [id],
  );

  function handlePrint() {
    window.print();
  }

  function handleDownload() {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : '';
    const url = `${API_BASE_URL}/itineraries/${id}/pdf${token ? `?token=${token}` : ''}`;
    window.open(url, '_blank');
    toast.success('PDF download started');
  }

  async function handleShare() {
    try {
      const result = await itinerariesApi.createShareLink(id, { expiryDays: 7, accessLevel: 'view' });
      const data = (result as any)?.data ?? result;
      const link = data?.shareUrl ?? data?.link;
      if (link) {
        await navigator.clipboard.writeText(link);
        toast.success('Share link copied to clipboard');
      } else {
        toast.error('Failed to generate share link');
      }
    } catch {
      toast.error('Failed to generate share link');
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground">Loading itinerary...</p>
      </div>
    );
  }

  if (error || !itinerary) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <FileText className="h-12 w-12 text-muted-foreground/50" />
        <p className="text-muted-foreground">Failed to load itinerary</p>
        <Button variant="outline" onClick={() => router.back()}>Go Back</Button>
      </div>
    );
  }

  const itin = itinerary as any;
  // Backend returns days at root with items nested inside
  const days = itin.days ?? [];
  const inclusions: string[] = Array.isArray(itin.inclusions) ? itin.inclusions : [];
  const exclusions: string[] = Array.isArray(itin.exclusions) ? itin.exclusions : [];
  const termsConditions = itin.termsConditions ?? '';
  const lead = itin.lead ?? {};
  const contact = itin.contact ?? {};
  const currency = itin.currency ?? 'INR';
  const currencySymbol = currency === 'INR' ? '\u20B9' : currency === 'USD' ? '$' : currency + ' ';

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar - hidden when printing */}
      <div className="flex items-center justify-between px-6 py-4 border-b print:hidden">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            PDF Preview
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleShare}>
            <Share2 className="h-4 w-4 mr-1.5" /> Share Link
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-1.5" /> Print
          </Button>
          <Button size="sm" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-1.5" /> Download PDF
          </Button>
        </div>
      </div>

      {/* PDF Preview Content */}
      <div className="flex-1 overflow-auto p-6 bg-muted/30">
        <div className="max-w-3xl mx-auto bg-white dark:bg-card rounded-lg shadow-lg p-8 print:shadow-none print:p-0">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold">{itin.title}</h1>
            {itin.notes && <p className="text-muted-foreground mt-2">{itin.notes}</p>}
            <div className="flex items-center justify-center gap-4 mt-4 text-sm">
              {lead.destination && <span>Destination: <strong>{lead.destination}</strong></span>}
              {contact.name && <span>Client: <strong>{contact.name}</strong></span>}
            </div>
            {itin.grandTotal > 0 && (
              <p className="text-lg font-semibold mt-3">
                Total: {currencySymbol}{itin.grandTotal.toLocaleString('en-IN')}
              </p>
            )}
          </div>

          <Separator className="my-6" />

          {/* Day-wise Itinerary */}
          {days.length > 0 && (
            <div className="space-y-6 mb-8">
              <h2 className="text-lg font-bold">Day-wise Itinerary</h2>
              {days.map((day: any, idx: number) => {
                const items = day.items ?? [];
                return (
                  <Card key={day.id ?? idx} className="border">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">
                        Day {day.dayNumber ?? idx + 1}{day.title ? `: ${day.title}` : ''}
                        {day.city && <span className="font-normal text-muted-foreground"> ({day.city})</span>}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground space-y-2">
                      {day.description && (
                        <div
                          className="prose prose-sm dark:prose-invert max-w-none"
                          dangerouslySetInnerHTML={{ __html: day.description }}
                        />
                      )}
                      {items.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          {items.map((item: any, itemIdx: number) => {
                            const details = typeof item.detailsJson === 'string'
                              ? (() => { try { return JSON.parse(item.detailsJson); } catch { return {}; } })()
                              : (item.detailsJson ?? {});
                            return (
                              <div key={item.id ?? itemIdx} className="flex items-center justify-between text-sm px-2 py-1 rounded bg-muted/30">
                                <div>
                                  <span className="font-medium">{item.title}</span>
                                  <Badge variant="outline" className="ml-2 text-[10px] capitalize">{item.type}</Badge>
                                </div>
                                {item.sellingPrice > 0 && (
                                  <span className="font-mono text-xs">{currencySymbol}{item.sellingPrice.toLocaleString('en-IN')}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Inclusions */}
          {inclusions.length > 0 && (
            <div className="mb-6">
              <h2 className="text-lg font-bold mb-3 text-green-700">Inclusions</h2>
              <ul className="list-disc list-inside space-y-1 text-sm">
                {inclusions.map((item: string, idx: number) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Exclusions */}
          {exclusions.length > 0 && (
            <div className="mb-6">
              <h2 className="text-lg font-bold mb-3 text-red-700">Exclusions</h2>
              <ul className="list-disc list-inside space-y-1 text-sm">
                {exclusions.map((item: string, idx: number) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Terms */}
          {termsConditions && (
            <div className="mb-6">
              <h2 className="text-lg font-bold mb-3">Terms & Conditions</h2>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{termsConditions}</p>
            </div>
          )}

          <Separator className="my-6" />

          <p className="text-center text-xs text-muted-foreground">
            Generated on {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
      </div>
    </div>
  );
}
