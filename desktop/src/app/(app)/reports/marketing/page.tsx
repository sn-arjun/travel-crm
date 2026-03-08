'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Download, TrendingUp, Zap, Share2, MessageSquare, Heart,
} from 'lucide-react';
import {
  BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { toast } from 'sonner';
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
import { cn } from '@/lib/utils';
import { useApiQuery } from '@/hooks/use-api';
import { reportsApi } from '@/lib/api/reports';

const REF_DATE = Date.now();
const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

interface Campaign {
  id: string;
  name: string;
  sent: number;
  opened: number;
  clicked: number;
  converted: number;
  status: 'Active' | 'Completed' | 'Scheduled';
}

interface LeadSource {
  source: string;
  costPerLead: number;
  valuePerLead: number;
  leadsGenerated: number;
}

interface SocialMetric {
  platform: string;
  followers: number;
  engagement: number;
  posts: number;
  impressions: number;
}

const getFallbackCampaigns = (): Campaign[] => {
  const campaignNames = [
    'Summer Travel Sale 2026',
    'Early Bird Destination Deals',
    'Family Vacation Package',
    'Adventure Tours Campaign',
    'Luxury Getaways Exclusive',
    'Weekend Escape Deals',
    'International Travel Promos',
  ];

  return campaignNames.map((name, idx) => {
    const seed = REF_DATE + idx;
    const sent = 10000 + (seed % 40000);
    const opened = Math.floor(sent * (0.25 + (seed % 20) / 100));
    const clicked = Math.floor(opened * (0.15 + (seed % 15) / 100));
    const converted = Math.floor(clicked * (0.08 + (seed % 12) / 100));

    const statuses: Campaign['status'][] = ['Active', 'Completed', 'Scheduled'];
    const status = statuses[seed % 3] ?? 'Active';

    return {
      id: `campaign-${idx}`,
      name,
      sent,
      opened,
      clicked,
      converted,
      status,
    };
  });
};

const getFallbackLeadSources = (): LeadSource[] => {
  const sources = [
    'Google Ads',
    'Facebook Ads',
    'Instagram Ads',
    'Email Marketing',
    'LinkedIn',
    'Organic Search',
    'Direct Traffic',
  ];

  return sources.map((source, idx) => {
    const seed = REF_DATE + idx;
    const costPerLead = 150 + (seed % 350);
    const valuePerLead = 5000 + (seed % 15000);
    const leadsGenerated = 50 + (seed % 200);

    return {
      source,
      costPerLead,
      valuePerLead,
      leadsGenerated,
    };
  });
};

const getFallbackSocialMetrics = (): SocialMetric[] => {
  const platforms = [
    { platform: 'Instagram', icon: '📷' },
    { platform: 'Facebook', icon: '👍' },
    { platform: 'LinkedIn', icon: '💼' },
    { platform: 'Twitter', icon: '🐦' },
  ];

  return platforms.map((p, idx) => {
    const seed = REF_DATE + idx;
    const followers = 5000 + (seed % 15000);
    const engagement = 2.5 + ((seed % 30) / 10);
    const posts = 10 + (seed % 20);
    const impressions = 50000 + (seed % 200000);

    return {
      platform: p.platform,
      followers,
      engagement: parseFloat(engagement.toFixed(1)),
      posts,
      impressions,
    };
  });
};

const getFallbackMonthlySpendData = () => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months.map((month, idx) => {
    const seed = REF_DATE + idx;
    const spend = 200000 + (seed % 300000);
    return {
      month,
      Spend: spend,
    };
  });
};

const getFallbackEmailDeliveryData = () => {
  const seed = REF_DATE;
  const total = 100000;
  const delivered = Math.floor(total * 0.95);
  const bounced = Math.floor(total * 0.03);
  const spam = Math.floor(total * 0.02);

  return [
    { name: 'Delivered', value: delivered },
    { name: 'Bounced', value: bounced },
    { name: 'Spam', value: spam },
  ];
};

export default function MarketingReportsPage() {
  const [dateRange, setDateRange] = React.useState('30days');

  // Fetch marketing report data from API
  const { data: reportData, loading, error } = useApiQuery(
    async () => {
      try {
        const response = await reportsApi.getMarketingReport?.({ dateRange }) ??
          Promise.resolve({
            campaigns: getFallbackCampaigns(),
            leadSources: getFallbackLeadSources(),
            socialMetrics: getFallbackSocialMetrics(),
            monthlySpend: getFallbackMonthlySpendData(),
            emailDelivery: getFallbackEmailDeliveryData(),
          });
        return response;
      } catch (err) {
        toast.error('Failed to load marketing report. Showing sample data.');
        return {
          campaigns: getFallbackCampaigns(),
          leadSources: getFallbackLeadSources(),
          socialMetrics: getFallbackSocialMetrics(),
          monthlySpend: getFallbackMonthlySpendData(),
          emailDelivery: getFallbackEmailDeliveryData(),
        };
      }
    },
    [dateRange],
  );

    // @ts-expect-error
  const campaigns = reportData?.campaigns ?? getFallbackCampaigns();
    // @ts-expect-error
  const leadSources = reportData?.leadSources ?? getFallbackLeadSources();
    // @ts-expect-error
  const socialMetrics = reportData?.socialMetrics ?? getFallbackSocialMetrics();
    // @ts-expect-error
  const monthlySpendData = reportData?.monthlySpend ?? getFallbackMonthlySpendData();
    // @ts-expect-error
  const emailDeliveryData = reportData?.emailDelivery ?? getFallbackEmailDeliveryData();

  const totalSent = campaigns.reduce((sum: any, c: any) => sum + c.sent, 0);
  const totalOpened = campaigns.reduce((sum: any, c: any) => sum + c.opened, 0);
  const totalClicked = campaigns.reduce((sum: any, c: any) => sum + c.clicked, 0);
  const totalConverted = campaigns.reduce((sum: any, c: any) => sum + c.converted, 0);

  const avgOpenRate = ((totalOpened / totalSent) * 100).toFixed(1);
  const avgClickRate = ((totalClicked / totalOpened) * 100).toFixed(1);
  const avgConversionRate = ((totalConverted / totalClicked) * 100).toFixed(1);

  const topConvertingCampaigns = [...campaigns]
    .sort((a: any, b: any) => {
      const aConvRate = (a.converted / a.clicked) * 100;
      const bConvRate = (b.converted / b.clicked) * 100;
      return bConvRate - aConvRate;
    })
    .slice(0, 5);

  const leadSourceData = leadSources.map((source: any) => ({
    name: source.source,
    'Cost Per Lead': source.costPerLead,
    'Value Per Lead': source.valuePerLead,
  }));

  const totalMarketingSpend = monthlySpendData.reduce((sum: any, m: any) => sum + (m.Spend as number), 0);
  const avgMonthlySpend = Math.floor(totalMarketingSpend / 12);

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <Link href="/reports">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              Marketing Reports
            </h1>
            <p className="text-sm text-muted-foreground">Campaign performance and marketing metrics</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-1.5" />
            Export
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-auto">
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Open Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{avgOpenRate}%</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {totalOpened}
                  {' '}
                  opens
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Click Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{avgClickRate}%</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {totalClicked}
                  {' '}
                  clicks
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Conversion Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{avgConversionRate}%</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {totalConverted}
                  {' '}
                  conversions
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Sent</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{(totalSent / 1000).toFixed(0)}K</div>
                <p className="text-xs text-muted-foreground mt-1">Across campaigns</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Avg Monthly Spend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">₹{(avgMonthlySpend / 100000).toFixed(1)}L</div>
                <p className="text-xs text-muted-foreground mt-1">Marketing budget</p>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Lead Source ROI */}
            <Card>
              <CardHeader>
                <CardTitle>Lead Source ROI</CardTitle>
                <CardDescription>Cost per lead vs Value per lead</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={leadSourceData}
                    margin={{ top: 5, right: 30, left: 0, bottom: 40 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                    <YAxis />
                    <Tooltip formatter={(value) => `₹${value}`} />
                    <Legend />
                    <Bar dataKey="Cost Per Lead" fill="#ef4444" />
                    <Bar dataKey="Value Per Lead" fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Email Delivery Status */}
            <Card>
              <CardHeader>
                <CardTitle>Email Delivery Status</CardTitle>
                <CardDescription>Message delivery breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={emailDeliveryData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name} (${value})`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      <Cell fill="#10b981" />
                      <Cell fill="#f59e0b" />
                      <Cell fill="#ef4444" />
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Monthly Spend */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Monthly Marketing Spend</CardTitle>
                <CardDescription>Total spend over 12 months</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={monthlySpendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value) => `₹${(value as number / 100000).toFixed(1)}L`} />
                    <Area type="monotone" dataKey="Spend" fill="#8b5cf6" stroke="#8b5cf6" fillOpacity={0.6} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Social Media Metrics */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Social Media Performance</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {socialMetrics.map((metric: any) => (
                <Card key={metric.platform}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">{metric.platform}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between items-center pb-2 border-b">
                      <span className="text-xs text-muted-foreground">Followers</span>
                      <span className="font-semibold">{(metric.followers / 1000).toFixed(1)}K</span>
                    </div>
                    <div className="flex justify-between items-center pb-2 border-b">
                      <span className="text-xs text-muted-foreground">Engagement</span>
                      <span className="font-semibold">{metric.engagement}%</span>
                    </div>
                    <div className="flex justify-between items-center pb-2 border-b">
                      <span className="text-xs text-muted-foreground">Posts</span>
                      <span className="font-semibold">{metric.posts}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Impressions</span>
                      <span className="font-semibold">{(metric.impressions / 1000).toFixed(0)}K</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Tables */}
          <div className="space-y-6">
            {/* Campaign Performance Table */}
            <Card>
              <CardHeader>
                <CardTitle>Campaign Performance</CardTitle>
                <CardDescription>Email campaign metrics and conversion rates</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Campaign Name</TableHead>
                        <TableHead className="text-right">Sent</TableHead>
                        <TableHead className="text-right">Opened</TableHead>
                        <TableHead className="text-right">Clicked</TableHead>
                        <TableHead className="text-right">Converted</TableHead>
                        <TableHead className="text-right">CTR %</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {campaigns.map((campaign: any) => {
                        const ctr = ((campaign.clicked / campaign.sent) * 100).toFixed(2);
                        return (
                          <TableRow key={campaign.id}>
                            <TableCell className="font-medium">{campaign.name}</TableCell>
                            <TableCell className="text-right">{campaign.sent}</TableCell>
                            <TableCell className="text-right">{campaign.opened}</TableCell>
                            <TableCell className="text-right">{campaign.clicked}</TableCell>
                            <TableCell className="text-right">{campaign.converted}</TableCell>
                            <TableCell className="text-right font-semibold">{ctr}%</TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  campaign.status === 'Active'
                                    ? 'default'
                                    : campaign.status === 'Completed'
                                      ? 'secondary'
                                      : 'outline'
                                }
                                className="text-xs"
                              >
                                {campaign.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Top Converting Campaigns */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Top Converting Campaigns
                </CardTitle>
                <CardDescription>Ranked by conversion rate</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Rank</TableHead>
                        <TableHead>Campaign Name</TableHead>
                        <TableHead className="text-right">Conversions</TableHead>
                        <TableHead className="text-right">Conversion Rate %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topConvertingCampaigns.map((campaign, idx) => {
                        const convRate = ((campaign.converted / campaign.clicked) * 100).toFixed(2);
                        return (
                          <TableRow key={campaign.id}>
                            <TableCell className="font-semibold">{idx + 1}</TableCell>
                            <TableCell className="font-medium">{campaign.name}</TableCell>
                            <TableCell className="text-right">{campaign.converted}</TableCell>
                            <TableCell className="text-right">
                              <span className="font-semibold text-green-600">{convRate}%</span>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
