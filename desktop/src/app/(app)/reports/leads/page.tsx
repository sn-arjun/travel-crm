'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Download, Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useApiQuery } from '@/hooks/use-api';
import { reportsApi } from '@/lib/api/reports';

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

// Fallback data
const getFallbackPipelineData = () => [
  { stage: 'New', leads: 45, value: 5400000 },
  { stage: 'Contacted', leads: 38, value: 4560000 },
  { stage: 'Qualified', leads: 28, value: 3920000 },
  { stage: 'Proposal Sent', leads: 18, value: 2700000 },
  { stage: 'Negotiation', leads: 12, value: 1800000 },
  { stage: 'Won', leads: 8, value: 1600000 },
];

const getFallbackLeadAgeingData = () => [
  { age: '0-7 days', count: 52, percentage: 28 },
  { age: '8-14 days', count: 38, percentage: 21 },
  { age: '15-30 days', count: 42, percentage: 23 },
  { age: '30+ days', count: 48, percentage: 28 },
];

const getFallbackSourceAnalysisData = () => [
  { name: 'Website', value: 38, conversion: 28.5 },
  { name: 'Referral', value: 24, conversion: 35.2 },
  { name: 'Social', value: 18, conversion: 22.3 },
  { name: 'Walk-in', value: 12, conversion: 18.4 },
  { name: 'Agent', value: 8, conversion: 42.1 },
];

const getFallbackResponseTimeData = () => {
  const weeks = ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5', 'Week 6', 'Week 7', 'Week 8', 'Week 9', 'Week 10', 'Week 11', 'Week 12'];
  return weeks.map((week, i) => ({
    week,
    responseTime: 4.2 + (i * 0.3) - (i % 3) * 0.5,
  }));
};

const getFallbackLeadVelocityData = () => Array.from({ length: 12 }, (_, i) => ({
  week: `Week ${i + 1}`,
  newLeads: 18 + (i * 2) - (i % 2) * 3,
}));

const getFallbackHotLeadsData = () => [
  { name: 'Rahul Sharma', score: 95, priority: 'Hot', source: 'Referral', value: 450000, daysOld: 2 },
  { name: 'Priya Patel', score: 92, priority: 'Hot', source: 'Website', value: 380000, daysOld: 3 },
  { name: 'Amit Kumar', score: 88, priority: 'Hot', source: 'Agent', value: 520000, daysOld: 5 },
  { name: 'Sneha Reddy', score: 85, priority: 'Warm', source: 'Social', value: 320000, daysOld: 7 },
  { name: 'Vikram Singh', score: 82, priority: 'Warm', source: 'Referral', value: 410000, daysOld: 4 },
  { name: 'Ananya Gupta', score: 79, priority: 'Warm', source: 'Website', value: 290000, daysOld: 9 },
  { name: 'Kiran Desai', score: 76, priority: 'Warm', source: 'Walk-in', value: 350000, daysOld: 11 },
  { name: 'Meera Nair', score: 73, priority: 'Cold', source: 'Agent', value: 280000, daysOld: 15 },
  { name: 'Rajesh Joshi', score: 70, priority: 'Cold', source: 'Referral', value: 310000, daysOld: 18 },
  { name: 'Pooja Verma', score: 67, priority: 'Cold', source: 'Website', value: 275000, daysOld: 22 },
];

const getFallbackLostReasonData = () => [
  { name: 'Budget Issues', value: 28, count: 7 },
  { name: 'Chose Competitor', value: 32, count: 8 },
  { name: 'Timeline Mismatch', value: 18, count: 5 },
  { name: 'No Interest', value: 14, count: 4 },
  { name: 'Other', value: 8, count: 2 },
];

function SummaryCard({ label, value, subtext }: { label: string; value: string; subtext?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground mb-1">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
        {subtext && <p className="text-xs text-muted-foreground">{subtext}</p>}
      </CardContent>
    </Card>
  );
}

function DateRangeSelector({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium">Date Range:</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-[180px]">
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
    </div>
  );
}

export default function LeadReportsPage() {
  const [dateRange, setDateRange] = React.useState('30days');

  // Fetch lead report data from API
  const { data: reportData, loading, error } = useApiQuery(
    async () => {
      try {
        const response = await reportsApi.getLeadReport?.({ dateRange }) ??
          Promise.resolve({
            pipeline: getFallbackPipelineData(),
            ageing: getFallbackLeadAgeingData(),
            sources: getFallbackSourceAnalysisData(),
            responseTime: getFallbackResponseTimeData(),
            velocity: getFallbackLeadVelocityData(),
            hotLeads: getFallbackHotLeadsData(),
            lostReasons: getFallbackLostReasonData(),
          });
        return response;
      } catch (err) {
        toast.error('Failed to load lead report. Showing sample data.');
        return {
          pipeline: getFallbackPipelineData(),
          ageing: getFallbackLeadAgeingData(),
          sources: getFallbackSourceAnalysisData(),
          responseTime: getFallbackResponseTimeData(),
          velocity: getFallbackLeadVelocityData(),
          hotLeads: getFallbackHotLeadsData(),
          lostReasons: getFallbackLostReasonData(),
        };
      }
    },
    [dateRange],
  );

  // Use fallback data if API is not available
    // @ts-expect-error
  const pipelineData = reportData?.pipeline ?? getFallbackPipelineData();
    // @ts-expect-error
  const leadAgeingData = reportData?.ageing ?? getFallbackLeadAgeingData();
    // @ts-expect-error
  const sourceAnalysisData = reportData?.sources ?? getFallbackSourceAnalysisData();
    // @ts-expect-error
  const responseTimeData = reportData?.responseTime ?? getFallbackResponseTimeData();
    // @ts-expect-error
  const leadVelocityData = reportData?.velocity ?? getFallbackLeadVelocityData();
    // @ts-expect-error
  const hotLeadsData = reportData?.hotLeads ?? getFallbackHotLeadsData();
    // @ts-expect-error
  const lostReasonData = reportData?.lostReasons ?? getFallbackLostReasonData();

  const totalLeads = pipelineData.reduce((sum: any, d: any) => sum + d.leads, 0);
  const totalValue = pipelineData.reduce((sum: any, d: any) => sum + d.value, 0);
  const conversionRate = ((pipelineData[pipelineData.length - 1]?.leads ?? 0) / (pipelineData[0]?.leads ?? 1) * 100).toFixed(1);

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="px-6 py-4 border-b">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Link href="/reports">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Lead Reports</h1>
              <p className="text-sm text-muted-foreground">Pipeline, ageing, and conversion analysis</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4 mr-1.5" />
              Filter
            </Button>
            <Button size="sm" className="bg-primary text-primary-foreground">
              <Download className="h-4 w-4 mr-1.5" />
              Export
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard label="Total Leads" value={totalLeads.toString()} subtext="In pipeline" />
          <SummaryCard label="Pipeline Value" value={`₹${(totalValue / 10000000).toFixed(1)}Cr`} subtext="Total value" />
          <SummaryCard label="Conversion Rate" value={`${conversionRate}%`} subtext="New to Won" />
          <SummaryCard label="Avg Response" value="4.5h" subtext="First response" />
        </div>
      </div>

      <div className="px-6 py-3 border-b bg-muted/50 flex justify-between items-center">
        <DateRangeSelector value={dateRange} onChange={setDateRange} />
      </div>

      <div className="flex-1 p-6 overflow-auto">
        <Tabs defaultValue="pipeline" className="w-full">
          <TabsList className="grid w-full grid-cols-5 lg:grid-cols-8 mb-6">
            <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
            <TabsTrigger value="ageing">Ageing</TabsTrigger>
            <TabsTrigger value="source">Source</TabsTrigger>
            <TabsTrigger value="response">Response</TabsTrigger>
            <TabsTrigger value="followup" className="hidden lg:block">Follow-up</TabsTrigger>
            <TabsTrigger value="hotleads" className="hidden lg:block">Hot Leads</TabsTrigger>
            <TabsTrigger value="lost" className="hidden lg:block">Lost</TabsTrigger>
            <TabsTrigger value="velocity" className="hidden lg:block">Velocity</TabsTrigger>
            <TabsTrigger value="more" className="lg:hidden">More</TabsTrigger>
          </TabsList>

          <TabsContent value="pipeline" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pipeline Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={pipelineData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="stage" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="leads" fill="#3b82f6" name="Lead Count" />
                    <Bar dataKey="value" fill="#10b981" name="Pipeline Value" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ageing" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Lead Ageing Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={leadAgeingData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="age" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#f59e0b" name="Lead Count" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="source" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Lead Sources Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={sourceAnalysisData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value }) => `${name} (${value}%)`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {sourceAnalysisData.map((entry: any, index: any) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => `${value}%`} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Source Conversion Rates</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {sourceAnalysisData.map((source: any) => (
                      <div key={source.name}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium">{source.name}</span>
                          <span className="text-sm font-semibold">{source.conversion}%</span>
                        </div>
                        <Progress value={source.conversion} className="h-2" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="response" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Average Response Time (Hours)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={responseTimeData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="week" />
                    <YAxis />
                    <Tooltip formatter={(value) => `${(value as number).toFixed(1)}h`} />
                    <Legend />
                    <Line type="monotone" dataKey="responseTime" stroke="#8b5cf6" name="Response Time" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="followup" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Follow-up Compliance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">On-Time Follow-ups</span>
                      <span className="text-2xl font-bold">82.5%</span>
                    </div>
                    <Progress value={82.5} className="h-3" />
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-4">
                    <div className="bg-green-50 p-3 rounded-lg">
                      <p className="text-xs text-muted-foreground mb-1">Completed On Time</p>
                      <p className="text-lg font-bold text-green-600">162</p>
                    </div>
                    <div className="bg-red-50 p-3 rounded-lg">
                      <p className="text-xs text-muted-foreground mb-1">Delayed</p>
                      <p className="text-lg font-bold text-red-600">34</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="hotleads" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top 10 Hot Leads</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Score</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Value</TableHead>
                        <TableHead>Age</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {hotLeadsData.map((lead: any) => (
                        <TableRow key={lead.name}>
                          <TableCell className="font-medium">{lead.name}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{lead.score}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={lead.priority === 'Hot' ? 'default' : lead.priority === 'Warm' ? 'secondary' : 'outline'}>
                              {lead.priority}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{lead.source}</TableCell>
                          <TableCell className="text-sm font-medium">₹{(lead.value / 100000).toFixed(1)}L</TableCell>
                          <TableCell className="text-sm">{lead.daysOld}d ago</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="lost" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Lost Lead Reasons</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={lostReasonData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name} (${value}%)`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {lostReasonData.map((entry: any, index: any) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => `${value}%`} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="velocity" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Lead Velocity Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={leadVelocityData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="week" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="newLeads" stroke="#10b981" name="New Leads" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="more" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Follow-up Compliance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">On-Time Follow-ups</span>
                      <span className="text-xl font-bold">82.5%</span>
                    </div>
                    <Progress value={82.5} className="h-2" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Lost Reasons</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={lostReasonData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name }) => name}
                      outerRadius={80}
                      dataKey="value"
                    >
                      {lostReasonData.map((entry: any, index: any) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Lead Velocity</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={leadVelocityData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="week" />
                    <YAxis />
                    <Line type="monotone" dataKey="newLeads" stroke="#10b981" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
