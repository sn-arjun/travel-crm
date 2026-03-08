'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Download, Medal, TrendingUp, Users, Zap, DollarSign,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
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

interface TeamMember {
  id: string;
  name: string;
  role: string;
  avatar: string;
  leads: number;
  won: number;
  revenue: number;
  responseTime: number;
  completionRate: number;
  activitiesPerWeek: number;
}

const getFallbackTeamData = (): TeamMember[] => {
  const names = [
    { name: 'Arjun S', role: 'Senior Consultant' },
    { name: 'Priya M', role: 'Travel Specialist' },
    { name: 'Rahul K', role: 'Account Executive' },
    { name: 'Sneha D', role: 'Booking Coordinator' },
    { name: 'Vikram P', role: 'Lead Generator' },
  ];

  return names.map((member: any, idx: number) => {
    const seed = REF_DATE + idx;
    const leads = 120 + (seed % 80);
    const won = Math.floor(leads * (0.65 + (seed % 20) / 100));
    const revenue = won * (45000 + (seed % 35000));
    const responseTime = 2 + ((seed % 8) / 10);
    const completionRate = 78 + (seed % 22);
    const activitiesPerWeek = 45 + (seed % 35);

    return {
      id: `team-${idx}`,
      name: member.name,
      role: member.role,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${member.name}`,
      leads,
      won,
      revenue,
      responseTime,
      completionRate,
      activitiesPerWeek,
    };
  });
};

const getFallbackActivityData = () => {
  const team = getFallbackTeamData();
  const weeks = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
  const data = weeks.map((week, widx) => {
    const entry: Record<string, string | number> = { week };
    team.forEach((member, idx) => {
      const seed = REF_DATE + idx + widx;
      entry[member.name] = 40 + (seed % 30);
    });
    return entry;
  });
  return data;
};

const getFallbackResponseTimeData = () => {
  const team = getFallbackTeamData();
  return team.map((member: any) => ({
    name: member.name.split(' ')[0],
    'Avg Response Time (hrs)': parseFloat(member.responseTime.toFixed(1)),
  }));
};

const getFallbackTaskCompletionData = () => {
  const team = getFallbackTeamData();
  return team.map((member: any) => ({
    name: member.name.split(' ')[0],
    Completed: Math.floor(member.activitiesPerWeek * 0.85),
    Pending: Math.floor(member.activitiesPerWeek * 0.15),
  }));
};

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function TeamReportsPage() {
  const [dateRange, setDateRange] = React.useState('30days');

  // Fetch team report data from API
  const { data: reportData, loading, error } = useApiQuery(
    async () => {
      try {
        const response = await reportsApi.getTeamReport?.({ dateRange }) ??
          Promise.resolve({
            team: getFallbackTeamData(),
            activity: getFallbackActivityData(),
            responseTime: getFallbackResponseTimeData(),
            taskCompletion: getFallbackTaskCompletionData(),
          });
        return response;
      } catch (err) {
        toast.error('Failed to load team report. Showing sample data.');
        return {
          team: getFallbackTeamData(),
          activity: getFallbackActivityData(),
          responseTime: getFallbackResponseTimeData(),
          taskCompletion: getFallbackTaskCompletionData(),
        };
      }
    },
    [dateRange],
  );

    // @ts-expect-error
  const team = reportData?.team ?? getFallbackTeamData();
    // @ts-expect-error
  const activityData = reportData?.activity ?? getFallbackActivityData();
    // @ts-expect-error
  const responseTimeData = reportData?.responseTime ?? getFallbackResponseTimeData();
    // @ts-expect-error
  const taskCompletionData = reportData?.taskCompletion ?? getFallbackTaskCompletionData();

  const totalLeads = team.reduce((sum: any, m: any) => sum + m.leads, 0);
  const totalWon = team.reduce((sum: any, m: any) => sum + m.won, 0);
  const totalRevenue = team.reduce((sum: any, m: any) => sum + m.revenue, 0);
  const avgConversionRate = ((totalWon / totalLeads) * 100).toFixed(1);

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
              Team Performance Reports
            </h1>
            <p className="text-sm text-muted-foreground">Individual and team performance metrics</p>
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Leads</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-2">
                  <div className="text-2xl font-bold">{totalLeads}</div>
                  <TrendingUp className="h-4 w-4 text-green-500 mb-1" />
                </div>
                <p className="text-xs text-muted-foreground mt-1">All team members</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Deals Won</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-2">
                  <div className="text-2xl font-bold">{totalWon}</div>
                  <TrendingUp className="h-4 w-4 text-green-500 mb-1" />
                </div>
                <p className="text-xs text-muted-foreground mt-1">Conversion: {avgConversionRate}%</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ₹
                  {(totalRevenue / 100000).toFixed(1)}
                  L
                </div>
                <p className="text-xs text-muted-foreground mt-1">Team contribution</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Team Members</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-2">
                  <div className="text-2xl font-bold">{team.length}</div>
                  <Users className="h-4 w-4 text-blue-500 mb-1" />
                </div>
                <p className="text-xs text-muted-foreground mt-1">Active consultants</p>
              </CardContent>
            </Card>
          </div>

          {/* Individual Performance Cards */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Team Members Performance</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {team.map((member: any) => (
                <Card key={member.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        <img
                          src={member.avatar}
                          alt={member.name}
                          className="h-10 w-10 rounded-full"
                        />
                        <div>
                          <CardTitle className="text-sm">{member.name}</CardTitle>
                          <p className="text-xs text-muted-foreground">{member.role}</p>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Leads</p>
                        <p className="text-lg font-semibold">{member.leads}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Won</p>
                        <p className="text-lg font-semibold">{member.won}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Revenue</p>
                        <p className="text-lg font-semibold">
                          ₹
                          {(member.revenue / 100000).toFixed(1)}
                          L
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Response</p>
                        <p className="text-lg font-semibold">{member.responseTime.toFixed(1)}h</p>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">
                        {member.completionRate}
                        % Completion
                      </Badge>
                      <Badge
                        variant="secondary"
                        className="text-xs"
                      >
                        {member.activitiesPerWeek}
                        {' '}
                        Activities
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Response Time Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Average Response Time</CardTitle>
                <CardDescription>Hours to first response</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={responseTimeData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="Avg Response Time (hrs)" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Activity Report Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Activity Report</CardTitle>
                <CardDescription>Activities per person per week</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={activityData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="week" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    {team.map((member: any, idx: number) => (
                      <Line
                        key={member.id}
                        type="monotone"
                        dataKey={member.name}
                        stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                        strokeWidth={2}
                        dot={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Task Completion Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Task Completion Status</CardTitle>
                <CardDescription>Completed vs Pending tasks</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={taskCompletionData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="Completed" fill="#10b981" />
                    <Bar dataKey="Pending" fill="#f59e0b" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Leaderboard */}
            <Card>
              <CardHeader>
                <CardTitle>Team Leaderboard</CardTitle>
                <CardDescription>Top performers by revenue</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[...team]
                    .sort((a: any, b: any) => b.revenue - a.revenue)
                    .map((member: any, idx: number) => {
                      let medal: React.ReactNode = null;
                      if (idx === 0) {
                        medal = <Medal className="h-4 w-4 text-yellow-500" />;
                      } else if (idx === 1) {
                        medal = <Medal className="h-4 w-4 text-gray-400" />;
                      } else if (idx === 2) {
                        medal = <Medal className="h-4 w-4 text-orange-600" />;
                      }

                      return (
                        <div key={member.id} className="flex items-center justify-between py-2 border-b last:border-b-0">
                          <div className="flex items-center gap-3 flex-1">
                            <span className="text-sm font-semibold w-6">{idx + 1}</span>
                            {medal && <div>{medal}</div>}
                            <span className="text-sm">{member.name}</span>
                          </div>
                          <div className="text-sm font-semibold">
                            ₹
                            {(member.revenue / 100000).toFixed(1)}
                            L
                          </div>
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
