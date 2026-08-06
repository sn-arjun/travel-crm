'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Download, AlertCircle, RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

// ---------------------------------------------------------------------------
// Default period options shared across all report pages
// ---------------------------------------------------------------------------

export const DEFAULT_PERIOD_OPTIONS: { label: string; value: string }[] = [
  { label: 'Last 7 Days', value: '7days' },
  { label: 'Last 30 Days', value: '30days' },
  { label: 'Last 90 Days', value: '90days' },
  { label: 'This Month', value: 'thisMonth' },
  { label: 'Last Month', value: 'lastMonth' },
  { label: 'This Quarter', value: 'thisQuarter' },
  { label: 'This Year', value: 'thisYear' },
];

export const PRESET_MAP: Record<string, string> = {
  '7days': 'this_week',
  '30days': 'this_month',
  '90days': 'this_quarter',
  'thisMonth': 'this_month',
  'lastMonth': 'last_month',
  'thisQuarter': 'this_quarter',
  'thisYear': 'this_year',
};

// ---------------------------------------------------------------------------
// Sub-components that were duplicated across every report page
// ---------------------------------------------------------------------------

export function SummaryCard({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string;
  subtext?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground mb-1">{label}</p>
      <p className="text-2xl font-bold mb-1">{value}</p>
      {subtext && <p className="text-xs text-muted-foreground">{subtext}</p>}
    </div>
  );
}

export function KPISkeleton() {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-2">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

export function ReportErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4 text-muted-foreground">
      <AlertCircle className="h-10 w-10 text-destructive" />
      <p className="text-sm font-medium text-destructive">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="h-4 w-4 mr-1.5" />
          Retry
        </Button>
      )}
    </div>
  );
}

export function ReportEmptyState({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
      <p className="text-sm">{message ?? 'No data for selected period.'}</p>
    </div>
  );
}

export function ChartSkeleton({ height = 300 }: { height?: number }) {
  return <Skeleton className="w-full rounded-md" style={{ height }} />;
}

// ---------------------------------------------------------------------------
// Props for the shared layout template
// ---------------------------------------------------------------------------

export interface ReportPageTemplateProps {
  /** Report page title, e.g. "Sales Reports" */
  title: string;
  /** Subtitle shown beneath the title */
  description: string;
  /** Period filter options — defaults to DEFAULT_PERIOD_OPTIONS */
  periods?: { label: string; value: string }[];
  /** Currently selected period value */
  selectedPeriod: string;
  /** Called when the user picks a different period */
  onPeriodChange: (value: string) => void;
  /** Optional custom date range (from / to) */
  dateRange?: { from: string; to: string };
  /** Called when custom date range changes */
  onDateRangeChange?: (range: { from: string; to: string }) => void;
  /** Whether the report data is loading */
  isLoading: boolean;
  /** Error message to display instead of children */
  error?: string;
  /** Retry callback when an error is displayed */
  onRetry?: () => void;
  /** Export button handler. If omitted the Export button is hidden. */
  exportFn?: () => void;
  /** Whether the export is in progress */
  isExporting?: boolean;
  /** Optional compare-with-previous-period toggle */
  compareEnabled?: boolean;
  /** Called when compare toggle changes */
  onCompareChange?: (enabled: boolean) => void;
  /** The charts/tables/tab content */
  children: React.ReactNode;
  /** Optional KPI summary cards rendered in the header area */
  headerCards?: React.ReactNode;
  /** Breadcrumb parent label — defaults to "Reports" */
  parentLabel?: string;
  /** Breadcrumb parent href — defaults to "/reports" */
  parentHref?: string;
}

// ---------------------------------------------------------------------------
// ReportPageTemplate component
// ---------------------------------------------------------------------------

export function ReportPageTemplate({
  title,
  description,
  periods = DEFAULT_PERIOD_OPTIONS,
  selectedPeriod,
  onPeriodChange,
  dateRange,
  onDateRangeChange,
  isLoading,
  error,
  onRetry,
  exportFn,
  isExporting,
  compareEnabled,
  onCompareChange,
  children,
  headerCards,
  parentLabel = 'Reports',
  parentHref = '/reports',
}: ReportPageTemplateProps) {
  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="px-6 py-4 border-b">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
          <Link href={parentHref} className="hover:text-foreground transition-colors">
            {parentLabel}
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">{title}</span>
        </div>

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Link href={parentHref}>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold tracking-tight">{title}</h1>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          </div>
          {exportFn && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={exportFn}
                disabled={isExporting}
              >
                {isExporting ? (
                  <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-1.5" />
                )}
                Export
              </Button>
            </div>
          )}
        </div>

        {/* Optional KPI / summary cards in header */}
        {headerCards}
      </div>

      {/* ── Filters bar ──────────────────────────────────────────────────── */}
      <div className="px-6 py-3 border-b bg-muted/50 flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-4">
          {/* Period selector */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Date Range:</span>
            <Select value={selectedPeriod} onValueChange={onPeriodChange}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {periods.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Custom date range (from / to) */}
          {dateRange && onDateRangeChange && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">From:</span>
              <input
                type="date"
                value={dateRange.from}
                onChange={(e) =>
                  onDateRangeChange({ ...dateRange, from: e.target.value })
                }
                className="h-9 rounded-md border bg-background px-3 text-sm"
              />
              <span className="text-sm font-medium">To:</span>
              <input
                type="date"
                value={dateRange.to}
                onChange={(e) =>
                  onDateRangeChange({ ...dateRange, to: e.target.value })
                }
                className="h-9 rounded-md border bg-background px-3 text-sm"
              />
            </div>
          )}
        </div>

        {/* Compare toggle */}
        {onCompareChange !== undefined && (
          <div className="flex items-center gap-2">
            <Switch
              id="compare-toggle"
              checked={compareEnabled ?? false}
              onCheckedChange={onCompareChange}
            />
            <Label htmlFor="compare-toggle" className="text-sm cursor-pointer">
              Compare with previous period
            </Label>
          </div>
        )}
      </div>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="flex-1 p-6 overflow-auto">
        {error ? (
          <ReportErrorState message={error} onRetry={onRetry} />
        ) : (
          children
        )}
      </div>
    </div>
  );
}
