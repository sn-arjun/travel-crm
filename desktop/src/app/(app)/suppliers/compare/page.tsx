'use client';


import { getLocaleContext } from '@/lib/locale';
import { formatLocaleNumber } from '@/lib/format';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, BarChart3, Search } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { PageContainer } from '@/components/layout/page-container';
import { toLocalDateString } from '@/lib/dates';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { suppliersApi, type RateComparison } from '@/lib/api/suppliers';

// Rate cards created on /rate-cards use the five category values; cards added
// from a supplier profile may carry a free-text service name, so both are offered.
const SERVICE_TYPES = [
  { value: 'hotel', label: 'Hotel' },
  { value: 'transport', label: 'Transport' },
  { value: 'activity', label: 'Activity' },
  { value: 'meal', label: 'Meal' },
  { value: 'flight', label: 'Flight' },
  ...[
    'Standard Room', 'Deluxe Room', 'Suite', 'Breakfast', 'Full Board',
    'Economy', 'Premium Economy', 'Business', 'First Class',
    'Sedan', 'SUV', 'Tempo Traveller', 'Bus', 'Luxury Coach',
    'City Tour', 'Adventure', 'Water Sports', 'Cultural Tour',
    'Day Package', 'Multi-Day Package', 'Custom Tour',
    'Standard', 'Premium', 'Villa', 'All Inclusive',
    'Standard Booking', 'Premium Booking',
    'Visa Processing', 'Guide Service', 'Travel Insurance',
  ].map((s) => ({ value: s, label: s })),
];

const SEASONS = [
  { value: 'peak', label: 'Peak Season' },
  { value: 'off_peak', label: 'Off Peak' },
  { value: 'shoulder', label: 'Shoulder Season' },
  { value: 'monsoon', label: 'Monsoon' },
];

export default function SupplierComparePage() {
  const router = useRouter();
  const [serviceType, setServiceType] = React.useState('');
  const [destination, setDestination] = React.useState('');
  const [season, setSeason] = React.useState('');
  const [date, setDate] = React.useState<Date | undefined>(undefined);
  const [results, setResults] = React.useState<RateComparison[]>([]);
  const [hasSearched, setHasSearched] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function handleCompare() {
    if (!serviceType || !destination) {
      toast.error('Please enter service type and destination');
      return;
    }
    setLoading(true);
    try {
      const result = await suppliersApi.compareRates({
        service_type: serviceType,
        destination,
        season: season && season !== 'any' ? season : undefined,
        date: date ? toLocalDateString(date) : undefined,
      });
      setHasSearched(true);
      setResults(Array.isArray(result?.data) ? result.data : []);
    } catch {
      setHasSearched(true);
      setResults([]);
      toast.error('Failed to compare rates');
    } finally {
      setLoading(false);
    }
  }

  const sortedResults = [...results].sort((a, b) => a.rate - b.rate);
  const lowestRate = sortedResults.length > 0 ? sortedResults[0]!.rate : 0;
  const highestRate = sortedResults.length > 0 ? sortedResults[sortedResults.length - 1]!.rate : 0;

  return (
    <PageContainer>
      <PageHeader
        title="Compare Supplier Rates"
        description="Compare rates across suppliers for the same service."
        back={
          <Button variant="ghost" size="icon-sm" aria-label="Go back" onClick={() => router.back()}>
            <ArrowLeft aria-hidden="true" />
          </Button>
        }
      />

      <SectionCard title="Search Parameters">
        <div className="grid gap-ds-4 sm:grid-cols-2">
          <div className="flex flex-col gap-ds-1">
            <Label>Service Type <span className="text-ds-danger">*</span></Label>
            <Select value={serviceType} onValueChange={setServiceType}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select service type" /></SelectTrigger>
              <SelectContent>
                {SERVICE_TYPES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-ds-1">
            <Label>Destination <span className="text-ds-danger">*</span></Label>
            <Input
              placeholder="e.g., Goa, Maldives, Thailand"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-ds-1">
            <Label>Season</Label>
            <Select value={season} onValueChange={setSeason}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Any season" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any Season</SelectItem>
                {SEASONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-ds-1">
            <Label>Travel Date</Label>
            <DatePicker value={date} onChange={setDate} placeholder="Any date" />
          </div>
          <div className="sm:col-span-2">
            <Button onClick={handleCompare} disabled={loading || !serviceType || !destination}>
              {loading ? <Spinner className="size-4" /> : <Search aria-hidden="true" />}
              Compare Rates
            </Button>
          </div>
        </div>
      </SectionCard>

      {hasSearched && (
        <SectionCard
          title="Rate Comparison Results"
          actions={
            sortedResults.length > 0 && (
              <Badge variant="outline">{sortedResults.length} suppliers</Badge>
            )
          }
          flush={sortedResults.length > 0}
        >
          {sortedResults.length === 0 ? (
            <EmptyState
              icon={<BarChart3 aria-hidden="true" />}
              title="No rates found"
              description="Try a different service type or destination, or ensure rate cards exist for suppliers."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>Savings vs Highest</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedResults.map((r, idx) => {
                  const savings = highestRate > 0 ? ((highestRate - r.rate) / highestRate * 100).toFixed(1) : '0';
                  return (
                    <TableRow
                      key={r.supplierId}
                      className="cursor-pointer"
                      onClick={() => router.push(`/suppliers/${r.supplierId}`)}
                    >
                      <TableCell className="text-sm font-medium">{idx + 1}</TableCell>
                      <TableCell className="font-medium text-sm">
                        <div className="flex items-center gap-ds-2">
                          {r.supplierName}
                          {r.rate === lowestRate && (
                            <Badge className="bg-ds-success-subtle text-ds-success-on-subtle">Best Rate</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold">
                        {formatLocaleNumber(r.rate)}
                      </TableCell>
                      <TableCell className="text-sm text-ds-foreground-muted">{r.currency ?? getLocaleContext().currency}</TableCell>
                      <TableCell>
                        {idx === sortedResults.length - 1 ? (
                          <span className="text-xs text-ds-foreground-muted">—</span>
                        ) : (
                          <span className="text-xs text-ds-success font-medium">{savings}% less</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </SectionCard>
      )}
    </PageContainer>
  );
}
