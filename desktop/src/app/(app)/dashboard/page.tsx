'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Briefcase, Clock, DollarSign, FileText, MapPin, Plane, Plus, Target, Users, ListChecks,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { PageContainer } from '@/components/layout/page-container';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { StickyNotesWidget } from '@/components/domain/dashboard/sticky-notes-widget';
import { KpiCard, type KpiTrend } from '@/components/domain/dashboard/kpi-card';
import { useApiQuery } from '@/hooks/use-api';
import { followUpsApi } from '@/lib/api/follow-ups';
import { unwrapList } from '@/lib/api/envelope';
import { useAuthStore } from '@/stores/auth-store';
import { AttentionWidget } from '@/components/domain/assistant/attention-widget';
import {
  PERIOD_OPTIONS, formatCurrency, loadDashboardSummary, loadPeriodMetrics, loadRevenueTrend,
  percentChange, type DashboardPeriod, type FollowUpRow,
} from './dashboard-data';
import {
  FleetSnapshot, FollowUpsToday, PipelineFunnel, PopularDestinations, RecentActivity,
  RevenueChart, TeamPerformance, UpcomingEventsWidget, UpcomingTravel,
} from './widgets';

const QUICK_ADD = [
  { label: 'New lead', href: '/leads/new', icon: Briefcase },
  { label: 'New contact', href: '/contacts/new', icon: Users },
  { label: 'New task', href: '/tasks?new=1', icon: ListChecks },
  { label: 'New invoice', href: '/invoices/new', icon: FileText },
  { label: 'New itinerary', href: '/itineraries/new', icon: MapPin },
] as const;

function QuickAddMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>
          <Plus className="me-ds-2 size-4" aria-hidden="true" /> Quick Add
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {QUICK_ADD.map(({ label, href, icon: Icon }) => (
          <DropdownMenuItem key={href} asChild>
            <Link href={href}>
              <Icon className="size-4" aria-hidden="true" /> {label}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FinanceStat({ label, value, tone }: { label: string; value: string | null; tone?: string }) {
  return (
    <Card className="gap-0 py-0 transition-shadow hover:shadow-md">
      <CardContent className="p-ds-4">
        <p className="text-xs text-ds-foreground-muted">{label}</p>
        <p className={`text-lg font-bold ${tone ?? 'text-ds-foreground'}`}>{value ?? '—'}</p>
      </CardContent>
    </Card>
  );
}

function trendOf(current: number | undefined, previous: number | undefined): KpiTrend | null {
  if (current === undefined || previous === undefined) return null;
  const change = percentChange(current, previous);
  return change === null ? null : { value: change, unit: '%' };
}

function finite(n: number | null | undefined): number | undefined {
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

export default function DashboardPage() {
  const [period, setPeriod] = React.useState<DashboardPeriod>('month');
  const firstName = useAuthStore((s) => s.user?.name?.trim().split(' ')[0]) ?? 'there';
  const companyName = useAuthStore((s) => s.tenant?.name?.trim());
  const periodMeta = PERIOD_OPTIONS.find((p) => p.value === period) ?? { value: 'month', label: 'This Month', short: 'Month' };

  const { data: metrics, loading: metricsLoading } = useApiQuery(() => loadPeriodMetrics(period), [period]);
  const { data: summary, loading: summaryLoading } = useApiQuery(() => loadDashboardSummary(), []);
  const { data: trend, loading: trendLoading } = useApiQuery(() => loadRevenueTrend(), []);
  const { data: followUpRes, loading: followUpsLoading } = useApiQuery(
    () => followUpsApi.list({ page: 1, limit: 100, status: 'pending', sortBy: 'scheduledAt', sortOrder: 'asc' }),
    [],
  );

  const followUps = unwrapList<FollowUpRow>(followUpRes).data;
  const dueToday = React.useMemo(() => {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    return followUps.filter((f) => !f.completedAt && new Date(f.scheduledAt) <= endOfToday);
  }, [followUps]);

  const cur = metrics?.current ?? null;
  const prev = metrics?.previous ?? null;
  const kpisLoading = metricsLoading || followUpsLoading;

  const rateNow = cur?.collectionRate ?? undefined;
  const ratePrev = prev?.collectionRate ?? undefined;
  const rateTrend: KpiTrend | null =
    rateNow !== undefined && ratePrev !== undefined ? { value: Math.round(rateNow - ratePrev), unit: 'pts' } : null;

  return (
    <PageContainer>
      <PageHeader
        title="Dashboard"
        description={`Welcome back, ${firstName}. Here's the overview${companyName ? ` for ${companyName}` : ''}.`}
        className="px-0"
        actions={
          <>
            <Select value={period} onValueChange={(v) => setPeriod(v as DashboardPeriod)}>
              <SelectTrigger className="w-40" aria-label="Date range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <QuickAddMenu />
          </>
        }
      />

      <div className="space-y-ds-6">
        {/* KPI row: figures follow the date range; trends compare with the previous period */}
        <div className="grid grid-cols-2 gap-ds-4 lg:grid-cols-5">
          {kpisLoading ? (
            Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-32 rounded-ds-lg" />)
          ) : (
            <>
              <KpiCard
                title="New Leads"
                href="/leads"
                icon={Briefcase}
                value={finite(cur?.newLeads) !== undefined ? String(cur?.newLeads) : null}
                trend={trendOf(finite(cur?.newLeads), finite(prev?.newLeads))}
              />
              <KpiCard
                title="Follow-ups Today"
                href="/follow-ups"
                icon={Clock}
                value={String(dueToday.length)}
                hint={summary && summary.followUps.overdue > 0 ? `${summary.followUps.overdue} overdue` : undefined}
              />
              <KpiCard
                title={`Revenue (${periodMeta.short})`}
                href="/invoices"
                icon={DollarSign}
                value={finite(cur?.invoiced) !== undefined ? formatCurrency(cur?.invoiced ?? 0) : null}
                trend={trendOf(finite(cur?.invoiced), finite(prev?.invoiced))}
                hint="Invoiced"
              />
              <KpiCard
                title="Bookings"
                href="/leads"
                icon={Plane}
                value={finite(cur?.bookings) !== undefined ? String(cur?.bookings) : null}
                trend={trendOf(finite(cur?.bookings), finite(prev?.bookings))}
                hint="Leads won"
              />
              <KpiCard
                title="Collection Rate"
                href="/payments"
                icon={Target}
                value={rateNow !== undefined ? `${Math.round(rateNow)}%` : null}
                trend={rateTrend}
                hint="Paid share of invoiced"
              />
            </>
          )}
        </div>

        {/* Money position */}
        <div className="grid grid-cols-1 gap-ds-4 sm:grid-cols-3">
          <FinanceStat
            label={`Collected (${periodMeta.short})`}
            value={finite(cur?.collected) !== undefined ? formatCurrency(cur?.collected ?? 0) : null}
            tone="text-ds-success"
          />
          <FinanceStat
            label="Outstanding (today)"
            value={summary ? formatCurrency(summary.financial.outstanding) : null}
            tone="text-ds-warning"
          />
          <FinanceStat
            label="Overdue (today)"
            value={summary ? formatCurrency(summary.financial.overdue) : null}
            tone="text-ds-danger"
          />
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 gap-ds-6 lg:grid-cols-3">
          <div className="space-y-ds-6 lg:col-span-2">
            <RevenueChart points={trend} loading={trendLoading} />
            <PipelineFunnel summary={summary} loading={summaryLoading} />
            <UpcomingTravel />
            <RecentActivity />
          </div>
          <div className="space-y-ds-6">
            <AttentionWidget />
            <UpcomingEventsWidget />
            <StickyNotesWidget />
            <FollowUpsToday followUps={dueToday} summary={summary} loading={followUpsLoading || summaryLoading} />
            <FleetSnapshot />
            <PopularDestinations />
            <TeamPerformance />
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
