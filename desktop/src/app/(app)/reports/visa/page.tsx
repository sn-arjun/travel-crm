'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Download, CheckCircle2, Clock, AlertCircle, FileText, Calendar,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
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

interface VisaApplication {
  id: string;
  travelerName: string;
  destination: string;
  status: 'Applied' | 'In Progress' | 'Approved' | 'Rejected' | 'Expired';
  applicationDate: string;
  approvalDate?: string;
  expiryDate?: string;
  missingDocs?: string[];
  travelDate: string;
  processingDays?: number;
}

const destinations = [
  'USA', 'UK', 'Canada', 'Australia', 'Germany', 'France', 'Japan', 'Singapore',
  'Thailand', 'Malaysia', 'UAE', 'Switzerland',
];

const getFallbackVisaApplications = (): VisaApplication[] => {
  const travelers = [
    'Rajesh Kumar', 'Anjali Sharma', 'Vikram Singh', 'Priya Patel',
    'Amit Gupta', 'Sneha Desai', 'Rohan Iyer', 'Neha Kapoor',
    'Arjun Reddy', 'Divya Nair', 'Sanjay Menon', 'Kavya Verma',
    'Nitin Shah', 'Simran Kaur', 'Arun Pillai', 'Pooja Sinha',
    'Karan Malik', 'Nisha Rao', 'Deepak Chopra', 'Isha Deshmukh',
    'Manish Verma', 'Riya Singh', 'Aditya Patel', 'Zara Khan',
  ];

  const missingDocsList = [
    ['Passport Copy', 'Bank Statement'],
    ['Medical Certificate'],
    ['Employment Letter', 'Bank Statement'],
    ['Travel Insurance'],
    [],
  ];

  return travelers.map((name, idx) => {
    const seed = REF_DATE + idx;
    const statusIdx = seed % 5;
    const statuses: VisaApplication['status'][] = ['Applied', 'In Progress', 'Approved', 'Rejected', 'Expired'];
    const status = statuses[statusIdx] ?? 'Applied';

    const destination = destinations[(seed * 7) % destinations.length] ?? destinations[0] ?? 'Unknown';
    const applicationDaysAgo = 60 - (seed % 50);
    const applicationDate = new Date(REF_DATE - applicationDaysAgo * 24 * 60 * 60 * 1000);

    const processingDays = 15 + (seed % 30);
    const approvalDate = new Date(applicationDate.getTime() + processingDays * 24 * 60 * 60 * 1000);

    const travelDaysFromNow = 30 + (seed % 120);
    const travelDate = new Date(REF_DATE + travelDaysFromNow * 24 * 60 * 60 * 1000);

    const expiryDaysFromNow = 365 + (seed % 730);
    const expiryDate = new Date(REF_DATE + expiryDaysFromNow * 24 * 60 * 60 * 1000);

    const docs = missingDocsList[(seed % 5)] ?? [];

    return {
      id: `visa-${idx}`,
      travelerName: name,
      destination,
      status,
      applicationDate: applicationDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: '2-digit' }),
      approvalDate: approvalDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: '2-digit' }),
      expiryDate: expiryDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: '2-digit' }),
      missingDocs: docs,
      travelDate: travelDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: '2-digit' }),
      processingDays,
    };
  });
};

const getFallbackSuccessRateData = () => {
  const dests = destinations.slice(0, 8);
  return dests.map((dest, idx) => {
    const seed = REF_DATE + idx;
    const rate = 65 + (seed % 35);
    return {
      name: dest,
      'Success Rate %': rate,
    };
  });
};

const getFallbackProcessingTimeData = () => {
  const dests = destinations.slice(0, 8);
  return dests.map((dest, idx) => {
    const seed = REF_DATE + idx;
    const days = 12 + (seed % 28);
    return {
      name: dest,
      'Avg Days': days,
    };
  });
};

const getFallbackMonthlyApplicationsData = () => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months.map((month, idx) => {
    const seed = REF_DATE + idx;
    const applications = 15 + (seed % 25);
    return {
      month,
      Applications: applications,
    };
  });
};

export default function VisaReportsPage() {
  const [dateRange, setDateRange] = React.useState('30days');

  // Fetch visa report data from API
  const { data: reportData, loading, error } = useApiQuery(
    async () => {
      try {
        const response = await reportsApi.getVisaReport?.({ dateRange }) ??
          Promise.resolve({
            visas: getFallbackVisaApplications(),
            successRate: getFallbackSuccessRateData(),
            processingTime: getFallbackProcessingTimeData(),
            monthlyApplications: getFallbackMonthlyApplicationsData(),
          });
        return response;
      } catch (err) {
        toast.error('Failed to load visa report. Showing sample data.');
        return {
          visas: getFallbackVisaApplications(),
          successRate: getFallbackSuccessRateData(),
          processingTime: getFallbackProcessingTimeData(),
          monthlyApplications: getFallbackMonthlyApplicationsData(),
        };
      }
    },
    [dateRange],
  );

    // @ts-expect-error
  const visas = reportData?.visas ?? getFallbackVisaApplications();

  const statusCounts = {
    Applied: visas.filter((v: any) => v.status === 'Applied').length,
    'In Progress': visas.filter((v: any) => v.status === 'In Progress').length,
    Approved: visas.filter((v: any) => v.status === 'Approved').length,
    Rejected: visas.filter((v: any) => v.status === 'Rejected').length,
    Expired: visas.filter((v: any) => v.status === 'Expired').length,
  };

  const pendingWithMissingDocs = visas.filter((v: any) => v.missingDocs && v.missingDocs.length > 0);

  const upcomingExpirations = visas
    .filter((v: any) => {
      const expiryDate = new Date(v.expiryDate || '2026-03-06');
      const sixtyDaysFromNow = new Date(REF_DATE + 60 * 24 * 60 * 60 * 1000);
      return expiryDate <= sixtyDaysFromNow && expiryDate >= new Date(REF_DATE);
    })
    .sort((a: any, b: any) => {
      const aDate = new Date(a.expiryDate || '2026-03-06');
      const bDate = new Date(b.expiryDate || '2026-03-06');
      return aDate.getTime() - bDate.getTime();
    });

    // @ts-expect-error
  const successRateData = reportData?.successRate ?? getFallbackSuccessRateData();
    // @ts-expect-error
  const processingTimeData = reportData?.processingTime ?? getFallbackProcessingTimeData();
    // @ts-expect-error
  const monthlyApplicationsData = reportData?.monthlyApplications ?? getFallbackMonthlyApplicationsData();

  const totalApplications = visas.length;
  const approvalRate = ((statusCounts.Approved / totalApplications) * 100).toFixed(1);

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
              Visa Reports
            </h1>
            <p className="text-sm text-muted-foreground">Visa applications tracking and analytics</p>
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
          {/* Status Summary Cards */}
          <div>
            <h2 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wide">Status Summary</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Applied
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{statusCounts.Applied}</div>
                  <p className="text-xs text-muted-foreground mt-1">Pending review</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    In Progress
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{statusCounts['In Progress']}</div>
                  <p className="text-xs text-muted-foreground mt-1">Under processing</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    Approved
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-green-600">{statusCounts.Approved}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {approvalRate}
                    % success rate
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-red-500" />
                    Rejected
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-red-600">{statusCounts.Rejected}</div>
                  <p className="text-xs text-muted-foreground mt-1">Requires reapplication</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-orange-500" />
                    Expired
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-orange-600">{statusCounts.Expired}</div>
                  <p className="text-xs text-muted-foreground mt-1">Renewal needed</p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Success Rate by Country */}
            <Card>
              <CardHeader>
                <CardTitle>Success Rate by Country</CardTitle>
                <CardDescription>Visa approval percentage</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={successRateData}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="name" width={75} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value) => `${value}%`} />
                    <Bar dataKey="Success Rate %" fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Processing Time */}
            <Card>
              <CardHeader>
                <CardTitle>Average Processing Time</CardTitle>
                <CardDescription>Days to approval by destination</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={processingTimeData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip formatter={(value) => `${value} days`} />
                    <Line type="monotone" dataKey="Avg Days" stroke="#3b82f6" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Monthly Applications */}
            <Card>
              <CardHeader>
                <CardTitle>Visa Applications Timeline</CardTitle>
                <CardDescription>Monthly application submissions</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={monthlyApplicationsData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Area type="monotone" dataKey="Applications" fill="#8b5cf6" stroke="#8b5cf6" fillOpacity={0.6} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Key Metrics Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Key Metrics</CardTitle>
                <CardDescription>Visa processing overview</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center pb-3 border-b">
                  <span className="text-sm text-muted-foreground">Total Applications</span>
                  <span className="font-semibold">{totalApplications}</span>
                </div>
                <div className="flex justify-between items-center pb-3 border-b">
                  <span className="text-sm text-muted-foreground">Approval Rate</span>
                  <span className="font-semibold text-green-600">{approvalRate}%</span>
                </div>
                <div className="flex justify-between items-center pb-3 border-b">
                  <span className="text-sm text-muted-foreground">Pending Docs</span>
                  <span className="font-semibold text-orange-600">{pendingWithMissingDocs.length}</span>
                </div>
                <div className="flex justify-between items-center pb-3 border-b">
                  <span className="text-sm text-muted-foreground">Expiring Soon</span>
                  <span className="font-semibold text-red-600">{upcomingExpirations.length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Avg Processing Days</span>
                  <span className="font-semibold">{Math.round(visas.reduce((sum: any, v: any) => sum + (v.processingDays || 0), 0) / visas.length)}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tables */}
          <div className="space-y-6">
            {/* Pending Documents Table */}
            {pendingWithMissingDocs.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Pending Documents
                  </CardTitle>
                  <CardDescription>
                    {pendingWithMissingDocs.length}
                    {' '}
                    applications missing documents
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Traveler Name</TableHead>
                          <TableHead>Destination</TableHead>
                          <TableHead>Missing Documents</TableHead>
                          <TableHead>Travel Date</TableHead>
                          <TableHead>Days Until Travel</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingWithMissingDocs.map((visa: any) => {
                          const travelDate = new Date(visa.travelDate);
                          const today = new Date(REF_DATE);
                          const daysUntilTravel = Math.ceil((travelDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                          return (
                            <TableRow key={visa.id}>
                              <TableCell className="font-medium">{visa.travelerName}</TableCell>
                              <TableCell>{visa.destination}</TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {visa.missingDocs?.map((doc: any) => (
                                    <Badge key={doc} variant="destructive" className="text-xs">
                                      {doc}
                                    </Badge>
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell>{visa.travelDate}</TableCell>
                              <TableCell className={cn('font-medium', daysUntilTravel < 14 && 'text-red-600')}>
                                {daysUntilTravel}
                                {' '}
                                days
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Upcoming Expirations Table */}
            {upcomingExpirations.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Upcoming Expirations
                  </CardTitle>
                  <CardDescription>Visas expiring in next 60 days</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Traveler Name</TableHead>
                          <TableHead>Destination</TableHead>
                          <TableHead>Expiry Date</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Days Remaining</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {upcomingExpirations.map((visa: any) => {
                          const expiryDate = new Date(visa.expiryDate || '2026-03-06');
                          const today = new Date(REF_DATE);
                          const daysRemaining = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                          return (
                            <TableRow key={visa.id}>
                              <TableCell className="font-medium">{visa.travelerName}</TableCell>
                              <TableCell>{visa.destination}</TableCell>
                              <TableCell>{visa.expiryDate}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">{visa.status}</Badge>
                              </TableCell>
                              <TableCell className={cn('font-medium', daysRemaining < 30 && 'text-orange-600')}>
                                {daysRemaining}
                                {' '}
                                days
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
