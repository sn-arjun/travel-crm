'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertCircle, RefreshCw,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts';
import { Button } from '@/components/ui/button';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { reportsApi } from '@/lib/api/reports';
import { PRESET_MAP as presetMap } from '@/components/domain/report-page-template';
import {
  ReportExportButton,
  formatReportCurrency as fmt,
  useReportSemanticColors,
} from '@/components/domain/reports/shared';

function ChartSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-16" />
      </div>
      <Skeleton className="h-[300px] w-full" />
    </div>
  );
}

export default function MarketingReportsPage() {
  const semanticColors = useReportSemanticColors();
  const [dateRange, setDateRange] = React.useState('30days');
  const [showComparison, setShowComparison] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState('campaigns');

  const [campaignsData, setCampaignsData] = React.useState<any[]>([]);
  const [roiData, setRoiData] = React.useState<any[]>([]);
  const [deliveryData, setDeliveryData] = React.useState<any[]>([]);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [retryKey, setRetryKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = { date_preset: presetMap[dateRange] ?? 'this_month', compare: showComparison };

    const reportId =
      activeTab === 'campaigns' ? 'campaign_performance'
        : activeTab === 'roi' ? 'lead_source_roi'
          : 'bulk_message_delivery';

    reportsApi.execute(reportId, params)
      .then((res: any) => {
        if (cancelled) return;
        const rows = (res?.data?.data ?? []) as any[];
        if (activeTab === 'campaigns') setCampaignsData(rows);
        else if (activeTab === 'roi') setRoiData(rows);
        else setDeliveryData(rows);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError('Failed to load report data');
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [dateRange, showComparison, activeTab, retryKey]);

  const renderError = () => (
    <div className="flex flex-col items-center justify-center h-[300px] gap-3">
      <AlertCircle className="h-8 w-8 text-destructive" />
      <p className="text-sm text-muted-foreground">Failed to load report data</p>
      <Button size="sm" variant="outline" onClick={() => setRetryKey((k) => k + 1)}>
        <RefreshCw className="h-4 w-4 mr-1.5" />
        Retry
      </Button>
    </div>
  );

  const renderEmpty = () => (
    <div className="flex items-center justify-center h-[300px]">
      <p className="text-sm text-muted-foreground">No data for selected period</p>
    </div>
  );

  const renderSkeletons = () => (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i}><CardContent className="pt-4 space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-16" /></CardContent></Card>
        ))}
      </div>
      <ChartSkeleton />
    </>
  );

  const totalLeads = campaignsData.reduce((s, r) => s + (r.total_leads ?? 0), 0);
  const totalWon = campaignsData.reduce((s, r) => s + (r.won_leads ?? 0), 0);
  const totalPipelineValue = campaignsData.reduce((s, r) => s + (r.total_pipeline_value ?? 0), 0);

  const totalRoiLeads = roiData.reduce((s, r) => s + (r.total_leads ?? 0), 0);
  const totalRoiRevenue = roiData.reduce((s, r) => s + (r.total_revenue ?? 0), 0);

  const totalSent = deliveryData.reduce((s, r) => s + (r.sent_count ?? 0), 0);
  const totalDelivered = deliveryData.reduce((s, r) => s + (r.delivered_count ?? 0), 0);
  const totalFailed = deliveryData.reduce((s, r) => s + (r.failed_count ?? 0), 0);

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <nav className="flex items-center gap-1 text-sm text-muted-foreground">
            <Link href="/reports" className="hover:text-foreground transition-colors">Reports</Link>
            <span>/</span>
            <span className="text-foreground font-medium">Marketing Reports</span>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch id="compare" checked={showComparison} onCheckedChange={setShowComparison} />
            <Label htmlFor="compare" className="text-sm cursor-pointer">Compare with previous period</Label>
          </div>
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7days">Last 7 Days</SelectItem>
              <SelectItem value="30days">Last 30 Days</SelectItem>
              <SelectItem value="90days">Last 90 Days</SelectItem>
              <SelectItem value="thisMonth">This Month</SelectItem>
              <SelectItem value="lastMonth">Last Month</SelectItem>
              <SelectItem value="thisQuarter">This Quarter</SelectItem>
              <SelectItem value="thisYear">This Year</SelectItem>
            </SelectContent>
          </Select>
          <ReportExportButton
            reportId="campaign_performance"
            params={{ date_preset: presetMap[dateRange] ?? 'this_month' }}
            filenamePrefix="marketing-report"
            rangeLabel={dateRange}
            size="sm"
          />
        </div>
      </div>

      {/* Title */}
      <div className="px-6 py-3 border-b">
        <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
          Marketing Reports
        </h1>
        <p className="text-sm text-muted-foreground">Campaign performance and marketing metrics</p>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
            <TabsTrigger value="roi">ROI</TabsTrigger>
            <TabsTrigger value="delivery">Delivery</TabsTrigger>
          </TabsList>

          {/* Campaigns Tab */}
          <TabsContent value="campaigns" className="space-y-6">
            {loading ? renderSkeletons() : error ? renderError() : campaignsData.length === 0 ? renderEmpty() : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Total Campaigns</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{campaignsData.length}</div>
                      <p className="text-xs text-muted-foreground mt-1">In selected period</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Total Leads</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{totalLeads}</div>
                      <p className="text-xs text-muted-foreground mt-1">{totalWon} won</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Pipeline Value</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{fmt(totalPipelineValue)}</div>
                      <p className="text-xs text-muted-foreground mt-1">Total potential value</p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Campaign Performance</CardTitle>
                    <CardDescription>Leads and pipeline value by campaign</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart
                        data={[...campaignsData].slice(0, 10).map((r) => ({
                          name: (r.campaign_name ?? '').split(' ').slice(0, 3).join(' '),
                          'Total Leads': r.total_leads ?? 0,
                          'Won Leads': r.won_leads ?? 0,
                        }))}
                        margin={{ top: 5, right: 30, left: 0, bottom: 60 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="Total Leads" fill={semanticColors.primary} />
                        <Bar dataKey="Won Leads" fill={semanticColors.success} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>Campaign Details</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Campaign Name</TableHead>
                          <TableHead className="text-right">Total Leads</TableHead>
                          <TableHead className="text-right">Won Leads</TableHead>
                          <TableHead className="text-right">Pipeline Value</TableHead>
                          <TableHead className="text-right">Conversion Rate</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...campaignsData].sort((a, b) => (b.total_leads ?? 0) - (a.total_leads ?? 0)).map((row, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{row.campaign_name ?? '—'}</TableCell>
                            <TableCell className="text-right">{row.total_leads ?? 0}</TableCell>
                            <TableCell className="text-right text-green-600">{row.won_leads ?? 0}</TableCell>
                            <TableCell className="text-right">{fmt(row.total_pipeline_value ?? 0)}</TableCell>
                            <TableCell className="text-right">
                              <Badge variant="secondary" className="text-xs">
                                {row.conversion_rate != null ? `${Number(row.conversion_rate).toFixed(1)}%` : '—'}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* ROI Tab */}
          <TabsContent value="roi" className="space-y-6">
            {loading ? renderSkeletons() : error ? renderError() : roiData.length === 0 ? renderEmpty() : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Lead Sources</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{roiData.length}</div>
                      <p className="text-xs text-muted-foreground mt-1">Active channels</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Total Leads</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{totalRoiLeads}</div>
                      <p className="text-xs text-muted-foreground mt-1">Across all sources</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{fmt(totalRoiRevenue)}</div>
                      <p className="text-xs text-muted-foreground mt-1">From won leads</p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Lead Source ROI</CardTitle>
                    <CardDescription>Revenue per lead and conversion rate by source</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart
                        data={roiData.map((r) => ({
                          name: r.source ?? '',
                          'Won Leads': r.won_leads ?? 0,
                          'Total Leads': r.total_leads ?? 0,
                        }))}
                        margin={{ top: 5, right: 30, left: 0, bottom: 40 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="Total Leads" fill={semanticColors.primary} />
                        <Bar dataKey="Won Leads" fill={semanticColors.success} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>Lead Source ROI Details</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Source</TableHead>
                          <TableHead className="text-right">Total Leads</TableHead>
                          <TableHead className="text-right">Won Leads</TableHead>
                          <TableHead className="text-right">Total Revenue</TableHead>
                          <TableHead className="text-right">Conversion Rate</TableHead>
                          <TableHead className="text-right">Revenue / Lead</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...roiData].sort((a, b) => (b.total_revenue ?? 0) - (a.total_revenue ?? 0)).map((row, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{row.source ?? '—'}</TableCell>
                            <TableCell className="text-right">{row.total_leads ?? 0}</TableCell>
                            <TableCell className="text-right text-green-600">{row.won_leads ?? 0}</TableCell>
                            <TableCell className="text-right">{fmt(row.total_revenue ?? 0)}</TableCell>
                            <TableCell className="text-right">
                              <Badge variant="secondary" className="text-xs">
                                {row.conversion_rate != null ? `${Number(row.conversion_rate).toFixed(1)}%` : '—'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">{fmt(row.revenue_per_lead ?? 0)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* Delivery Tab */}
          <TabsContent value="delivery" className="space-y-6">
            {loading ? renderSkeletons() : error ? renderError() : deliveryData.length === 0 ? renderEmpty() : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Total Sent</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{totalSent.toLocaleString()}</div>
                      <p className="text-xs text-muted-foreground mt-1">Messages dispatched</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Delivered</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-green-600">{totalDelivered.toLocaleString()}</div>
                      <p className="text-xs text-muted-foreground mt-1">Successfully delivered</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                        <AlertCircle className="h-4 w-4 text-red-500" />
                        Failed
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-red-600">{totalFailed.toLocaleString()}</div>
                      <p className="text-xs text-muted-foreground mt-1">Delivery failures</p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Delivery by Channel</CardTitle>
                    <CardDescription>Sent, delivered, and failed counts per channel</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart
                        data={deliveryData.map((r) => ({
                          name: `${r.channel ?? ''}${r.status ? ` (${r.status})` : ''}`,
                          Sent: r.sent_count ?? 0,
                          Delivered: r.delivered_count ?? 0,
                          Failed: r.failed_count ?? 0,
                        }))}
                        margin={{ top: 5, right: 30, left: 0, bottom: 40 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="Sent" fill={semanticColors.primary} />
                        <Bar dataKey="Delivered" fill={semanticColors.success} />
                        <Bar dataKey="Failed" fill={semanticColors.danger} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>Delivery Details</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Channel</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Sent</TableHead>
                          <TableHead className="text-right">Delivered</TableHead>
                          <TableHead className="text-right">Failed</TableHead>
                          <TableHead className="text-right">Delivery Rate</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {deliveryData.map((row, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{row.channel ?? '—'}</TableCell>
                            <TableCell><Badge variant="outline" className="text-xs">{row.status ?? '—'}</Badge></TableCell>
                            <TableCell className="text-right">{(row.sent_count ?? 0).toLocaleString()}</TableCell>
                            <TableCell className="text-right text-green-600">{(row.delivered_count ?? 0).toLocaleString()}</TableCell>
                            <TableCell className="text-right text-red-600">{(row.failed_count ?? 0).toLocaleString()}</TableCell>
                            <TableCell className="text-right">
                              <Badge variant="secondary" className="text-xs">
                                {row.delivery_rate != null ? `${Number(row.delivery_rate).toFixed(1)}%` : '—'}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
