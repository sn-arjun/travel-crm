'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, BarChart3, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { suppliersApi, type RateComparison } from '@/lib/api/suppliers';
import { toast } from 'sonner';

const SERVICE_TYPES = [
  'Standard Room', 'Deluxe Room', 'Suite', 'Breakfast', 'Full Board',
  'Economy', 'Premium Economy', 'Business', 'First Class',
  'Sedan', 'SUV', 'Tempo Traveller', 'Bus', 'Luxury Coach',
  'City Tour', 'Adventure', 'Water Sports', 'Cultural Tour',
  'Day Package', 'Multi-Day Package', 'Custom Tour',
  'Standard', 'Premium', 'Villa', 'All Inclusive',
  'Standard Booking', 'Premium Booking',
  'Visa Processing', 'Guide Service', 'Travel Insurance',
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
  const [date, setDate] = React.useState('');
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
        season: (season && season !== 'any') ? season : undefined,
        date: date || undefined,
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

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              Compare Supplier Rates
            </h1>
            <p className="text-sm text-muted-foreground">Compare rates across suppliers for the same service</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl space-y-6">
          {/* Filters */}
          <Card>
            <CardHeader><CardTitle className="text-base">Search Parameters</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Service Type <span className="text-destructive">*</span></Label>
                  <Select value={serviceType} onValueChange={setServiceType}>
                    <SelectTrigger><SelectValue placeholder="Select service type" /></SelectTrigger>
                    <SelectContent>
                      {SERVICE_TYPES.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Destination <span className="text-destructive">*</span></Label>
                  <Input
                    placeholder="e.g., Goa, Maldives, Thailand"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Season</Label>
                  <Select value={season} onValueChange={setSeason}>
                    <SelectTrigger><SelectValue placeholder="Any season" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any Season</SelectItem>
                      {SEASONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Travel Date</Label>
                  <Input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={handleCompare}
                    disabled={loading || !serviceType || !destination}
                    className="w-full"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Search className="h-4 w-4 mr-1.5" />}
                    Compare Rates
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Results */}
          {hasSearched && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Rate Comparison Results
                  {sortedResults.length > 0 && (
                    <Badge variant="outline" className="ml-2 text-xs">{sortedResults.length} suppliers</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {sortedResults.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="text-sm">No rates found for this service type and destination</p>
                    <p className="text-xs mt-1">Try a different service type or destination, or ensure rate cards exist for suppliers</p>
                  </div>
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
                        const highestRate = sortedResults[sortedResults.length - 1]!.rate;
                        const savings = highestRate > 0 ? ((highestRate - r.rate) / highestRate * 100).toFixed(1) : '0';
                        return (
                          <TableRow
                            key={r.supplierId}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => router.push(`/suppliers/${r.supplierId}`)}
                          >
                            <TableCell className="text-sm font-medium">{idx + 1}</TableCell>
                            <TableCell className="font-medium text-sm">
                              <div className="flex items-center gap-2">
                                {r.supplierName}
                                {r.rate === lowestRate && (
                                  <Badge className="text-xs bg-green-100 text-green-900">Best Rate</Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm font-semibold">
                              ₹{r.rate.toLocaleString('en-IN')}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{r.currency ?? 'INR'}</TableCell>
                            <TableCell>
                              {idx === sortedResults.length - 1 ? (
                                <span className="text-xs text-muted-foreground">—</span>
                              ) : (
                                <span className="text-xs text-green-600 font-medium">{savings}% less</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
