'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, BarChart3, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useApiMutation } from '@/hooks/use-api';
import { suppliersApi, type CompareRatesRequest, type RateComparison } from '@/lib/api/suppliers';
import { toast } from 'sonner';

const CATEGORIES = [
  { value: 'hotel', label: 'Hotel' },
  { value: 'airline', label: 'Airline' },
  { value: 'transport', label: 'Transport' },
  { value: 'activity', label: 'Activity' },
  { value: 'tour_operator', label: 'Tour Operator' },
  { value: 'resort', label: 'Resort' },
  { value: 'ota', label: 'OTA' },
];

const SERVICE_TYPES: Record<string, string[]> = {
  hotel: ['Standard Room', 'Deluxe Room', 'Suite', 'Breakfast', 'Full Board'],
  airline: ['Economy', 'Premium Economy', 'Business', 'First Class'],
  transport: ['Sedan', 'SUV', 'Tempo Traveller', 'Bus', 'Luxury Coach'],
  activity: ['City Tour', 'Adventure', 'Water Sports', 'Cultural Tour'],
  tour_operator: ['Day Package', 'Multi-Day Package', 'Custom Tour'],
  resort: ['Standard', 'Premium', 'Villa', 'All Inclusive'],
  ota: ['Standard Booking', 'Premium Booking'],
};

export default function SupplierComparePage() {
  const router = useRouter();
  const [category, setCategory] = React.useState('');
  const [serviceType, setServiceType] = React.useState('');
  const [results, setResults] = React.useState<RateComparison[]>([]);
  const [hasSearched, setHasSearched] = React.useState(false);

  const { mutate: compareRates, loading } = useApiMutation<CompareRatesRequest, any>(
    (data) => suppliersApi.compareRates(data),
  );

  const availableServices = category ? (SERVICE_TYPES[category] ?? []) : [];

  async function handleCompare() {
    if (!category || !serviceType) {
      toast.error('Please select both category and service type');
      return;
    }

    const result = await compareRates({ category, serviceType });
    setHasSearched(true);
    if (result?.data) {
      setResults(Array.isArray(result.data) ? result.data : []);
    } else {
      setResults([]);
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
            <CardHeader><CardTitle className="text-base">Select Service to Compare</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select
                    value={category}
                    onValueChange={(v) => {
                      setCategory(v);
                      setServiceType('');
                      setResults([]);
                      setHasSearched(false);
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Service Type</Label>
                  <Select
                    value={serviceType}
                    onValueChange={setServiceType}
                    disabled={!category}
                  >
                    <SelectTrigger><SelectValue placeholder="Select service" /></SelectTrigger>
                    <SelectContent>
                      {availableServices.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button onClick={handleCompare} disabled={loading || !category || !serviceType} className="w-full">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Search className="h-4 w-4 mr-1.5" />}
                    Compare
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
                    <p className="text-sm">No rates found for this category and service type</p>
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
                          <TableRow key={r.supplierId}>
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
