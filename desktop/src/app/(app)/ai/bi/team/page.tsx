'use client';

import * as React from 'react';
import { Users, RefreshCw, Trophy, TrendingUp, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useApiQuery } from '@/hooks/use-api';
import { aiApi, type TeamPerformanceMetrics } from '@/lib/api/ai';

export default function TeamPerformancePage() {
  const [period, setPeriod] = React.useState('month');

  const { data, loading, refetch } = useApiQuery(
    () => aiApi.bi.getTeamPerformance({ period }),
    [period],
  );

  const team: TeamPerformanceMetrics[] = (data as { data?: TeamPerformanceMetrics[] })?.data ?? [];

  const maxRevenue = Math.max(...team.map((t) => t.revenue), 1);
  const maxDeals = Math.max(...team.map((t) => t.dealsClosedCount), 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Team Performance</h1>
          <p className="text-muted-foreground mt-1">
            Agent performance metrics and comparisons
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="quarter">This Quarter</SelectItem>
              <SelectItem value="year">This Year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="gap-2" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : team.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-muted-foreground">
              <Users className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">No team performance data available</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Revenue</p>
                    <p className="text-2xl font-bold mt-1">
                      ${team.reduce((s, t) => s + t.revenue, 0).toLocaleString()}
                    </p>
                  </div>
                  <DollarSign className="h-8 w-8 text-emerald-600 opacity-50" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Deals Closed</p>
                    <p className="text-2xl font-bold mt-1">
                      {team.reduce((s, t) => s + t.dealsClosedCount, 0)}
                    </p>
                  </div>
                  <Trophy className="h-8 w-8 text-amber-600 opacity-50" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Avg Conversion Rate</p>
                    <p className="text-2xl font-bold mt-1">
                      {(team.reduce((s, t) => s + t.conversionRate, 0) / team.length).toFixed(1)}%
                    </p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-blue-600 opacity-50" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Team Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Team Members</CardTitle>
              <CardDescription>Individual performance breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left px-4 py-3 font-medium">Rank</th>
                      <th className="text-left px-4 py-3 font-medium">Agent</th>
                      <th className="text-right px-4 py-3 font-medium">Deals</th>
                      <th className="text-right px-4 py-3 font-medium">Revenue</th>
                      <th className="text-right px-4 py-3 font-medium">Conversion</th>
                      <th className="text-right px-4 py-3 font-medium">Avg Deal</th>
                      <th className="px-4 py-3 font-medium">Revenue Bar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {team
                      .sort((a, b) => b.revenue - a.revenue)
                      .map((member, idx) => (
                        <tr key={member.userId} className="border-t hover:bg-muted/30">
                          <td className="px-4 py-3">
                            {idx === 0 ? (
                              <Trophy className="h-4 w-4 text-amber-500" />
                            ) : (
                              <span className="text-muted-foreground">{idx + 1}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 font-medium">{member.userName}</td>
                          <td className="px-4 py-3 text-right">{member.dealsClosedCount}</td>
                          <td className="px-4 py-3 text-right font-semibold">
                            ${member.revenue.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-xs',
                                member.conversionRate >= 30
                                  ? 'text-emerald-600'
                                  : member.conversionRate >= 15
                                    ? 'text-amber-600'
                                    : 'text-red-600',
                              )}
                            >
                              {member.conversionRate.toFixed(1)}%
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right">
                            ${member.avgDealValue.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 w-32">
                            <Progress
                              value={(member.revenue / maxRevenue) * 100}
                              className="h-2"
                            />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
