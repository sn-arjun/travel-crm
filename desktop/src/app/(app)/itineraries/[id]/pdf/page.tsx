'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Download, Printer, Loader2, FileText, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { useApiQuery } from '@/hooks/use-api';
import { itinerariesApi, toItineraryDetail, formatDestination } from '@/lib/api/itineraries';
import { unwrapEntity } from '@/lib/api/envelope';
import { API_BASE_URL } from '@/lib/api/config';
import { formatCurrency } from '@/lib/utils';
import { formatDisplayDate } from '@/lib/dates';
import { toast } from 'sonner';

export default function ItineraryPdfPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const { data: itinerary, loading, error } = useApiQuery(
    () => itinerariesApi.getById(id).then(toItineraryDetail),
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
      const result = unwrapEntity<{ shareUrl?: string; link?: string }>(
        await itinerariesApi.createShareLink(id, { expiryDays: 7, accessLevel: 'view' }),
      );
      const link = result?.shareUrl ?? result?.link;
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
      <PageContainer>
        <div className="flex flex-col items-center justify-center gap-ds-4 py-ds-9">
          <Loader2 className="size-10 animate-spin text-ds-foreground-subtle" aria-hidden="true" />
          <p className="text-ds-foreground-muted">Loading itinerary...</p>
        </div>
      </PageContainer>
    );
  }

  if (error || !itinerary) {
    return (
      <PageContainer>
        <div className="flex flex-col items-center justify-center gap-ds-4 py-ds-9">
          <FileText className="size-10 text-ds-foreground-subtle" aria-hidden="true" />
          <p className="text-ds-foreground-muted">Failed to load itinerary</p>
          <Button variant="outline" onClick={() => router.back()}>Go Back</Button>
        </div>
      </PageContainer>
    );
  }

  const days = itinerary.days ?? [];
  const inclusions = Array.isArray(itinerary.inclusions) ? itinerary.inclusions : [];
  const exclusions = Array.isArray(itinerary.exclusions) ? itinerary.exclusions : [];
  const termsConditions = itinerary.termsConditions ?? '';
  const destination = formatDestination(itinerary.lead?.destination);
  const contactName = itinerary.contact?.name;
  const currency = itinerary.currency ?? 'INR';
  const money = (n: number) => formatCurrency(n, currency);
  const grandTotal = itinerary.grandTotal ?? 0;

  return (
    <PageContainer>
      {/* Toolbar - hidden when printing */}
      <div className="print:hidden">
        <PageHeader
          title="PDF Preview"
          breadcrumbs={[
            { label: 'Itineraries', href: '/itineraries' },
            { label: itinerary.title, href: `/itineraries/${id}` },
            { label: 'PDF' },
          ]}
          actions={
            <>
              <Button variant="outline" size="sm" onClick={() => void handleShare()}>
                <Share2 className="size-4 mr-1.5" aria-hidden="true" /> Share Link
              </Button>
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="size-4 mr-1.5" aria-hidden="true" /> Print
              </Button>
              <Button size="sm" onClick={handleDownload}>
                <Download className="size-4 mr-1.5" aria-hidden="true" /> Download PDF
              </Button>
            </>
          }
        />
      </div>

      {/* PDF Preview Content */}
      <div className="mx-auto w-full max-w-3xl rounded-lg border border-ds-border bg-ds-surface p-ds-6 shadow-lg print:border-0 print:p-0 print:shadow-none">
        <div className="mb-ds-6 text-center">
          <h2 className="text-2xl font-bold">{itinerary.title}</h2>
          {itinerary.notes && <p className="mt-2 text-ds-foreground-muted">{itinerary.notes}</p>}
          <div className="mt-ds-4 flex flex-wrap items-center justify-center gap-ds-4 text-sm">
            {destination && <span>Destination: <strong>{destination}</strong></span>}
            {contactName && <span>Client: <strong>{contactName}</strong></span>}
          </div>
          {grandTotal > 0 && (
            <p className="mt-ds-3 text-lg font-semibold">Total: {money(grandTotal)}</p>
          )}
        </div>

        <Separator className="my-ds-5" />

        {days.length > 0 && (
          <div className="mb-ds-6 space-y-ds-5">
            <h3 className="text-lg font-bold">Day-wise Itinerary</h3>
            {days.map((day, idx) => {
              const items = day.items ?? [];
              return (
                <Card key={day.id ?? idx} className="border border-ds-border">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      Day {day.dayNumber ?? idx + 1}{day.title ? `: ${day.title}` : ''}
                      {day.city && <span className="font-normal text-ds-foreground-muted"> ({day.city})</span>}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-ds-2 text-sm text-ds-foreground-muted">
                    {day.description && (
                      <div
                        className="prose prose-sm max-w-none dark:prose-invert"
                        dangerouslySetInnerHTML={{ __html: day.description }}
                      />
                    )}
                    {items.length > 0 && (
                      <div className="space-y-ds-2 pt-ds-1">
                        {items.map((item, itemIdx) => (
                          <div key={item.id ?? itemIdx} className="flex items-center justify-between rounded bg-ds-surface-sunken px-ds-2 py-ds-1 text-sm">
                            <div>
                              <span className="font-medium text-ds-foreground">{item.title}</span>
                              <Badge variant="outline" className="ml-2 text-xs capitalize">{item.type}</Badge>
                            </div>
                            {(item.sellingPrice ?? 0) > 0 && (
                              <span className="font-mono text-xs">{money(item.sellingPrice ?? 0)}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {inclusions.length > 0 && (
          <div className="mb-ds-5">
            <h3 className="mb-ds-3 text-lg font-bold text-ds-success">Inclusions</h3>
            <ul className="list-inside list-disc space-y-1 text-sm">
              {inclusions.map((item, idx) => <li key={idx}>{item}</li>)}
            </ul>
          </div>
        )}

        {exclusions.length > 0 && (
          <div className="mb-ds-5">
            <h3 className="mb-ds-3 text-lg font-bold text-ds-danger">Exclusions</h3>
            <ul className="list-inside list-disc space-y-1 text-sm">
              {exclusions.map((item, idx) => <li key={idx}>{item}</li>)}
            </ul>
          </div>
        )}

        {termsConditions && (
          <div className="mb-ds-5">
            <h3 className="mb-ds-3 text-lg font-bold">Terms & Conditions</h3>
            <p className="whitespace-pre-wrap text-sm text-ds-foreground-muted">{termsConditions}</p>
          </div>
        )}

        <Separator className="my-ds-5" />

        <p className="text-center text-xs text-ds-foreground-muted">
          Generated on {formatDisplayDate(new Date(), 'long')}
        </p>
      </div>
    </PageContainer>
  );
}
