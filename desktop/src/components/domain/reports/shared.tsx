'use client';

import * as React from 'react';
import { AlertCircle, Download, FileSpreadsheet, FileText, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DataTable,
  EmptyState,
  Skeleton,
  SplitButton,
  Stat,
  type DataTableColumn,
} from '@/components/ui';
import { useReportContext } from '@/components/domain/report-page-template';
import { useThemeTokens } from '@/design-system/tokens/use-theme-tokens';
import { unwrapReport } from '@/lib/api/envelope';
import { reportsApi, type ReportExecuteParams } from '@/lib/api/reports';
import { usersApi } from '@/lib/api/users';
import { parseLocalDate } from '@/lib/dates';

// ---------------------------------------------------------------------------
// Token-driven chart colors. Series N uses index N % colors.length.
// ---------------------------------------------------------------------------

export function useReportChartColors(): string[] {
  const { chart } = useThemeTokens();
  return chart;
}

/** Semantic single colors for common report chart roles (revenue, danger, etc). */
export function useReportSemanticColors(): {
  primary: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  neutral: string;
} {
  const { colors } = useThemeTokens();
  return {
    primary: colors.primary ?? '',
    success: colors.success ?? '',
    warning: colors.warning ?? '',
    danger: colors.danger ?? '',
    info: colors.info ?? '',
    neutral: colors['foreground-subtle'] ?? '',
  };
}

// ---------------------------------------------------------------------------
// Formatting. INR, en-IN grouping, consistent across all report pages.
// ---------------------------------------------------------------------------

export function formatReportCurrency(amount: number | null | undefined): string {
  const n = Number(amount) || 0;
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 10_000_000) return `${sign}₹${(abs / 10_000_000).toFixed(1)}Cr`;
  if (abs >= 100_000) return `${sign}₹${(abs / 100_000).toFixed(1)}L`;
  if (abs >= 1_000) return `${sign}₹${(abs / 1_000).toFixed(0)}K`;
  return `${sign}₹${abs.toLocaleString('en-IN')}`;
}

/** Full-precision rupee amount for tables ("₹1,80,001.50"). */
export function formatReportMoney(amount: number | null | undefined): string {
  return `₹${(Number(amount) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export function formatCount(n: number | null | undefined): string {
  return (Number(n) || 0).toLocaleString('en-IN');
}

export function formatPercent(n: number | null | undefined, digits = 1): string {
  return `${(Number(n) || 0).toFixed(digits)}%`;
}

export function formatDecimal(n: number | null | undefined, digits = 1): string {
  return (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: digits });
}

/** "in_progress" -> "In progress". */
export function humanize(value: string | null | undefined): string {
  if (!value) return 'Unknown';
  const text = value.replace(/[_-]+/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Destinations are stored as a JSON array string: '["Goa","Kerala"]' -> "Goa, Kerala". */
export function formatDestinations(raw: string | null | undefined): string {
  if (!raw) return 'Unspecified';
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const names = parsed.filter((p): p is string => typeof p === 'string' && p.trim() !== '');
      return names.length > 0 ? names.join(', ') : 'Unspecified';
    }
  } catch {
    // Plain text destination.
  }
  return raw;
}

const MONTH_FORMAT = new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric' });

/** "2026-08" -> "Aug 2026". */
export function formatMonthKey(key: string | null | undefined): string {
  if (!key) return 'Unknown';
  const date = parseLocalDate(`${key}-01`);
  return Number.isNaN(date.getTime()) ? key : MONTH_FORMAT.format(date);
}

export function sumBy<T>(rows: T[], pick: (row: T) => number | null | undefined): number {
  return rows.reduce((acc, row) => acc + (Number(pick(row)) || 0), 0);
}

// ---------------------------------------------------------------------------
// Data hooks
// ---------------------------------------------------------------------------

export interface ReportQuery<T> {
  rows: T[];
  loading: boolean;
  error: string | null;
  /** Same report for the window just before the selected range; only when Compare is on and `withPrevious` was asked for. */
  previousRows: T[] | null;
  retry: () => void;
}

const DATE_PARAM_KEYS = ['date_from', 'date_to', 'date_preset'] as const;

function errorMessage(err: unknown): string {
  const status = typeof err === 'object' && err !== null && 'status' in err ? Number((err as { status: unknown }).status) : 0;
  if (status === 403) return 'You do not have access to this report.';
  return 'Failed to load report';
}

/**
 * Runs one report with the page-level date range / compare / refresh state.
 * `ignoreRange` is for reports that are not date-bound (birthdays, dormant customers).
 */
export function useReport<T>(
  reportId: string,
  extra: ReportExecuteParams = {},
  opts: { ignoreRange?: boolean; withPrevious?: boolean } = {},
): ReportQuery<T> {
  const ctx = useReportContext();
  const [state, setState] = React.useState<Omit<ReportQuery<T>, 'retry'>>({
    rows: [],
    loading: true,
    error: null,
    previousRows: null,
  });
  const [retryKey, setRetryKey] = React.useState(0);
  const extraRef = React.useRef(extra);
  extraRef.current = extra;

  const params = React.useMemo(() => {
    const merged: ReportExecuteParams = { per_page: 100, ...extra, ...ctx.params };
    if (opts.ignoreRange) {
      for (const k of DATE_PARAM_KEYS) delete merged[k];
      delete merged.compare;
    }
    return merged;
    // `extra` is a fresh literal each render; its content is covered by the key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.paramsKey, JSON.stringify(extra), opts.ignoreRange]);

  React.useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    const wantPrevious = Boolean(opts.withPrevious && ctx.compare && !opts.ignoreRange);
    const previousRequest = wantPrevious
      ? reportsApi
          .execute<T>(reportId, { per_page: 100, ...extraRef.current, ...ctx.previousParams })
          .then((res) => unwrapReport<T>(res).data)
          .catch(() => null)
      : Promise.resolve(null);
    Promise.all([reportsApi.execute<T>(reportId, params), previousRequest])
      .then(([res, previousRows]) => {
        if (cancelled) return;
        const env = unwrapReport<T>(res);
        setState({
          rows: Array.isArray(env.data) ? env.data : [],
          loading: false,
          error: null,
          previousRows: Array.isArray(previousRows) ? previousRows : null,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({ rows: [], loading: false, error: errorMessage(err), previousRows: null });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId, params, ctx.refreshKey, retryKey]);

  const retry = React.useCallback(() => setRetryKey((k) => k + 1), []);
  return { ...state, retry };
}

let userNameCache: Promise<Map<string, string>> | null = null;

function loadUserNames(): Promise<Map<string, string>> {
  if (!userNameCache) {
    userNameCache = usersApi
      .list({ limit: 500 })
      .then((res) => new Map(res.data.map((u) => [u.id, u.name])))
      .catch(() => {
        userNameCache = null;
        return new Map<string, string>();
      });
  }
  return userNameCache;
}

/** Resolves the user ids that report rows carry (assigned_to, team_member) to display names. */
export function useUserNames(): (id: string | null | undefined) => string {
  const [names, setNames] = React.useState<Map<string, string>>(new Map());
  React.useEffect(() => {
    let cancelled = false;
    void loadUserNames().then((m) => {
      if (!cancelled) setNames(m);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return React.useCallback(
    (id) => {
      if (!id) return 'Unassigned';
      return names.get(id) ?? (names.size === 0 ? '…' : 'Former team member');
    },
    [names],
  );
}

/** Percentage change of the summed column over the previous window; undefined without a baseline. */
export function deltaOf<T>(
  rows: T[],
  previousRows: T[] | null,
  pick: (row: T) => number | null | undefined,
): number | undefined {
  if (!previousRows) return undefined;
  const prev = sumBy(previousRows, pick);
  if (prev <= 0) return undefined;
  return ((sumBy(rows, pick) - prev) / prev) * 100;
}

// ---------------------------------------------------------------------------
// Empty / error states
// ---------------------------------------------------------------------------

export function ReportTabEmptyState({ message }: { message?: string }) {
  return (
    <EmptyState
      title="No data for this period"
      description={message ?? 'Try a different date range.'}
      className="py-12"
    />
  );
}

export function ReportTabErrorState({
  message = 'Failed to load report',
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-ds-3 py-12 text-ds-foreground-muted">
      <AlertCircle className="h-8 w-8 text-ds-danger" aria-hidden="true" />
      <p className="text-sm font-medium text-ds-danger">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Retry
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout building blocks
// ---------------------------------------------------------------------------

export interface ReportKpi {
  label: string;
  value: string;
  hint?: string;
  delta?: number;
  invertDelta?: boolean;
}

export function ReportKpis({ items, loading }: { items: ReportKpi[]; loading?: boolean }) {
  const count = loading ? 4 : items.length;
  return (
    <div
      className={
        count >= 4
          ? 'grid grid-cols-1 gap-ds-4 sm:grid-cols-2 lg:grid-cols-4'
          : 'grid grid-cols-1 gap-ds-4 sm:grid-cols-3'
      }
    >
      {loading
        ? Array.from({ length: 4 }, (_, i) => <Stat key={i} label="" value="" loading />)
        : items.map((k) => (
            <Stat
              key={k.label}
              label={k.label}
              value={k.value}
              hint={k.hint}
              delta={k.delta}
              invertDelta={k.invertDelta}
            />
          ))}
    </div>
  );
}

export type ReportTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONE_CLASSES: Record<ReportTone, string> = {
  success: 'bg-ds-success-subtle text-ds-success-on-subtle',
  warning: 'bg-ds-warning-subtle text-ds-warning-on-subtle',
  danger: 'bg-ds-danger-subtle text-ds-danger-on-subtle',
  info: 'bg-ds-info-subtle text-ds-info-on-subtle',
  neutral: 'bg-ds-surface-sunken text-ds-foreground-muted',
};

/** Small status pill for table cells. */
export function ReportBadge({ tone, children }: { tone: ReportTone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}>
      {children}
    </span>
  );
}

/** A titled card that holds one chart or table. */
export function ReportPanel({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function ReportPanelGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-ds-4 xl:grid-cols-2">{children}</div>;
}

export interface ReportTableColumn<T> {
  key: string;
  header: string;
  cell?: (row: T) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
}

/** Detail table for a report. Rows scroll inside the table's own scroll region. */
export function ReportTable<T>({
  rows,
  columns,
  caption,
}: {
  rows: T[];
  columns: ReportTableColumn<T>[];
  caption: string;
}) {
  const indexed = React.useMemo(() => rows.map((row, i) => ({ row, id: String(i) })), [rows]);
  const tableColumns: DataTableColumn<{ row: T; id: string }>[] = React.useMemo(
    () =>
      columns.map((c) => ({
        key: c.key,
        header: c.header,
        align: c.align,
        minWidth: '8rem',
        cell: (r) => {
          if (c.cell) return c.cell(r.row);
          const value = (r.row as Record<string, unknown>)[c.key];
          return value === null || value === undefined || value === '' ? '—' : String(value);
        },
      })),
    [columns],
  );
  return (
    <DataTable
      columns={tableColumns}
      data={indexed}
      getRowId={(r) => r.id}
      maxHeight="28rem"
      caption={caption}
    />
  );
}

/**
 * Wraps one report query in the three states every tab must have: loading
 * skeleton, error with Retry, and an empty state. Renders `children(rows)`
 * only when there is data.
 */
export function ReportSection<T>({
  reportId,
  params,
  ignoreRange,
  comparable,
  kpis,
  emptyMessage,
  children,
}: {
  reportId: string;
  params?: ReportExecuteParams;
  ignoreRange?: boolean;
  /** Compare-capable: runs the report for the previous window too when Compare is on. */
  comparable?: boolean;
  kpis?: (rows: T[], previousRows: T[] | null) => ReportKpi[];
  emptyMessage?: string;
  children: (rows: T[]) => React.ReactNode;
}) {
  const q = useReport<T>(reportId, params, { ignoreRange, withPrevious: comparable });

  if (q.loading) {
    return (
      <div className="space-y-ds-4" aria-busy="true">
        {kpis && <ReportKpis items={[]} loading />}
        <Card>
          <CardContent className="pt-ds-5">
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }
  if (q.error) {
    return (
      <Card>
        <CardContent>
          <ReportTabErrorState message={q.error} onRetry={q.retry} />
        </CardContent>
      </Card>
    );
  }
  if (q.rows.length === 0) {
    return (
      <Card>
        <CardContent>
          <ReportTabEmptyState message={emptyMessage} />
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-ds-4">
      {kpis && <ReportKpis items={kpis(q.rows, q.previousRows)} />}
      {children(q.rows)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Themed export button: Excel (+ optional PDF), spinner, toasts.
// ---------------------------------------------------------------------------

export interface ReportExportButtonProps {
  /** Report id/slug passed to reportsApi.export, e.g. 'sales_summary'. */
  reportId: string;
  /** Params forwarded to the export endpoint (date range etc). */
  params?: ReportExecuteParams;
  /** Filename prefix, e.g. 'sales-report'. Suffixed with -{rangeLabel}.{ext}. */
  filenamePrefix: string;
  /** Range label used in the filename, e.g. 'last30'. */
  rangeLabel: string;
  /** Offer a PDF option in addition to Excel. Defaults to true. */
  allowPdf?: boolean;
  size?: 'sm' | 'default';
  variant?: React.ComponentProps<typeof Button>['variant'];
  className?: string;
}

async function downloadReportBlob(
  reportId: string,
  format: 'excel' | 'pdf',
  params: ReportExecuteParams | undefined,
  filenamePrefix: string,
  rangeLabel: string,
) {
  const resp = await reportsApi.export(reportId, format, params);
  const raw = (resp as unknown as { data?: unknown })?.data ?? resp;
  const blob = raw instanceof Blob ? raw : new Blob([raw as BlobPart]);
  const ext = format === 'pdf' ? 'pdf' : 'xlsx';
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filenamePrefix}-${rangeLabel}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export function ReportExportButton({
  reportId,
  params,
  filenamePrefix,
  rangeLabel,
  allowPdf = true,
  size = 'sm',
  variant = 'outline',
  className,
}: ReportExportButtonProps) {
  const [exporting, setExporting] = React.useState<'excel' | 'pdf' | null>(null);

  const runExport = React.useCallback(
    async (format: 'excel' | 'pdf') => {
      setExporting(format);
      try {
        await downloadReportBlob(reportId, format, params, filenamePrefix, rangeLabel);
        toast.success(`${format === 'pdf' ? 'PDF' : 'Excel'} export downloaded`);
      } catch {
        toast.error('Failed to export report. Please try again.');
      } finally {
        setExporting(null);
      }
    },
    [reportId, params, filenamePrefix, rangeLabel],
  );

  const isExporting = exporting !== null;

  if (!allowPdf) {
    return (
      <Button
        variant={variant}
        size={size}
        onClick={() => void runExport('excel')}
        disabled={isExporting}
        className={className}
      >
        {isExporting ? (
          <RefreshCw className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
        )}
        {isExporting ? 'Exporting…' : 'Export'}
      </Button>
    );
  }

  return (
    <SplitButton
      label={isExporting ? 'Exporting…' : 'Export Excel'}
      icon={
        isExporting ? (
          <RefreshCw className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <FileSpreadsheet className="mr-1.5 h-4 w-4" aria-hidden="true" />
        )
      }
      onClick={() => void runExport('excel')}
      disabled={isExporting}
      variant={variant}
      size={size}
      menuLabel="More export options"
      className={className}
      actions={[
        {
          label: 'Export as PDF',
          icon: <FileText className="h-4 w-4" aria-hidden="true" />,
          onSelect: () => void runExport('pdf'),
          disabled: isExporting,
        },
      ]}
    />
  );
}
