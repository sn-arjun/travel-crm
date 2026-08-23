'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Users, Briefcase, DollarSign, TrendingUp, TrendingDown,
  Plus, Calendar, ArrowUpRight, Phone, Mail, Truck,
  AlertTriangle, CheckCircle2, Clock, Target, Plane, Loader2,
  FileText, MapPin, Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { LEAD_STATUS_LABELS, LEAD_STATUS_COLORS } from '@travelcrm/shared';
import { StickyNotesWidget } from '@/components/domain/dashboard/sticky-notes-widget';
import { useApiQuery } from '@/hooks/use-api';
import { tasksApi } from '@/lib/api/tasks';
import { notificationsApi } from '@/lib/api/notifications';
import { leadsApi } from '@/lib/api/leads';
import { followUpsApi } from '@/lib/api/follow-ups';
import { fleetApi } from '@/lib/api/fleet';
import { eventsApi } from '@/lib/api/events';
import { contactsApi } from '@/lib/api/contacts';
import { invoicesApi } from '@/lib/api/invoices';
import { reportsApi } from '@/lib/api/reports';

const REF_DATE = Date.now();

function formatCurrency(amount: number) {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(0)}K`;
  return `₹${amount}`;
}

function Sparkline({ data, color = 'hsl(14, 100%, 61%)' }: { data: number[]; color?: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 120;
  const h = 32;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
  return (
    <svg width={w} height={h} className="overflow-visible">
      <defs>
        <linearGradient id={`sg-${color.replace(/[^a-z0-9]/gi, '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${points} ${w},${h}`} fill={`url(#sg-${color.replace(/[^a-z0-9]/gi, '')})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ─── KPI Card ─── */
function KPICard({
  title, value, trend, icon: Icon, sparkData, color = 'hsl(14, 100%, 61%)',
}: {
  title: string; value: string; trend?: number; icon: React.ElementType; sparkData?: number[]; color?: string;
}) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          {trend !== undefined && (
            <div className={cn('flex items-center gap-0.5 text-xs font-medium', trend >= 0 ? 'text-green-600' : 'text-red-500')}>
              {trend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {Math.abs(trend)}%
            </div>
          )}
        </div>
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{title}</p>
        {sparkData && (
          <div className="mt-3">
            <Sparkline data={sparkData} color={color} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Pipeline Funnel ─── */
function PipelineFunnel() {
  const { data: dashboardResponse } = useApiQuery(() => reportsApi.getDashboard(), []);
  const { data: leadsResponse } = useApiQuery(() => leadsApi.list({ page: 1, limit: 1000 }), []);

  const dashData = dashboardResponse?.data;
  const pipelineFromApi = (dashData as any)?.pipeline;

  const leadsData = leadsResponse?.data;
  const allLeads = Array.isArray(leadsData) ? leadsData : (leadsData?.data ?? []);

  // Use dashboard API data if available, fallback to computing from leads list
  const statuses = ['new', 'contacted', 'qualified', 'proposal_sent', 'negotiation', 'won', 'lost', 'on_hold'];
  const stages = statuses.map((status: any) => {
    if (pipelineFromApi && Array.isArray(pipelineFromApi)) {
      const match = pipelineFromApi.find((p: any) => p.status === status);
      return {
        status,
        count: match?.count ?? 0,
        totalValue: match?.total_value ?? 0,
      };
    }
    const leads = allLeads.filter((l: any) => l.status === status);
    return {
      status,
      count: leads.length,
      totalValue: leads.reduce((sum: number, l: any) => sum + (l.budget || 0), 0),
    };
  });

  const maxCount = Math.max(...stages.map((s: any) => s.count), 1);
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Pipeline Overview</CardTitle>
          <Link href="/leads" className="text-xs text-primary hover:underline flex items-center gap-0.5">
            View all <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {stages.map((stage: any) => {
          const label = LEAD_STATUS_LABELS[stage.status as keyof typeof LEAD_STATUS_LABELS] || stage.status;
          const color = LEAD_STATUS_COLORS[stage.status as keyof typeof LEAD_STATUS_COLORS] || '#6B7280';
          const pct = maxCount > 0 ? (stage.count / maxCount) * 100 : 0;
          return (
            <div key={stage.status} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{label}</span>
                <span className="text-muted-foreground">{stage.count} leads · {formatCurrency(stage.totalValue)}</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

/* ─── Follow-ups Today ─── */
function FollowUpsToday() {
  const { data: dashboardResponse } = useApiQuery(() => reportsApi.getDashboard(), []);
  const { data: followUpsResponse } = useApiQuery(() => followUpsApi.list({ page: 1, limit: 100 }), []);
  const { data: leadsResponse } = useApiQuery(() => leadsApi.list({ page: 1, limit: 1000 }), []);

  const dashData = dashboardResponse?.data;
  const followUpStats = (dashData as any)?.followUps;

  const followUpsData = followUpsResponse?.data;
  const allFollowUps = Array.isArray(followUpsData) ? followUpsData : (followUpsData?.data ?? []);
  const leadsData = leadsResponse?.data;
  const allLeads = Array.isArray(leadsData) ? leadsData : (leadsData?.data ?? []);

  const todayFollowUps = allFollowUps.filter((f: any) => !f.completedAt).slice(0, 5);
  const pendingCount = followUpStats?.pending ?? todayFollowUps.length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Today's Follow-ups</CardTitle>
          <div className="flex items-center gap-1.5">
            {followUpStats?.overdue > 0 && (
              <Badge variant="destructive" className="text-[10px]">{followUpStats.overdue} overdue</Badge>
            )}
            <Badge variant="secondary" className="text-[10px]">{pendingCount} pending</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {todayFollowUps.map((fu: any) => {
          const lead = allLeads.find((l: any) => l.id === fu.leadId);
          return (
            <div key={fu.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
              <div className={cn(
                'h-8 w-8 rounded-full flex items-center justify-center shrink-0',
                fu.type === 'call' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' :
                fu.type === 'email' ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' :
                'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
              )}>
                {fu.type === 'call' ? <Phone className="h-3.5 w-3.5" /> :
                 fu.type === 'email' ? <Mail className="h-3.5 w-3.5" /> :
                 <Calendar className="h-3.5 w-3.5" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{lead?.contact?.name || 'Unknown'}</p>
                <p className="text-xs text-muted-foreground truncate">{lead?.title}</p>
              </div>
              <span className="text-[11px] text-muted-foreground shrink-0">
                {new Date(fu.scheduledAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          );
        })}
        {todayFollowUps.length === 0 && (
          <div className="text-center py-4">
            <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">All caught up!</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Recent Activity ─── */
function RecentActivity() {
  const { data: leadsResponse } = useApiQuery(() => leadsApi.list({ page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'desc' }), []);
  const leadsData = leadsResponse?.data;
  const recentLeads = Array.isArray(leadsData) ? leadsData : (leadsData?.data ?? []);

  function timeAgo(dateStr: string) {
    const diff = REF_DATE - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  function getAction(status: string) {
    const map: Record<string, string> = {
      won: 'won lead', lost: 'lost lead', new: 'created lead',
      contacted: 'contacted', qualified: 'qualified', proposal_sent: 'sent proposal for',
      negotiation: 'is negotiating', on_hold: 'put on hold',
    };
    return map[status] ?? 'updated lead';
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {recentLeads.slice(0, 6).map((lead: any) => (
          <div key={lead.id} className="flex items-start gap-3">
            <Avatar className="h-7 w-7 mt-0.5">
              <AvatarFallback className="text-[10px]">{(lead.contact?.name || 'U').split(' ').map((n: string) => n[0]).join('')}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm">
                <span className="font-medium">{lead.contact?.name || 'Unknown'}</span>
                {' '}{getAction(lead.status)}{' '}
                <span className="font-medium">{lead.title || lead.destination || ''}</span>
              </p>
              <p className="text-xs text-muted-foreground">{lead.createdAt ? timeAgo(lead.createdAt) : ''}</p>
            </div>
          </div>
        ))}
        {recentLeads.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">No recent activity</p>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Fleet Snapshot Widget ─── */
function FleetSnapshot() {
  const { data: vehiclesResponse } = useApiQuery(() => fleetApi.vehicles.list({ limit: 100 }), []);
  const { data: tripsResponse } = useApiQuery(() => fleetApi.trips.list({ limit: 100 }), []);

  const vehiclesData = vehiclesResponse?.data;
  const vehicles = Array.isArray(vehiclesData) ? vehiclesData : ((vehiclesData as any)?.data ?? []);
  const tripsData = tripsResponse?.data;
  const trips = Array.isArray(tripsData) ? tripsData : ((tripsData as any)?.data ?? []);

  const activeTrips = trips.filter((t: any) => t.status === 'in_progress' || t.status === 'scheduled').length;
  const freeVehicles = vehicles.filter((v: any) => v.status === 'active').length;
  const maintenanceVehicles = vehicles.filter((v: any) => v.status === 'maintenance').length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Fleet Status</CardTitle>
          <Link href="/fleet" className="text-xs text-primary hover:underline flex items-center gap-0.5">
            Manage <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
            <Truck className="h-5 w-5 text-blue-600 dark:text-blue-400 mx-auto mb-1" />
            <p className="text-lg font-bold">{activeTrips}</p>
            <p className="text-[11px] text-muted-foreground">Active Trips</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-900/20">
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 mx-auto mb-1" />
            <p className="text-lg font-bold">{freeVehicles}</p>
            <p className="text-[11px] text-muted-foreground">Vehicles</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mx-auto mb-1" />
            <p className="text-lg font-bold">{maintenanceVehicles}</p>
            <p className="text-[11px] text-muted-foreground">Maintenance</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Team Performance ─── */
function TeamPerformance() {
  const { data: leadsResponse } = useApiQuery(() => leadsApi.list({ page: 1, limit: 1000 }), []);
  const leadsData = leadsResponse?.data;
  const allLeads = Array.isArray(leadsData) ? leadsData : (leadsData?.data ?? []);

  const teamMap = new Map<string, { name: string; leads: number; won: number; revenue: number }>();
  allLeads.forEach((lead: any) => {
    const name = lead.assignedToName || lead.assignedTo || 'Unassigned';
    if (!teamMap.has(name)) teamMap.set(name, { name, leads: 0, won: 0, revenue: 0 });
    const member = teamMap.get(name)!;
    member.leads++;
    if (lead.status === 'won') {
      member.won++;
      member.revenue += lead.budget || 0;
    }
  });

  const team = Array.from(teamMap.values())
    .filter((m) => m.name !== 'Unassigned')
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const maxRevenue = Math.max(...team.map((t) => t.revenue), 1);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Team Performance</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {team.map((member) => (
          <div key={member.name} className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-[10px]">{member.name.split(' ').map((n: string) => n[0]).join('')}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">{member.name}</span>
                <span className="text-xs text-muted-foreground">{formatCurrency(member.revenue)}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(member.revenue / maxRevenue) * 100}%` }} />
                </div>
                <span className="text-[10px] text-muted-foreground w-16 text-right">{member.won}/{member.leads} won</span>
              </div>
            </div>
          </div>
        ))}
        {team.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">No team data yet</p>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Revenue Chart (SVG bar chart) ─── */
function RevenueChart() {
  const { data: invoicesResponse } = useApiQuery(() => invoicesApi.list({ page: 1, limit: 1000 }), []);
  const invoicesData = invoicesResponse?.data;
  const allInvoices = Array.isArray(invoicesData) ? invoicesData : ((invoicesData as any)?.data ?? []);

  // Group invoices by month for last 6 months
  const chartData = React.useMemo(() => {
    const now = new Date(REF_DATE);
    const months: { label: string; value: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleDateString('en-US', { month: 'short' });
      const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const total = allInvoices
        .filter((inv: any) => (inv.issueDate || inv.createdAt || '').startsWith(monthStr))
        .reduce((sum: number, inv: any) => sum + (inv.totalAmount || inv.total || 0), 0);
      months.push({ label, value: total });
    }
    return months;
  }, [allInvoices]);

  const values = chartData.map((m) => m.value);
  const max = Math.max(...values, 1);
  const chartHeight = 140;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Revenue Trend (6 Months)</CardTitle>
          <Badge variant="secondary" className="text-[10px]">{formatCurrency(values[values.length - 1] ?? 0)} this month</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between gap-2 h-40 pt-4">
          {chartData.map((month, i) => {
            const h = max > 0 ? (month.value / max) * chartHeight : 0;
            const isCurrent = i === chartData.length - 1;
            return (
              <div key={month.label} className="flex flex-col items-center gap-1 flex-1">
                <span className="text-[10px] font-medium text-muted-foreground">{formatCurrency(month.value)}</span>
                <div
                  className={cn('w-full max-w-10 rounded-t-md transition-all', isCurrent ? 'bg-primary' : 'bg-primary/20')}
                  style={{ height: `${Math.max(h, 2)}px` }}
                />
                <span className={cn('text-[11px]', isCurrent ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{month.label}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Popular Destinations ─── */
function PopularDestinations() {
  const { data: leadsResponse } = useApiQuery(() => leadsApi.list({ page: 1, limit: 1000 }), []);
  const leadsData = leadsResponse?.data;
  const allLeads = Array.isArray(leadsData) ? leadsData : (leadsData?.data ?? []);

  const destMap = new Map<string, { leads: number; revenue: number }>();
  allLeads.forEach((lead: any) => {
    const dest = lead.destination?.trim();
    if (!dest) return;
    if (!destMap.has(dest)) destMap.set(dest, { leads: 0, revenue: 0 });
    const entry = destMap.get(dest)!;
    entry.leads++;
    entry.revenue += lead.budget || 0;
  });

  const destinations = Array.from(destMap.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.leads - a.leads)
    .slice(0, 6);

  const maxLeads = Math.max(...destinations.map((d) => d.leads), 1);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Popular Destinations</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {destinations.map((dest) => (
          <div key={dest.name} className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <MapPin className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">{dest.name}</span>
                <span className="text-xs text-muted-foreground">{dest.leads} leads · {formatCurrency(dest.revenue)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-primary/60 transition-all" style={{ width: `${(dest.leads / maxLeads) * 100}%` }} />
              </div>
            </div>
          </div>
        ))}
        {destinations.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">No destination data yet</p>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Upcoming Travel Dates ─── */
function UpcomingTravel() {
  const { data: leadsResponse } = useApiQuery(() => leadsApi.list({ page: 1, limit: 1000 }), []);

  const leadsData = leadsResponse?.data;
  const allLeads = Array.isArray(leadsData) ? leadsData : (leadsData?.data ?? []);

  const upcoming = allLeads
    .filter((l: any) => l.travelDate && l.status !== 'lost' && l.status !== 'won')
    .sort((a: any, b: any) => (a.travelDate || '').localeCompare(b.travelDate || ''))
    .slice(0, 5);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Upcoming Travel Dates</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {upcoming.map((lead: any) => (
          <div key={lead.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
            <div className="h-8 w-8 rounded-lg bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center shrink-0">
              <Plane className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{lead.contact?.name} — {lead.destination}</p>
              <p className="text-xs text-muted-foreground">{lead.paxAdults + lead.paxChildren} pax · {formatCurrency(lead.budget || 0)}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-medium">{lead.travelDate}</p>
              <Badge variant="outline" className="text-[9px]">{LEAD_STATUS_LABELS[lead.status as keyof typeof LEAD_STATUS_LABELS]}</Badge>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ─── Date Range Selector ─── */
function DateRangeSelector({
  value, onValueChange, customDate, onCustomDateChange,
}: {
  value: string; onValueChange: (value: string) => void;
  customDate?: Date; onCustomDateChange: (date: Date | undefined) => void;
}) {
  return (
    <div className="flex items-center gap-ds-2">
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="week">This Week</SelectItem>
          <SelectItem value="month">This Month</SelectItem>
          <SelectItem value="quarter">This Quarter</SelectItem>
          <SelectItem value="custom">Custom Range</SelectItem>
        </SelectContent>
      </Select>
      {value === 'custom' && (
        <DatePicker value={customDate} onChange={onCustomDateChange} placeholder="Pick a date" className="w-44" />
      )}
    </div>
  );
}

/* ─── Goal Progress Widget ─── */
function GoalProgressWidget() {
  const { data: leadsResponse } = useApiQuery(() => leadsApi.list({ page: 1, limit: 1000 }), []);
  const leadsData = leadsResponse?.data;
  const allLeads = Array.isArray(leadsData) ? leadsData : (leadsData?.data ?? []);

  const wonRevenue = allLeads
    .filter((l: any) => l.status === 'won')
    .reduce((sum: number, l: any) => sum + (l.budget || 0), 0);

  // Target is 120% of current won revenue or minimum 100K
  const target = Math.max(Math.ceil(wonRevenue * 1.2 / 100000) * 100000, 100000);
  const percentage = target > 0 ? Math.min((wonRevenue / target) * 100, 100) : 0;

  const now = new Date(REF_DATE);
  const monthName = now.toLocaleDateString('en-US', { month: 'long' });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Revenue Target</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{monthName} Target</span>
            <span className="font-semibold">{percentage.toFixed(0)}%</span>
          </div>
          <Progress value={percentage} className="h-2" />
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-muted-foreground">Actual</p>
            <p className="font-semibold">{formatCurrency(wonRevenue)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Target</p>
            <p className="font-semibold">{formatCurrency(target)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Upcoming Events Widget ─── */
function UpcomingEventsWidget() {
  const now = new Date(REF_DATE);
  const weekLater = new Date(REF_DATE + 7 * 24 * 60 * 60 * 1000);
  const { data: eventsResponse } = useApiQuery(
    () => eventsApi.list({ start_date: now.toISOString(), end_date: weekLater.toISOString() }),
    [],
  );

  const eventsData = eventsResponse?.data;
  const events = Array.isArray(eventsData) ? eventsData : ((eventsData as any)?.data ?? []);
  const upcomingEvents = events.slice(0, 5);

  const typeColors: Record<string, string> = {
    meeting: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    call: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
    task: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
    other: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Upcoming Events</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {upcomingEvents.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">No upcoming events</p>
        )}
        {upcomingEvents.map((event: any) => (
          <div key={event.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
            <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0', typeColors[event.type] || typeColors.other)}>
              <Calendar className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{event.title}</p>
              <p className="text-[10px] text-muted-foreground">
                {event.start_at || event.startTime
                  ? new Date(event.start_at || event.startTime).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                  : ''}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ─── Quick Actions ─── */
function QuickActions() {
  const actions = [
    { label: 'New Lead', icon: Plus, href: '/leads/new' },
    { label: 'New Contact', icon: Users, href: '/contacts/new' },
    { label: 'New Invoice', icon: FileText, href: '/invoices/new' },
    { label: 'New Itinerary', icon: MapPin, href: '/itineraries/new' },
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {actions.map((action: any) => {
        const ActionIcon = action.icon;
        return (
          <Link key={action.label} href={action.href}>
            <Button variant="outline" className="w-full" size="sm">
              <ActionIcon className="h-3.5 w-3.5 mr-1.5" />
              {action.label}
            </Button>
          </Link>
        );
      })}
    </div>
  );
}

/* ─── Main Dashboard ─── */
export default function DashboardPage() {
  const [dateRange, setDateRange] = React.useState('month');
  const [customDate, setCustomDate] = React.useState<Date | undefined>();

  const { data: taskSummary, loading: tasksLoading } = useApiQuery(
    () => tasksApi.getDashboardSummary(),
    [],
  );

  const { data: unreadCount, loading: notificationsLoading } = useApiQuery(
    () => notificationsApi.getUnreadCount(),
    [],
  );

  const { data: dashboardResponse } = useApiQuery(
    () => reportsApi.getDashboard(),
    [],
  );

  const { data: financialSummaryResponse } = useApiQuery(
    () => invoicesApi.summary(),
    [],
  );

  const { data: leadsResponse, loading: leadsLoading } = useApiQuery(
    () => leadsApi.list({ page: 1, limit: 1000 }),
    [],
  );

  const kpisLoading = leadsLoading && tasksLoading;

  const leadsData = leadsResponse?.data;
  const allLeads = Array.isArray(leadsData) ? leadsData : (leadsData?.data ?? []);
  const dashData = dashboardResponse?.data;
  const pipelineData = (dashData as any)?.pipeline;
  const followUpStats = (dashData as any)?.followUps;
  const financialData = (financialSummaryResponse as any)?.data ?? financialSummaryResponse ?? {};

  const kpis = React.useMemo(() => {
    let totalTasks = 0;
    if (taskSummary) {
      const data = 'data' in taskSummary ? (taskSummary as any).data : taskSummary;
      totalTasks = (data as any)?.totalTasks ?? 0;
    }

    // Use dashboard API pipeline data if available
    let newLeads = 0;
    let wonLeads = 0;
    let revenueThisMonth = 0;

    if (pipelineData && Array.isArray(pipelineData)) {
      const newEntry = pipelineData.find((p: any) => p.status === 'new');
      const wonEntry = pipelineData.find((p: any) => p.status === 'won');
      newLeads = newEntry?.count ?? 0;
      wonLeads = wonEntry?.count ?? 0;
      revenueThisMonth = wonEntry?.total_value ?? 0;
    } else {
      newLeads = allLeads.filter((l: any) => l.status === 'new').length;
      wonLeads = allLeads.filter((l: any) => l.status === 'won').length;
      revenueThisMonth = allLeads
        .filter((l: any) => l.status === 'won')
        .reduce((sum: number, l: any) => sum + (l.budget || 0), 0);
    }

    const followUpCount = followUpStats?.pending ?? totalTasks;

    return {
      newLeads: {
        count: newLeads,
        trend: 12,
      },
      followUpsToday: {
        count: followUpCount,
        trend: 5,
      },
      revenueThisMonth: {
        amount: revenueThisMonth,
        trend: 8,
      },
      bookingsThisMonth: {
        count: wonLeads,
        trend: 5,
      },
      collectionRate: {
        percentage: 87,
      },
    };
  }, [taskSummary, allLeads, pipelineData, followUpStats]);

  return (
    <div className="flex h-full flex-col overflow-auto">
      <PageHeader
        title="Dashboard"
        description="Welcome back, Arjun. Here's your overview."
        className="px-ds-6 pt-ds-4"
        actions={
          <>
            <DateRangeSelector
              value={dateRange}
              onValueChange={setDateRange}
              customDate={customDate}
              onCustomDateChange={setCustomDate}
            />
            <Button>
              <Plus className="mr-1.5 size-4" aria-hidden="true" /> Quick Add
            </Button>
          </>
        }
      />

      {/* Content */}
      <div className="flex-1 space-y-ds-6 overflow-y-auto p-ds-6">
        {/* KPI Row */}
        <div className="grid grid-cols-2 gap-ds-4 lg:grid-cols-5">
          {kpisLoading ? (
            Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-32 rounded-ds-lg" />
            ))
          ) : (
            <>
              <Link href="/leads" className="block">
                <KPICard
                  title="New Leads"
                  value={String(kpis.newLeads.count)}
                  trend={kpis.newLeads.trend}
                  icon={Briefcase}
                  sparkData={[8, 12, 10, 15, 18, 14, 20, 24]}
                />
              </Link>
              <Link href="/tasks" className="block">
                <KPICard
                  title="Follow-ups Today"
                  value={String(kpis.followUpsToday.count)}
                  icon={Clock}
                  sparkData={[5, 3, 7, 4, 8, 6, 5, 8]}
                  color="hsl(38, 92%, 50%)"
                />
              </Link>
              <Link href="/invoices" className="block">
                <KPICard
                  title="Revenue (Month)"
                  value={formatCurrency(kpis.revenueThisMonth.amount)}
                  trend={kpis.revenueThisMonth.trend}
                  icon={DollarSign}
                  sparkData={[120, 180, 150, 220, 280, 210, 300, 245]}
                  color="hsl(142, 72%, 29%)"
                />
              </Link>
              <Link href="/leads" className="block">
                <KPICard
                  title="Bookings"
                  value={String(kpis.bookingsThisMonth.count)}
                  trend={kpis.bookingsThisMonth.trend}
                  icon={Plane}
                  sparkData={[3, 5, 4, 2, 6, 7, 4, 5]}
                  color="hsl(262, 83%, 58%)"
                />
              </Link>
              <KPICard
                title="Collection Rate"
                value={`${kpis.collectionRate.percentage}%`}
                icon={Target}
                sparkData={[65, 70, 68, 72, 75, 78, 74, 78]}
                color="hsl(217, 91%, 60%)"
              />
            </>
          )}
        </div>

        {/* Financial Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Revenue This Month</p>
              <p className="text-lg font-bold">{formatCurrency(financialData?.invoicedThisMonth ?? 0)}</p>
            </CardContent>
          </Card>
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Collections This Month</p>
              <p className="text-lg font-bold text-green-600">{formatCurrency(financialData?.paidThisMonth ?? 0)}</p>
            </CardContent>
          </Card>
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Outstanding</p>
              <p className="text-lg font-bold text-amber-600">{formatCurrency(financialData?.outstanding ?? 0)}</p>
            </CardContent>
          </Card>
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Overdue</p>
              <p className="text-lg font-bold text-red-600">{formatCurrency(financialData?.overdue ?? 0)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column - 2/3 width */}
          <div className="lg:col-span-2 space-y-6">
            <RevenueChart />
            <PipelineFunnel />
            <UpcomingTravel />
            <RecentActivity />
          </div>

          {/* Right column - 1/3 width */}
          <div className="space-y-6">
            <QuickActions />
            <GoalProgressWidget />
            <UpcomingEventsWidget />
            <StickyNotesWidget />
            <FollowUpsToday />
            <FleetSnapshot />
            <PopularDestinations />
            <TeamPerformance />
          </div>
        </div>
      </div>
    </div>
  );
}
