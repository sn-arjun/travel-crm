/**
 * Data layer for the dashboard. Every figure shown on the page is derived from
 * the reports API (period-aware) or from small, server-limited lists.
 */

import { formatTightCurrency, formatCalendarDay } from '@/lib/format';
import { reportsApi, type DashboardResponse } from '@/lib/api/reports';
import { unwrapEntity, unwrapReport } from '@/lib/api/envelope';
import { toLocalDateString } from '@/lib/dates';

export type DashboardPeriod = 'week' | 'month' | 'quarter' | 'year';

export const PERIOD_OPTIONS: Array<{ value: DashboardPeriod; label: string; short: string }> = [
  { value: 'week', label: 'This Week', short: 'Week' },
  { value: 'month', label: 'This Month', short: 'Month' },
  { value: 'quarter', label: 'This Quarter', short: 'Quarter' },
  { value: 'year', label: 'This Year', short: 'Year' },
];

export interface DateWindow {
  from: Date;
  to: Date;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/** Calendar window for a period (weeks start on Monday), plus the window just before it. */
export function periodWindows(period: DashboardPeriod, now: Date): { current: DateWindow; previous: DateWindow } {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (period) {
    case 'week': {
      const mondayOffset = (now.getDay() + 6) % 7;
      const start = new Date(y, m, now.getDate() - mondayOffset);
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
      const prevStart = new Date(start.getFullYear(), start.getMonth(), start.getDate() - 7);
      const prevEnd = new Date(start.getFullYear(), start.getMonth(), start.getDate() - 1);
      return {
        current: { from: startOfDay(start), to: endOfDay(end) },
        previous: { from: startOfDay(prevStart), to: endOfDay(prevEnd) },
      };
    }
    case 'quarter': {
      const qStart = Math.floor(m / 3) * 3;
      return {
        current: { from: new Date(y, qStart, 1), to: endOfDay(new Date(y, qStart + 3, 0)) },
        previous: { from: new Date(y, qStart - 3, 1), to: endOfDay(new Date(y, qStart, 0)) },
      };
    }
    case 'year':
      return {
        current: { from: new Date(y, 0, 1), to: endOfDay(new Date(y, 12, 0)) },
        previous: { from: new Date(y - 1, 0, 1), to: endOfDay(new Date(y - 1, 12, 0)) },
      };
    case 'month':
    default:
      return {
        current: { from: new Date(y, m, 1), to: endOfDay(new Date(y, m + 1, 0)) },
        previous: { from: new Date(y, m - 1, 1), to: endOfDay(new Date(y, m, 0)) },
      };
  }
}

export function formatCurrency(amount: number): string {
  return formatTightCurrency(amount);
}

/** Percentage change, or null when there is no previous value to compare against. */
export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

// ─── Report row shapes (as returned by the report engine) ───────────────────

interface RevenueRow {
  status: string;
  type: string;
  invoice_count: number;
  total_amount: number;
  total_outstanding: number;
}

interface SalesRow {
  total_leads: number;
  won_leads: number;
}

interface CollectionRow {
  collected_amount: number;
}

export interface PeriodTotals {
  newLeads: number;
  bookings: number;
  invoiced: number;
  collected: number;
  /** Share of non-draft invoiced value already paid, 0-100; null when nothing was invoiced. */
  collectionRate: number | null;
}

/**
 * Colour class for a money figure that normally signals something (green collected, amber outstanding, red overdue).
 * Zero, empty and unknown amounts are neutral: nothing owed is not an error. Negative amounts always read as danger.
 */
export function moneyTone(amount: number | null | undefined, tone: string): string | undefined {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount === 0) return undefined;
  return amount < 0 ? 'text-ds-danger' : tone;
}

const INVOICED_TYPES = new Set(['tax_invoice', 'proforma']);

function sum<T>(rows: T[], pick: (row: T) => number): number {
  return rows.reduce((acc, row) => acc + (Number(pick(row)) || 0), 0);
}

function summariseRevenue(rows: RevenueRow[]): { invoiced: number; collectionRate: number | null } {
  // Same definition as the backend dashboard: tax invoices + proformas that are not cancelled.
  const invoiced = rows.filter((r) => INVOICED_TYPES.has(r.type) && r.status !== 'cancelled');
  const issued = invoiced.filter((r) => r.status !== 'draft');
  const issuedTotal = sum(issued, (r) => r.total_amount);
  const issuedOutstanding = sum(issued, (r) => r.total_outstanding);
  return {
    invoiced: sum(invoiced, (r) => r.total_amount),
    collectionRate: issuedTotal > 0 ? Math.max(0, Math.min(100, ((issuedTotal - issuedOutstanding) / issuedTotal) * 100)) : null,
  };
}

async function reportRows<T>(id: string, window: DateWindow): Promise<T[] | null> {
  try {
    const res = await reportsApi.execute<T>(id, {
      date_from: window.from.toISOString(),
      date_to: window.to.toISOString(),
      per_page: 500,
    });
    return unwrapReport<T>(res).data;
  } catch {
    // Role without access to this report, or a transient failure: the tile shows "—".
    return null;
  }
}

async function periodTotals(window: DateWindow): Promise<PeriodTotals | null> {
  const [revenue, sales, collections] = await Promise.all([
    reportRows<RevenueRow>('revenue_summary', window),
    reportRows<SalesRow>('sales_summary', window),
    reportRows<CollectionRow>('collections_report', window),
  ]);
  if (!revenue && !sales && !collections) return null;
  const rev = revenue ? summariseRevenue(revenue) : null;
  return {
    newLeads: sales ? sum(sales, (r) => r.total_leads) : Number.NaN,
    bookings: sales ? sum(sales, (r) => r.won_leads) : Number.NaN,
    invoiced: rev ? rev.invoiced : Number.NaN,
    collected: collections ? sum(collections, (r) => r.collected_amount) : Number.NaN,
    collectionRate: rev ? rev.collectionRate : null,
  };
}

export interface PeriodMetrics {
  current: PeriodTotals | null;
  previous: PeriodTotals | null;
}

export async function loadPeriodMetrics(period: DashboardPeriod): Promise<PeriodMetrics> {
  const now = new Date();
  const { current, previous } = periodWindows(period, now);
  // Compare like with like: only the part of the previous period that matches the elapsed part of this one.
  const elapsed = Math.min(now.getTime(), current.to.getTime()) - current.from.getTime();
  const comparable: DateWindow = {
    from: previous.from,
    to: new Date(Math.min(previous.to.getTime(), previous.from.getTime() + elapsed)),
  };
  const [cur, prev] = await Promise.all([periodTotals(current), periodTotals(comparable)]);
  return { current: cur, previous: prev };
}

export interface TrendPoint {
  key: string;
  label: string;
  value: number;
}

/** Invoiced revenue for each of the last six calendar months (oldest first). */
export async function loadRevenueTrend(): Promise<TrendPoint[]> {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const first = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const last = endOfDay(new Date(first.getFullYear(), first.getMonth() + 1, 0));
    return {
      key: toLocalDateString(first).slice(0, 7),
      label: formatCalendarDay(first, { month: 'short' }),
      window: { from: first, to: last },
    };
  });
  const results = await Promise.all(months.map((m) => reportRows<RevenueRow>('revenue_summary', m.window)));
  return months.map((m, i) => ({
    key: m.key,
    label: m.label,
    value: results[i] ? summariseRevenue(results[i]).invoiced : 0,
  }));
}

// ─── Dashboard summary endpoint ─────────────────────────────────────────────

export interface DashboardSummary {
  pipeline: Array<{ status: string; count: number; total_value: number }>;
  followUps: { total: number; overdue: number; pending: number };
  financial: {
    outstanding: number;
    overdue: number;
    invoicedThisMonth: number;
    collectionsThisMonth: number;
  };
}

export async function loadDashboardSummary(): Promise<DashboardSummary> {
  const res = await reportsApi.getDashboard();
  const d = unwrapEntity<Partial<DashboardResponse>>(res);
  return {
    pipeline: d.pipeline ?? [],
    followUps: d.followUps ?? { total: 0, overdue: 0, pending: 0 },
    financial: {
      outstanding: d.financial?.outstanding ?? 0,
      overdue: d.financial?.overdue ?? 0,
      invoicedThisMonth: d.financial?.invoicedThisMonth ?? 0,
      collectionsThisMonth: d.financial?.collectionsThisMonth ?? 0,
    },
  };
}

// ─── Small list row shapes ──────────────────────────────────────────────────

export interface LeadRow {
  id: string;
  title?: string;
  contactName?: string;
  destinations?: string[];
  travelDate?: string | null;
  status: string;
  budget?: number | null;
  paxAdults?: number;
  paxChildren?: number;
  createdAt?: string;
}

export interface FollowUpRow {
  id: string;
  leadId: string;
  leadTitle?: string;
  contactName?: string;
  type: string;
  scheduledAt: string;
  completedAt?: string | null;
}

export interface TeamRow {
  team_member: string;
  total_leads: number;
  won_deals: number;
  total_revenue: number;
}

export interface DestinationRow {
  destination: string;
  lead_count: number;
  total_revenue: number;
}

/** Destinations are stored as a JSON array string (`["Goa","Hampi"]`) or plain text. */
export function parseDestination(raw: string | null | undefined): string {
  if (!raw) return '';
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((p): p is string => typeof p === 'string').join(', ');
  } catch {
    /* plain text */
  }
  return raw;
}
