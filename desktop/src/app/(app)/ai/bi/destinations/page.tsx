'use client';

import * as React from 'react';
import {
  Globe,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  DollarSign,
  BarChart3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useApiQuery } from '@/hooks/use-api';
import {
  aiApi,
  type ProfitabilityAnalysis,
  type SeasonalDemandData,
  type TrendingDestination,
} from '@/lib/api/ai';

export default function DestinationsPage() {
  const [profitPeriod, setProfitPeriod] = React.useState('month');

  const { data: profitData, loading: profitLoading, refetch: refetchProfit } = useApiQuery(
    () => aiApi.bi.getDestinationProfitability({ period: profitPeriod }),
    [profitPeriod],
  );
  const { data: trendingData, loading: trendingLoading } = useApiQuery(
    () => aiApi.bi.getTrendingDestinations(),
    [],
  );
  const { data: demandData, loading: demandLoading } = useApiQuery(
    () => aiApi.bi.getSeasonalDemand(),
    [],
  );

  const profitability: ProfitabilityAnalysis[] =
    (profitData as { data?: ProfitabilityAnalysis[] })?.data ?? [];
  const trending: TrendingDestination[] =
    (trendingData as { data?: TrendingDestination[] })?.data ?? [];
  const demand: SeasonalDemandData[] =
    (demandData as { data?: SeasonalDemandData[] })?.data ?? [];

  const maxRevenue = Math.max(...profitability.map((p) => p.revenue), 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Destination Analytics</h1>
          <p className="text-muted-foreground mt-1">
            Profitability, demand patterns, and trending destinations
          </p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => refetchProfit()}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <Tabs defaultValue="profitability">
        <TabsList>
          <TabsTrigger value="profitability">Profitability</TabsTrigger>
          <TabsTrigger value="trending">Trending</TabsTrigger>
          <TabsTrigger value="seasonal">Seasonal Demand</TabsTrigger>
        </TabsList>

        {/* Profitability */}
        <TabsContent value="profitability" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Select value={profitPeriod} onValueChange={setProfitPeriod}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="quarter">This Quarter</SelectItem>
                <SelectItem value="year">This Year</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {profitLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : profitability.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <div className="flex flex-col items-center justify-center text-muted-foreground">
                  <Globe className="h-12 w-12 mb-3 opacity-30" />
                  <p className="text-sm">No profitability data available</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left px-4 py-3 font-medium">Destination</th>
                        <th className="text-right px-4 py-3 font-medium">Revenue</th>
                        <th className="text-right px-4 py-3 font-medium">Costs</th>
                        <th className="text-right px-4 py-3 font-medium">Profit</th>
                        <th className="text-right px-4 py-3 font-medium">Margin</th>
                        <th className="text-center px-4 py-3 font-medium">Trend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profitability
                        .sort((a, b) => b.profit - a.profit)
                        .map((dest) => (
                          <tr key={dest.destination} className="border-t hover:bg-muted/30">
                            <td className="px-4 py-3 font-medium">{dest.destination}</td>
                            <td className="px-4 py-3 text-right">
                              ${dest.revenue.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right text-muted-foreground">
                              ${dest.costs.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                              ${dest.profit.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-xs',
                                  dest.margin >= 30
                                    ? 'text-emerald-600'
                                    : dest.margin >= 15
                                      ? 'text-amber-600'
                                      : 'text-red-600',
                                )}
                              >
                                {dest.margin.toFixed(1)}%
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {dest.trend === 'up' ? (
                                <TrendingUp className="h-4 w-4 text-emerald-600 mx-auto" />
                              ) : dest.trend === 'down' ? (
                                <TrendingDown className="h-4 w-4 text-red-600 mx-auto" />
                              ) : (
                                <span className="text-xs text-muted-foreground">--</span>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Trending */}
        <TabsContent value="trending" className="mt-4">
          {trendingLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i}>
                  <CardContent className="pt-6 space-y-3">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : trending.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <div className="flex flex-col items-center justify-center text-muted-foreground">
                  <TrendingUp className="h-12 w-12 mb-3 opacity-30" />
                  <p className="text-sm">No trending data available</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {trending.map((dest, idx) => (
                <Card key={idx}>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Globe className="h-5 w-5 text-muted-foreground" />
                        <p className="font-semibold">{dest.name}</p>
                      </div>
                      {dest.trend === 'up' ? (
                        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 gap-1">
                          <TrendingUp className="h-3 w-3" />
                          Trending Up
                        </Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400 gap-1">
                          <TrendingDown className="h-3 w-3" />
                          Trending Down
                        </Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="text-center rounded-lg bg-muted/50 p-2">
                        <p className="text-xs text-muted-foreground">Bookings</p>
                        <p className="font-bold">{dest.bookings}</p>
                      </div>
                      <div className="text-center rounded-lg bg-muted/50 p-2">
                        <p className="text-xs text-muted-foreground">Revenue</p>
                        <p className="font-bold">${dest.revenue.toLocaleString()}</p>
                      </div>
                      <div className="text-center rounded-lg bg-muted/50 p-2">
                        <p className="text-xs text-muted-foreground">Avg Deal</p>
                        <p className="font-bold">${dest.avgDealValue.toLocaleString()}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Seasonal Demand */}
        <TabsContent value="seasonal" className="mt-4">
          {demandLoading ? (
            <Card>
              <CardContent className="pt-6 space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </CardContent>
            </Card>
          ) : demand.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <div className="flex flex-col items-center justify-center text-muted-foreground">
                  <BarChart3 className="h-12 w-12 mb-3 opacity-30" />
                  <p className="text-sm">No seasonal demand data available</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Monthly Demand Pattern</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {demand.map((month, idx) => {
                    const maxDemand = Math.max(...demand.map((d) => d.demand), 1);
                    return (
                      <div key={idx} className="flex items-center gap-4">
                        <span className="text-sm font-medium w-12">{month.month}</span>
                        <div className="flex-1">
                          <Progress
                            value={(month.demand / maxDemand) * 100}
                            className="h-6"
                          />
                        </div>
                        <div className="flex items-center gap-3 w-48 justify-end">
                          <span className="text-sm font-semibold">{month.demand} inquiries</span>
                          {month.trending && (
                            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 text-xs">
                              Hot
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
