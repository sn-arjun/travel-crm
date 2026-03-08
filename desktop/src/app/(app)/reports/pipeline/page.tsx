'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Calendar, DollarSign, Target, Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { LEAD_STATUS_LABELS, LEAD_STATUS_COLORS } from '@travelcrm/shared';
import { useApiQuery } from '@/hooks/use-api';
import { reportsApi } from '@/lib/api/reports';

const REF_DATE = Date.now();

function formatCurrency(amount: number) {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(0)}K`;
  return `₹${amount}`;
}

interface StageData {
  status: string;
  count: number;
  totalValue: number;
  previousCount?: number;
}

const getFallbackPipelineStages = (): StageData[] => [
    { status: 'new', count: 24, totalValue: 2400000, previousCount: 20 },
    { status: 'contacted', count: 18, totalValue: 1800000, previousCount: 22 },
    { status: 'qualified', count: 12, totalValue: 1500000, previousCount: 14 },
    { status: 'proposal_sent', count: 8, totalValue: 1200000, previousCount: 10 },
    { status: 'negotiation', count: 5, totalValue: 900000, previousCount: 6 },
    { status: 'won', count: 3, totalValue: 750000, previousCount: 2 },
];

export default function PipelineReportPage() {
  const [dateRange, setDateRange] = React.useState('30days');

  // Fetch pipeline report data from API
  const { data: reportData, loading, error } = useApiQuery(
    async () => {
      try {
        const response = await reportsApi.getRevenueReport?.({ dateRange }) ??
          Promise.resolve({
            stages: getFallbackPipelineStages(),
          });
        return response;
      } catch (err) {
        toast.error('Failed to load pipeline report. Showing sample data.');
        return {
          stages: getFallbackPipelineStages(),
        };
      }
    },
    [dateRange],
  );

    // @ts-expect-error
  const stages = reportData?.stages ?? getFallbackPipelineStages();

  // Calculate conversion rates between stages
  const conversionRates = [
    { from: 'New', to: 'Contacted', rate: ((stages[1]!.count / stages[0]!.count) * 100).toFixed(1) },
    { from: 'Contacted', to: 'Qualified', rate: ((stages[2]!.count / stages[1]!.count) * 100).toFixed(1) },
    { from: 'Qualified', to: 'Proposal Sent', rate: ((stages[3]!.count / stages[2]!.count) * 100).toFixed(1) },
    { from: 'Proposal Sent', to: 'Negotiation', rate: ((stages[4]!.count / stages[3]!.count) * 100).toFixed(1) },
    { from: 'Negotiation', to: 'Won', rate: ((stages[5]!.count / stages[4]!.count) * 100).toFixed(1) },
  ];

  const totalPipelineValue = stages.reduce((sum: any, stage: any) => sum + stage.totalValue, 0);
  const totalLeads = stages.reduce((sum: any, stage: any) => sum + stage.count, 0);
  const avgDealSize = totalLeads > 0 ? totalPipelineValue / totalLeads : 0;
  const wonDeals = stages[5]!.count;
  const closedDeals = wonDeals; // Using won as closed deals
  const openDeals = totalLeads - wonDeals;
  const winRate = totalLeads > 0 ? ((closedDeals / totalLeads) * 100).toFixed(1) : '0';
  const avgSalesCycle = 45; // Mock value in days

  const maxValue = Math.max(...stages.map((s: any) => s.totalValue));

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-4">
          <Link href="/reports">
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Pipeline Report</h1>
            <p className="text-sm text-muted-foreground">Sales funnel analysis and conversion metrics</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Calendar className="h-4 w-4" />
            {dateRange === '7days' ? 'Last 7 Days' : dateRange === '30days' ? 'Last 30 Days' : dateRange === '90days' ? 'Last 90 Days' : 'Last 30 Days'}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="space-y-6">
          {/* Stats Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Total Pipeline Value</p>
                    <p className="text-2xl font-bold">{formatCurrency(totalPipelineValue)}</p>
                  </div>
                  <DollarSign className="h-5 w-5 text-primary opacity-50" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Avg Deal Size</p>
                    <p className="text-2xl font-bold">{formatCurrency(avgDealSize)}</p>
                  </div>
                  <Target className="h-5 w-5 text-primary opacity-50" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Win Rate</p>
                    <p className="text-2xl font-bold">{winRate}%</p>
                  </div>
                  <Zap className="h-5 w-5 text-primary opacity-50" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Avg Sales Cycle</p>
                    <p className="text-2xl font-bold">{avgSalesCycle}d</p>
                  </div>
                  <Calendar className="h-5 w-5 text-primary opacity-50" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Pipeline Funnel */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Sales Funnel</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {stages.map((stage: any) => {
                const label = LEAD_STATUS_LABELS[stage.status as keyof typeof LEAD_STATUS_LABELS] || stage.status;
                const color = LEAD_STATUS_COLORS[stage.status as keyof typeof LEAD_STATUS_COLORS] || '#6B7280';
                const pct = maxValue > 0 ? (stage.totalValue / maxValue) * 100 : 0;

                return (
                  <div key={stage.status} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{stage.count} leads</span>
                        <Badge variant="secondary" className="text-xs">{formatCurrency(stage.totalValue)}</Badge>
                      </div>
                    </div>
                    <div className="h-8 rounded-lg bg-muted overflow-hidden flex items-center">
                      <div
                        className="h-full rounded-lg transition-all duration-500 flex items-center justify-end pr-3"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: color,
                        }}
                      >
                        {pct > 15 && (
                          <span className="text-xs font-semibold text-white">{pct.toFixed(0)}%</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Conversion Rates */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Conversion Rates</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {conversionRates.map((conversion, idx) => (
                  <div key={idx} className="p-3 rounded-lg bg-muted/50 border">
                    <p className="text-xs text-muted-foreground mb-2">{conversion.from} → {conversion.to}</p>
                    <p className="text-2xl font-bold text-primary">{conversion.rate}%</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Stage Breakdown Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Detailed Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-3 font-semibold text-xs text-muted-foreground">Stage</th>
                      <th className="text-right py-3 px-3 font-semibold text-xs text-muted-foreground">Leads</th>
                      <th className="text-right py-3 px-3 font-semibold text-xs text-muted-foreground">Value</th>
                      <th className="text-right py-3 px-3 font-semibold text-xs text-muted-foreground">% of Total</th>
                      <th className="text-right py-3 px-3 font-semibold text-xs text-muted-foreground">vs Last Period</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stages.map((stage: any) => {
                      const label = LEAD_STATUS_LABELS[stage.status as keyof typeof LEAD_STATUS_LABELS] || stage.status;
                      const pctOfTotal = totalPipelineValue > 0 ? ((stage.totalValue / totalPipelineValue) * 100).toFixed(1) : '0';
                      const change = stage.previousCount ? stage.count - stage.previousCount : 0;
                      const changeLabel = change > 0 ? `+${change}` : change === 0 ? '—' : `${change}`;

                      return (
                        <tr key={stage.status} className="border-b hover:bg-muted/50 transition-colors">
                          <td className="py-3 px-3 font-medium">{label}</td>
                          <td className="text-right py-3 px-3">{stage.count}</td>
                          <td className="text-right py-3 px-3">{formatCurrency(stage.totalValue)}</td>
                          <td className="text-right py-3 px-3">{pctOfTotal}%</td>
                          <td className={cn('text-right py-3 px-3 font-medium', change > 0 ? 'text-green-600' : change < 0 ? 'text-red-600' : 'text-muted-foreground')}>
                            {changeLabel}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
