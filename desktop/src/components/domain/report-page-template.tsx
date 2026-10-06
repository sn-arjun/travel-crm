'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw } from 'lucide-react';

import { PageContainer } from '@/components/layout/page-container';
import {
  Button,
  DatePicker,
  Label,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@/components/ui';
import { reportsApi, type ReportExecuteParams } from '@/lib/api/reports';
import { toLocalDateString } from '@/lib/dates';

// ---------------------------------------------------------------------------
// Date range model shared by every report page
// ---------------------------------------------------------------------------

export type ReportPeriod =
  | 'last7'
  | 'last30'
  | 'last90'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisQuarter'
  | 'thisYear'
  | 'lastYear'
  | 'custom';

export const REPORT_PERIOD_OPTIONS: { label: string; value: ReportPeriod }[] = [
  { label: 'Last 7 Days', value: 'last7' },
  { label: 'Last 30 Days', value: 'last30' },
  { label: 'Last 90 Days', value: 'last90' },
  { label: 'This Month', value: 'thisMonth' },
  { label: 'Last Month', value: 'lastMonth' },
  { label: 'This Quarter', value: 'thisQuarter' },
  { label: 'This Year', value: 'thisYear' },
  { label: 'Last Year', value: 'lastYear' },
  { label: 'Custom range', value: 'custom' },
];

/** Presets the report engine resolves itself (calendar periods). */
const SERVER_PRESETS: Partial<Record<ReportPeriod, string>> = {
  thisMonth: 'this_month',
  lastMonth: 'last_month',
  thisQuarter: 'this_quarter',
  thisYear: 'this_year',
  lastYear: 'last_year',
};

const ROLLING_DAYS: Partial<Record<ReportPeriod, number>> = { last7: 7, last30: 30, last90: 90 };

export interface ReportRange {
  period: ReportPeriod;
  from: Date;
  to: Date;
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function daysAgo(n: number): Date {
  const t = startOfToday();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate() - n);
}

export function defaultRange(period: ReportPeriod = 'last30'): ReportRange {
  return { period, from: daysAgo(29), to: startOfToday() };
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/** Query params for a range: `date_preset` for calendar periods, `date_from`/`date_to` otherwise. */
export function rangeToParams(range: ReportRange): ReportExecuteParams {
  const preset = SERVER_PRESETS[range.period];
  if (preset) return { date_preset: preset };
  const days = ROLLING_DAYS[range.period];
  if (days) {
    return { date_from: daysAgo(days - 1).toISOString(), date_to: endOfDay(startOfToday()).toISOString() };
  }
  return { date_from: range.from.toISOString(), date_to: endOfDay(range.to).toISOString() };
}

/** Concrete calendar window a range covers (local time). Used to build the previous-period window. */
export function rangeWindow(range: ReportRange): { from: Date; to: Date } {
  const t = startOfToday();
  const y = t.getFullYear();
  const m = t.getMonth();
  switch (range.period) {
    case 'last7':
      return { from: daysAgo(6), to: endOfDay(t) };
    case 'last30':
      return { from: daysAgo(29), to: endOfDay(t) };
    case 'last90':
      return { from: daysAgo(89), to: endOfDay(t) };
    case 'thisMonth':
      return { from: new Date(y, m, 1), to: endOfDay(new Date(y, m + 1, 0)) };
    case 'lastMonth':
      return { from: new Date(y, m - 1, 1), to: endOfDay(new Date(y, m, 0)) };
    case 'thisQuarter': {
      const q = Math.floor(m / 3) * 3;
      return { from: new Date(y, q, 1), to: endOfDay(new Date(y, q + 3, 0)) };
    }
    case 'thisYear':
      return { from: new Date(y, 0, 1), to: endOfDay(new Date(y, 12, 0)) };
    case 'lastYear':
      return { from: new Date(y - 1, 0, 1), to: endOfDay(new Date(y - 1, 12, 0)) };
    default:
      return { from: range.from, to: endOfDay(range.to) };
  }
}

/** Params for the window of equal length that ends right before `range` starts. */
export function previousRangeParams(range: ReportRange): ReportExecuteParams {
  const { from, to } = rangeWindow(range);
  const length = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - length);
  return { date_from: prevFrom.toISOString(), date_to: prevTo.toISOString() };
}

/** Short token for download filenames, e.g. `last30` or `2026-01-01_to_2026-03-31`. */
export function rangeLabel(range: ReportRange): string {
  return range.period === 'custom'
    ? `${toLocalDateString(range.from)}_to_${toLocalDateString(range.to)}`
    : range.period;
}

// ---------------------------------------------------------------------------
// Context: sections read the page-level range / compare / refresh state
// ---------------------------------------------------------------------------

export interface ReportContextValue {
  /** Date range (+ `compare: true` when the toggle is on) merged into every report request. */
  params: ReportExecuteParams;
  /** Stable string form of `params`, for effect dependencies. */
  paramsKey: string;
  rangeLabel: string;
  compare: boolean;
  /** Date params of the window just before the selected one (for compare). */
  previousParams: ReportExecuteParams;
  /** Bumped by Refresh; sections refetch when it changes. */
  refreshKey: number;
}

const ReportContext = React.createContext<ReportContextValue | null>(null);

export function useReportContext(): ReportContextValue {
  const ctx = React.useContext(ReportContext);
  if (!ctx) throw new Error('useReportContext must be used inside <ReportPageTemplate>');
  return ctx;
}

// ---------------------------------------------------------------------------
// ReportPageTemplate
// ---------------------------------------------------------------------------

export interface ReportPageTemplateProps {
  /** Report page title, e.g. "Sales Reports". */
  title: string;
  /** Subtitle shown beneath the title. */
  description: string;
  /** Offer the compare-with-previous-period toggle. */
  showCompare?: boolean;
  /** Hide the date range control (for reports that ignore the range). */
  hideRange?: boolean;
  defaultPeriod?: ReportPeriod;
  /** Page-level export control; receives the active range params. */
  renderExport?: (ctx: ReportContextValue) => React.ReactNode;
  children: React.ReactNode;
}

export function ReportPageTemplate({
  title,
  description,
  showCompare = false,
  hideRange = false,
  defaultPeriod = 'last30',
  renderExport,
  children,
}: ReportPageTemplateProps) {
  const [range, setRange] = React.useState<ReportRange>(() => defaultRange(defaultPeriod));
  const [compare, setCompare] = React.useState(false);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);

  const ctx = React.useMemo<ReportContextValue>(() => {
    const params: ReportExecuteParams = { ...rangeToParams(range) };
    if (showCompare && compare) params.compare = true;
    return {
      params,
      paramsKey: JSON.stringify(params),
      rangeLabel: rangeLabel(range),
      compare: showCompare && compare,
      previousParams: previousRangeParams(range),
      refreshKey,
    };
  }, [range, compare, showCompare, refreshKey]);

  const handlePeriodChange = (value: string) => {
    setRange((prev) => ({ ...prev, period: value as ReportPeriod }));
  };

  // Server-side report results are cached for a few minutes; Refresh clears the tenant cache first.
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await reportsApi.invalidateCache();
    } catch {
      // Cache clear is best-effort; refetching still works.
    }
    setRefreshKey((k) => k + 1);
    setRefreshing(false);
  };

  return (
    <ReportContext.Provider value={ctx}>
      <PageContainer>
        <PageHeader
          title={title}
          description={description}
          back={
            <Button asChild variant="ghost" size="icon" aria-label="Back to reports">
              <Link href="/reports">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          }
          actions={
            <>
              <Button variant="outline" size="sm" onClick={() => void handleRefresh()} disabled={refreshing}>
                <RefreshCw className={refreshing ? 'mr-1.5 h-4 w-4 animate-spin' : 'mr-1.5 h-4 w-4'} aria-hidden="true" />
                Refresh
              </Button>
              {renderExport?.(ctx)}
            </>
          }
        />

        {(!hideRange || showCompare) && (
          <div className="flex flex-wrap items-center justify-between gap-ds-3 rounded-ds-lg border border-ds-border bg-ds-surface-sunken px-ds-4 py-ds-3">
            {!hideRange ? (
              <div className="flex flex-wrap items-center gap-ds-3">
                <span className="text-sm font-medium text-ds-foreground">Date Range:</span>
                <Select value={range.period} onValueChange={handlePeriodChange}>
                  <SelectTrigger className="w-48" aria-label="Date range">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REPORT_PERIOD_OPTIONS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {range.period === 'custom' && (
                  <div className="flex flex-wrap items-center gap-ds-2">
                    <DatePicker
                      value={range.from}
                      maxDate={range.to}
                      onChange={(d) => d && setRange((prev) => ({ ...prev, from: d }))}
                      placeholder="From"
                      fromYear={2020}
                      className="w-40"
                    />
                    <span className="text-sm text-ds-foreground-muted">to</span>
                    <DatePicker
                      value={range.to}
                      minDate={range.from}
                      onChange={(d) => d && setRange((prev) => ({ ...prev, to: d }))}
                      placeholder="To"
                      fromYear={2020}
                      className="w-40"
                    />
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-ds-foreground-muted">This report shows current data and ignores the date range.</p>
            )}

            {showCompare && (
              <div className="flex items-center gap-ds-2">
                <Switch id="compare-toggle" checked={compare} onCheckedChange={setCompare} />
                <Label htmlFor="compare-toggle" className="cursor-pointer text-sm">
                  Compare with previous period
                </Label>
              </div>
            )}
          </div>
        )}

        {children}
      </PageContainer>
    </ReportContext.Provider>
  );
}
