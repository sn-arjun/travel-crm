'use client';

import * as React from 'react';
import { AlertCircle, Download, FileSpreadsheet, FileText, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { Button, EmptyState, SplitButton } from '@/components/ui';
import { useThemeTokens } from '@/design-system/tokens/use-theme-tokens';
import { reportsApi, type ReportExecuteParams } from '@/lib/api/reports';

// ---------------------------------------------------------------------------
// Shared date-range preset map — same values as report-page-template.tsx,
// duplicated here (rather than imported) because that file lives outside
// this slice's fileAllowlist and must stay read-only.
// ---------------------------------------------------------------------------

export const REPORT_PRESET_MAP: Record<string, string> = {
  '7days': 'this_week',
  '30days': 'this_month',
  '90days': 'this_quarter',
  thisMonth: 'this_month',
  lastMonth: 'last_month',
  thisQuarter: 'this_quarter',
  thisYear: 'this_year',
};

// ---------------------------------------------------------------------------
// Token-driven chart color list — replaces every hardcoded literal hex-color
// CHART_COLORS array duplicated across report pages. Use
// `useReportChartColors()` inside a component; series N uses index
// N % colors.length, same convention as the old hardcoded arrays.
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
    /** Neutral fallback for data-driven indicator dots/badges with no server color. */
    neutral: colors['foreground-subtle'] ?? '',
  };
}

/**
 * Token-driven color for a workflow/status label (approved, rejected, pending,
 * in-progress, etc). Replaces the ad-hoc `STATUS_COLORS` hex maps duplicated
 * across report pages (visa, leads, ...). Case-insensitive lookup with a
 * neutral fallback for unrecognized statuses.
 */
export function useReportStatusColor() {
  const semanticColors = useReportSemanticColors();
  const chart = useReportChartColors();

  const statusColorMap: Record<string, string> = {
    approved: semanticColors.success,
    won: semanticColors.success,
    completed: semanticColors.success,
    active: semanticColors.success,
    rejected: semanticColors.danger,
    lost: semanticColors.danger,
    failed: semanticColors.danger,
    cancelled: semanticColors.danger,
    pending: semanticColors.warning,
    overdue: semanticColors.warning,
    'in progress': semanticColors.primary,
    'in_progress': semanticColors.primary,
    applied: chart[4] ?? semanticColors.primary,
    expired: semanticColors.neutral,
    inactive: semanticColors.neutral,
  };

  return (status: string | undefined | null): string => {
    if (!status) return semanticColors.neutral;
    return statusColorMap[status.toLowerCase()] ?? semanticColors.neutral;
  };
}

// ---------------------------------------------------------------------------
// Currency formatting — INR only, consistent across all report pages.
// ---------------------------------------------------------------------------

export function formatReportCurrency(amount: number): string {
  if (amount >= 10_000_000) return `₹${(amount / 10_000_000).toFixed(1)}Cr`;
  if (amount >= 100_000) return `₹${(amount / 100_000).toFixed(1)}L`;
  if (amount >= 1_000) return `₹${(amount / 1_000).toFixed(0)}K`;
  return `₹${amount.toLocaleString('en-IN')}`;
}

// ---------------------------------------------------------------------------
// Empty / error states — thin wrappers around @/components/ui EmptyState so
// every report tab renders the same empty/error visuals.
// ---------------------------------------------------------------------------

export function ReportTabEmptyState({ message }: { message?: string }) {
  return (
    <EmptyState
      title="No data for this period"
      description={message ?? 'Try a different date range or clear the compare toggle.'}
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
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-ds-foreground-muted">
      <AlertCircle className="h-8 w-8 text-ds-danger" aria-hidden="true" />
      <p className="text-sm font-medium text-ds-danger">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="h-4 w-4 mr-1.5" aria-hidden="true" />
          Retry
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Themed export button — consistent export UX for every report page:
// - offers both Excel and PDF when the caller wants (API already supports
//   format: 'pdf' | 'excel' via reportsApi.export)
// - disabled + spinner while exporting
// - success/failure toast
// - filename always uses the report's own slug, never a literal "$"
// ---------------------------------------------------------------------------

export interface ReportExportButtonProps {
  /** Report id/slug passed to reportsApi.export, e.g. 'sales_summary'. */
  reportId: string;
  /** Params forwarded to the export endpoint (date_preset, compare, etc). */
  params?: ReportExecuteParams;
  /** Filename prefix, e.g. 'sales-report'. Suffixed with -{preset}.{ext}. */
  filenamePrefix: string;
  /** Preset/range label used in the filename, e.g. '30days' or 'this_month'. */
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
          <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" />
        ) : (
          <Download className="h-4 w-4 mr-1.5" aria-hidden="true" />
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
          <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" />
        ) : (
          <FileSpreadsheet className="h-4 w-4 mr-1.5" aria-hidden="true" />
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
