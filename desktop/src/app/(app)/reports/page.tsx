'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  TrendingUp, BarChart3, Users, Target, DollarSign,
  Zap, MapPin, Truck, AlertCircle, Clock, ArrowUpRight,
  TrendingDown, Activity, PieChart, FileText, Loader,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useApiQuery } from '@/hooks/use-api';
import { reportsApi } from '@/lib/api/reports';
import { leadsApi } from '@/lib/api/leads';
import { invoicesApi } from '@/lib/api/invoices';

interface ReportCard {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  href: string;
  reportCount: number;
  color: string;
}

const reportCards: ReportCard[] = [
  {
    id: 'sales',
    title: 'Sales Reports',
    description: 'Revenue trends, sales by destination, team performance, and forecasts',
    icon: TrendingUp,
    href: '/reports/sales',
    reportCount: 8,
    color: 'from-blue-500 to-cyan-500',
  },
  {
    id: 'leads',
    title: 'Lead Reports',
    description: 'Pipeline summary, lead ageing, source analysis, and velocity metrics',
    icon: Target,
    href: '/reports/leads',
    reportCount: 8,
    color: 'from-purple-500 to-pink-500',
  },
  {
    id: 'financial',
    title: 'Financial Reports',
    description: 'Revenue overview, collections, P&L analysis, and tax reporting',
    icon: DollarSign,
    href: '/reports/financial',
    reportCount: 9,
    color: 'from-green-500 to-emerald-500',
  },
  {
    id: 'team',
    title: 'Team Reports',
    description: 'Salesperson performance, targets, commissions, and team metrics',
    icon: Users,
    href: '/reports/team',
    reportCount: 6,
    color: 'from-orange-500 to-red-500',
  },
  {
    id: 'customer',
    title: 'Customer Reports',
    description: 'Customer segmentation, lifetime value, satisfaction, and retention',
    icon: Activity,
    href: '/reports/customer',
    reportCount: 7,
    color: 'from-indigo-500 to-blue-500',
  },
  {
    id: 'visa',
    title: 'Visa Reports',
    description: 'Visa applications, status tracking, and processing metrics',
    icon: FileText,
    href: '/reports/visa',
    reportCount: 5,
    color: 'from-amber-500 to-yellow-500',
  },
  {
    id: 'supplier',
    title: 'Supplier Reports',
    description: 'Supplier performance, payments, ratings, and contract management',
    icon: Truck,
    href: '/reports/supplier',
    reportCount: 6,
    color: 'from-teal-500 to-green-500',
  },
  {
    id: 'marketing',
    title: 'Marketing Reports',
    description: 'Campaign performance, ROI, lead sources, and customer acquisition',
    icon: PieChart,
    href: '/reports/marketing',
    reportCount: 7,
    color: 'from-rose-500 to-pink-500',
  },
];

// KPI card with icon and stats
function KPICard({ label, value, trend, icon: Icon }: { label: string; value: string; trend?: number; icon: React.ElementType }) {
  return (
    <Card className="flex-1 min-w-[200px]">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground mb-1">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
            {trend !== undefined && (
              <p className={cn('text-xs mt-1 font-medium', trend >= 0 ? 'text-green-600' : 'text-red-600')}>
                {trend >= 0 ? '+' : ''}{trend}% vs last period
              </p>
            )}
          </div>
          <div className="bg-primary/10 p-2 rounded-lg">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Report card component
function ReportCardComponent({ report }: { report: ReportCard }) {
  const Icon = report.icon;
  return (
    <Link href={report.href}>
      <Card className="h-full hover:shadow-lg transition-all duration-300 cursor-pointer group overflow-hidden">
        <CardContent className="p-0">
          <div className={cn(
            'h-24 bg-gradient-to-r flex items-center justify-center group-hover:scale-110 transition-transform duration-300',
            `bg-gradient-to-r ${report.color}`,
          )}>
            <Icon className="h-10 w-10 text-white/80" />
          </div>
          <div className="p-4">
            <h3 className="font-semibold text-sm mb-1 group-hover:text-primary transition-colors">{report.title}</h3>
            <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{report.description}</p>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">{report.reportCount} reports</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
            >
              View Reports
              <ArrowUpRight className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function formatKPIValue(amount: number): string {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(0)}K`;
  return `₹${amount}`;
}

export default function ReportsHub() {
  const { data: reports = [], loading, error } = useApiQuery<any[]>(
    () => reportsApi.list({ limit: 100 }).then((resp: any) => resp.data || []),
    [],
  );

  const { data: leadsResp } = useApiQuery(() => leadsApi.list({ limit: 500 }), []);
  const { data: invoicesResp } = useApiQuery(() => invoicesApi.list({ limit: 500 }), []);

  const leads = leadsResp?.data?.data ?? [];
  const invoices = invoicesResp?.data?.data ?? [];

  const totalRevenue = invoices.reduce((sum: number, inv: any) => sum + (inv.paidAmount ?? 0), 0);
  const activeLeads = leads.filter((l: any) => !['won', 'lost'].includes(l.status)).length;
  const wonLeads = leads.filter((l: any) => l.status === 'won').length;
  const conversionRate = leads.length > 0 ? ((wonLeads / leads.length) * 100).toFixed(1) : '0';
  const avgDealSize = wonLeads > 0 ? leads.filter((l: any) => l.status === 'won').reduce((s: number, l: any) => s + (l.budget ?? 0), 0) / wonLeads : 0;

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Reports Hub</h1>
          <p className="text-sm text-muted-foreground">Comprehensive business analytics and insights</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Clock className="h-4 w-4 mr-1.5" />
            Schedule
          </Button>
          <Button size="sm" className="bg-primary text-primary-foreground">
            <BarChart3 className="h-4 w-4 mr-1.5" />
            Export All
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-auto">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <Loader className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center h-full gap-4 text-muted-foreground">
            <AlertCircle className="h-6 w-6" />
            <p>Failed to load reports</p>
          </div>
        )}
        {!loading && !error && (
          <div className="space-y-8">
            {/* KPI Cards */}
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">Key Metrics</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                  label="Total Revenue"
                  value={formatKPIValue(totalRevenue)}
                  icon={DollarSign}
                />
                <KPICard
                  label="Active Leads"
                  value={String(activeLeads)}
                  icon={Target}
                />
                <KPICard
                  label="Conversion Rate"
                  value={`${conversionRate}%`}
                  icon={TrendingUp}
                />
                <KPICard
                  label="Avg Deal Size"
                  value={formatKPIValue(avgDealSize)}
                  icon={BarChart3}
                />
              </div>
            </div>

            {/* Report Cards Grid */}
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">Available Reports</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {reportCards.map((report: any) => (
                  <ReportCardComponent key={report.id} report={report} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
