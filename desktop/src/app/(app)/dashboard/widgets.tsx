'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowUpRight, Calendar, CheckCircle2, Mail, MapPin, Phone, Plane, Truck, AlertTriangle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { LEAD_STATUS_LABELS, LEAD_STATUS_COLORS } from '@travelcrm/shared';
import { cn } from '@/lib/utils';
import { useApiQuery } from '@/hooks/use-api';
import { leadsApi } from '@/lib/api/leads';
import { eventsApi, type CalendarEvent } from '@/lib/api/events';
import { fleetApi } from '@/lib/api/fleet';
import { reportsApi } from '@/lib/api/reports';
import { unwrapList, unwrapReport } from '@/lib/api/envelope';
import { formatDisplayDate, toLocalDateString } from '@/lib/dates';
import {
  formatCurrency, parseDestination,
  type DashboardSummary, type DestinationRow, type FollowUpRow, type LeadRow,
  type TeamRow, type TrendPoint,
} from './dashboard-data';

const WIDGET_TITLE = 'text-sm font-semibold text-ds-foreground';
const EMPTY_TEXT = 'py-ds-4 text-center text-xs text-ds-foreground-muted';

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]?.toUpperCase() ?? '').join('') || '?';
}

function WidgetSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-ds-3" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );
}

function WidgetCard({
  title, action, children,
}: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-ds-1">
        <div className="flex items-center justify-between gap-ds-2">
          <CardTitle className={WIDGET_TITLE}>{title}</CardTitle>
          {action}
        </div>
      </CardHeader>
      <CardContent className="space-y-ds-3">{children}</CardContent>
    </Card>
  );
}

function CardLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-ds-1 rounded-ds-sm text-xs text-ds-primary hover:underline focus-visible:ring-2 focus-visible:ring-ds-ring focus-visible:outline-none"
    >
      {children} <ArrowUpRight className="size-3" aria-hidden="true" />
    </Link>
  );
}

/* ─── Revenue trend ─── */
export function RevenueChart({ points, loading }: { points: TrendPoint[] | null; loading: boolean }) {
  const values = (points ?? []).map((p) => p.value);
  const max = Math.max(...values, 0);
  const hasData = max > 0;
  const current = points?.[points.length - 1]?.value ?? 0;
  return (
    <Card data-testid="revenue-trend">
      <CardHeader className="pb-ds-1">
        <div className="flex items-center justify-between">
          <CardTitle className={WIDGET_TITLE}>Revenue Trend (6 Months)</CardTitle>
          {hasData ? (
            <Badge variant="secondary" className="text-xs">{formatCurrency(current)} this month</Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : !hasData ? (
          <p className={EMPTY_TEXT}>No invoiced revenue in the last six months.</p>
        ) : (
          <div className="flex h-44 items-end justify-between gap-ds-2 pt-ds-4">
            {(points ?? []).map((month, i, all) => {
              const isCurrent = i === all.length - 1;
              const pct = (month.value / max) * 100;
              return (
                <div key={month.key} className="flex h-full flex-1 flex-col items-center justify-end gap-ds-1">
                  <div className="flex w-full flex-1 flex-col items-center justify-end gap-ds-1">
                    <span className="text-xs font-medium text-ds-foreground-muted">{formatCurrency(month.value)}</span>
                    <div
                      className={cn('w-full max-w-10 rounded-t-ds-md transition-all', isCurrent ? 'bg-ds-chart-1' : 'bg-ds-chart-1/30')}
                      style={{ height: `${(Math.max(pct, 2) / 100) * 7}rem` }}
                    />
                  </div>
                  <span className={cn('text-xs', isCurrent ? 'font-semibold text-ds-foreground' : 'text-ds-foreground-muted')}>
                    {month.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Pipeline overview ─── */
export function PipelineFunnel({ summary, loading }: { summary: DashboardSummary | null; loading: boolean }) {
  const statuses = ['new', 'contacted', 'qualified', 'proposal_sent', 'negotiation', 'won', 'lost', 'on_hold'] as const;
  const stages = statuses.map((status) => {
    const match = summary?.pipeline.find((p) => p.status === status);
    return { status, count: match?.count ?? 0, totalValue: match?.total_value ?? 0 };
  });
  const maxCount = Math.max(...stages.map((s) => s.count), 1);
  const total = stages.reduce((acc, s) => acc + s.count, 0);
  return (
    <WidgetCard title="Pipeline Overview" action={<CardLink href="/leads">View all</CardLink>}>
      {loading ? (
        <WidgetSkeleton rows={5} />
      ) : total === 0 ? (
        <p className={EMPTY_TEXT}>No leads in the pipeline yet.</p>
      ) : (
        stages.map((stage) => {
          const label = LEAD_STATUS_LABELS[stage.status as keyof typeof LEAD_STATUS_LABELS] ?? stage.status;
          const color = LEAD_STATUS_COLORS[stage.status as keyof typeof LEAD_STATUS_COLORS];
          return (
            <div key={stage.status} className="space-y-ds-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-ds-foreground">{label}</span>
                <span className="text-ds-foreground-muted">{stage.count} leads · {formatCurrency(stage.totalValue)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-ds-surface-sunken">
                <div
                  className="h-full rounded-full bg-ds-chart-1 transition-all duration-500"
                  style={{ width: `${(stage.count / maxCount) * 100}%`, ...(color ? { backgroundColor: color } : {}) }}
                />
              </div>
            </div>
          );
        })
      )}
    </WidgetCard>
  );
}

/* ─── Follow-ups ─── */
export function FollowUpsToday({
  followUps, summary, loading,
}: { followUps: FollowUpRow[]; summary: DashboardSummary | null; loading: boolean }) {
  const next = followUps.slice(0, 5);
  const overdue = summary?.followUps.overdue ?? 0;
  const pending = summary?.followUps.pending ?? followUps.length;
  return (
    <WidgetCard
      title="Today's Follow-ups"
      action={
        <div className="flex items-center gap-ds-2">
          {overdue > 0 ? <Badge variant="destructive" className="text-xs">{overdue} overdue</Badge> : null}
          <Badge variant="secondary" className="text-xs">{pending} pending</Badge>
        </div>
      }
    >
      {loading ? (
        <WidgetSkeleton />
      ) : next.length === 0 ? (
        <div className="py-ds-4 text-center">
          <CheckCircle2 className="mx-auto mb-ds-2 size-8 text-ds-success" aria-hidden="true" />
          <p className="text-sm text-ds-foreground-muted">All caught up!</p>
        </div>
      ) : (
        next.map((fu) => {
          const Icon = fu.type === 'call' ? Phone : fu.type === 'email' ? Mail : Calendar;
          const tone =
            fu.type === 'call'
              ? 'bg-ds-info-subtle text-ds-info-on-subtle'
              : fu.type === 'email'
                ? 'bg-ds-success-subtle text-ds-success-on-subtle'
                : 'bg-ds-warning-subtle text-ds-warning-on-subtle';
          const when = new Date(fu.scheduledAt);
          return (
            <Link
              key={fu.id}
              href={`/leads/${fu.leadId}`}
              className="flex items-center gap-ds-3 rounded-ds-lg p-ds-2 transition-colors hover:bg-ds-surface-sunken focus-visible:ring-2 focus-visible:ring-ds-ring focus-visible:outline-none"
            >
              <div className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', tone)}>
                <Icon className="size-3.5" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ds-foreground">{fu.contactName || 'Unknown contact'}</p>
                <p className="truncate text-xs text-ds-foreground-muted">{fu.leadTitle}</p>
              </div>
              <span className="shrink-0 text-xs text-ds-foreground-muted">
                {formatDisplayDate(when, 'short')}, {when.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </Link>
          );
        })
      )}
    </WidgetCard>
  );
}

/* ─── Recent activity ─── */
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.max(Math.floor(diff / 60000), 0);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const STATUS_ACTION: Record<string, string> = {
  won: 'won lead', lost: 'lost lead', new: 'created lead',
  contacted: 'contacted', qualified: 'qualified', proposal_sent: 'sent proposal for',
  negotiation: 'is negotiating', on_hold: 'put on hold',
};

export function RecentActivity() {
  const { data, loading } = useApiQuery(
    () => leadsApi.list({ page: 1, limit: 6, sortBy: 'createdAt', sortOrder: 'desc' }),
    [],
  );
  const leads = unwrapList<LeadRow>(data).data.slice(0, 6);
  return (
    <WidgetCard title="Recent Activity">
      {loading ? (
        <WidgetSkeleton rows={4} />
      ) : leads.length === 0 ? (
        <p className={EMPTY_TEXT}>No recent activity</p>
      ) : (
        leads.map((lead) => (
          <div key={lead.id} className="flex items-start gap-ds-3">
            <Avatar className="mt-0.5 size-7">
              <AvatarFallback className="text-xs">{initials(lead.contactName ?? 'Unknown')}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ds-foreground">
                <span className="font-medium">{lead.contactName ?? 'Unknown'}</span>{' '}
                {STATUS_ACTION[lead.status] ?? 'updated lead'}{' '}
                <span className="font-medium">{lead.title ?? ''}</span>
              </p>
              <p className="text-xs text-ds-foreground-muted">{lead.createdAt ? timeAgo(lead.createdAt) : ''}</p>
            </div>
          </div>
        ))
      )}
    </WidgetCard>
  );
}

/* ─── Fleet ─── */
interface FleetCounts { activeTrips: number; vehicles: number; maintenance: number }

export function FleetSnapshot() {
  const { data, loading } = useApiQuery<FleetCounts>(async () => {
    const [vehicles, trips] = await Promise.all([
      fleetApi.vehicles.list({ page: 1, limit: 100 }),
      fleetApi.trips.list({ page: 1, limit: 100 }),
    ]);
    const v = unwrapList<{ status?: string }>(vehicles).data;
    const t = unwrapList<{ status?: string }>(trips).data;
    return {
      activeTrips: t.filter((x) => x.status === 'in_progress' || x.status === 'scheduled').length,
      vehicles: v.filter((x) => x.status === 'active').length,
      maintenance: v.filter((x) => x.status === 'maintenance').length,
    };
  }, []);
  const tiles = [
    { label: 'Active Trips', value: data?.activeTrips ?? 0, icon: Truck, tone: 'bg-ds-info-subtle text-ds-info-on-subtle' },
    { label: 'Vehicles Ready', value: data?.vehicles ?? 0, icon: CheckCircle2, tone: 'bg-ds-success-subtle text-ds-success-on-subtle' },
    { label: 'In Maintenance', value: data?.maintenance ?? 0, icon: AlertTriangle, tone: 'bg-ds-warning-subtle text-ds-warning-on-subtle' },
  ];
  return (
    <WidgetCard title="Fleet Status" action={<CardLink href="/fleet">Manage</CardLink>}>
      {loading ? (
        <Skeleton className="h-20 w-full" />
      ) : (
        <div className="grid grid-cols-3 gap-ds-3">
          {tiles.map(({ label, value, icon: Icon, tone }) => (
            <div key={label} className={cn('rounded-ds-lg p-ds-3 text-center', tone)}>
              <Icon className="mx-auto mb-ds-1 size-5" aria-hidden="true" />
              <p className="text-lg font-bold">{value}</p>
              <p className="text-xs">{label}</p>
            </div>
          ))}
        </div>
      )}
    </WidgetCard>
  );
}

/* ─── Team performance (reports API) ─── */
export function TeamPerformance() {
  const { data, loading } = useApiQuery<TeamRow[]>(async () => {
    try {
      return unwrapReport<TeamRow>(await reportsApi.execute('team_dashboard', { per_page: 50 })).data;
    } catch {
      return [];
    }
  }, []);
  const team = (data ?? [])
    .filter((m) => m.total_leads > 0)
    .sort((a, b) => b.total_revenue - a.total_revenue)
    .slice(0, 5);
  const maxRevenue = Math.max(...team.map((t) => t.total_revenue), 1);
  return (
    <WidgetCard title="Team Performance">
      {loading ? (
        <WidgetSkeleton />
      ) : team.length === 0 ? (
        <p className={EMPTY_TEXT}>No team data yet</p>
      ) : (
        team.map((member) => (
          <div key={member.team_member} className="flex items-center gap-ds-3">
            <Avatar className="size-8">
              <AvatarFallback className="text-xs">{initials(member.team_member)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="mb-ds-1 flex items-center justify-between">
                <span className="text-sm font-medium text-ds-foreground">{member.team_member}</span>
                <span className="text-xs text-ds-foreground-muted">{formatCurrency(member.total_revenue)}</span>
              </div>
              <div className="flex items-center gap-ds-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ds-surface-sunken">
                  <div className="h-full rounded-full bg-ds-primary transition-all" style={{ width: `${(member.total_revenue / maxRevenue) * 100}%` }} />
                </div>
                <span className="w-20 text-right text-xs text-ds-foreground-muted">{member.won_deals}/{member.total_leads} won</span>
              </div>
            </div>
          </div>
        ))
      )}
    </WidgetCard>
  );
}

/* ─── Top destinations (won sales) ─── */
export function PopularDestinations() {
  const { data, loading } = useApiQuery<DestinationRow[]>(async () => {
    try {
      return unwrapReport<DestinationRow>(await reportsApi.execute('sales_by_destination', { per_page: 100 })).data;
    } catch {
      return [];
    }
  }, []);
  const merged = new Map<string, { leads: number; revenue: number }>();
  (data ?? []).forEach((row) => {
    const name = parseDestination(row.destination);
    if (!name) return;
    const entry = merged.get(name) ?? { leads: 0, revenue: 0 };
    entry.leads += row.lead_count;
    entry.revenue += row.total_revenue;
    merged.set(name, entry);
  });
  const destinations = Array.from(merged.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6);
  const maxRevenue = Math.max(...destinations.map((d) => d.revenue), 1);
  return (
    <WidgetCard title="Top Destinations (Booked)">
      {loading ? (
        <WidgetSkeleton />
      ) : destinations.length === 0 ? (
        <p className={EMPTY_TEXT}>No booked trips yet</p>
      ) : (
        destinations.map((dest) => (
          <div key={dest.name} className="flex items-center gap-ds-3">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-ds-lg bg-ds-primary-subtle">
              <MapPin className="size-3.5 text-ds-primary-on-subtle" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-ds-1 flex items-center justify-between gap-ds-2">
                <span className="truncate text-sm font-medium text-ds-foreground">{dest.name}</span>
                <span className="shrink-0 text-xs text-ds-foreground-muted">{dest.leads} booked · {formatCurrency(dest.revenue)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-ds-surface-sunken">
                <div className="h-full rounded-full bg-ds-primary/60 transition-all" style={{ width: `${(dest.revenue / maxRevenue) * 100}%` }} />
              </div>
            </div>
          </div>
        ))
      )}
    </WidgetCard>
  );
}

/* ─── Upcoming travel ─── */
export function UpcomingTravel() {
  const { data, loading } = useApiQuery(
    () => leadsApi.list({ page: 1, limit: 50, sortBy: 'travelDate', sortOrder: 'asc' }),
    [],
  );
  const today = toLocalDateString(new Date());
  const upcoming = unwrapList<LeadRow>(data).data
    .filter((l) => l.travelDate && l.travelDate >= today && l.status !== 'lost')
    .sort((a, b) => (a.travelDate ?? '').localeCompare(b.travelDate ?? ''))
    .slice(0, 5);
  return (
    <WidgetCard title="Upcoming Travel Dates">
      {loading ? (
        <WidgetSkeleton />
      ) : upcoming.length === 0 ? (
        <p className={EMPTY_TEXT}>No upcoming trips scheduled</p>
      ) : (
        upcoming.map((lead) => (
          <Link
            key={lead.id}
            href={`/leads/${lead.id}`}
            className="flex items-center gap-ds-3 rounded-ds-lg p-ds-2 transition-colors hover:bg-ds-surface-sunken focus-visible:ring-2 focus-visible:ring-ds-ring focus-visible:outline-none"
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-ds-lg bg-ds-primary-subtle">
              <Plane className="size-4 text-ds-primary-on-subtle" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ds-foreground">
                {lead.contactName ?? 'Unknown'} — {(lead.destinations ?? []).join(', ') || lead.title}
              </p>
              <p className="text-xs text-ds-foreground-muted">
                {(lead.paxAdults ?? 0) + (lead.paxChildren ?? 0)} pax · {formatCurrency(lead.budget ?? 0)}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs font-medium text-ds-foreground">{formatDisplayDate(lead.travelDate, 'medium')}</p>
              <Badge variant="outline" className="text-xs">
                {LEAD_STATUS_LABELS[lead.status as keyof typeof LEAD_STATUS_LABELS] ?? lead.status}
              </Badge>
            </div>
          </Link>
        ))
      )}
    </WidgetCard>
  );
}

/* ─── Upcoming events ─── */
const EVENT_TONES: Record<string, string> = {
  meeting: 'bg-ds-info-subtle text-ds-info-on-subtle',
  call: 'bg-ds-success-subtle text-ds-success-on-subtle',
  follow_up: 'bg-ds-warning-subtle text-ds-warning-on-subtle',
  deadline: 'bg-ds-danger-subtle text-ds-danger-on-subtle',
};

export function UpcomingEventsWidget() {
  const { data, loading } = useApiQuery(() => {
    const now = new Date();
    const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return eventsApi.list({ start_date: now.toISOString(), end_date: weekLater.toISOString(), limit: 5 });
  }, []);
  const events = unwrapList<CalendarEvent>(data).data.slice(0, 5);
  return (
    <WidgetCard title="Upcoming Events" action={<CardLink href="/calendar">Calendar</CardLink>}>
      {loading ? (
        <WidgetSkeleton />
      ) : events.length === 0 ? (
        <p className={EMPTY_TEXT}>No upcoming events</p>
      ) : (
        events.map((event) => {
          const start = event.start_at ?? event.startTime;
          const kind = event.event_type ?? event.type ?? 'other';
          return (
            <Link
              key={event.id}
              href="/calendar"
              className="flex items-center gap-ds-3 rounded-ds-lg p-ds-2 transition-colors hover:bg-ds-surface-sunken focus-visible:ring-2 focus-visible:ring-ds-ring focus-visible:outline-none"
            >
              <div className={cn('flex size-8 shrink-0 items-center justify-center rounded-ds-lg', EVENT_TONES[kind] ?? 'bg-ds-primary-subtle text-ds-primary-on-subtle')}>
                <Calendar className="size-3.5" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-ds-foreground">{event.title}</p>
                <p className="text-xs text-ds-foreground-muted">
                  {start ? new Date(start).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                </p>
              </div>
            </Link>
          );
        })
      )}
    </WidgetCard>
  );
}
