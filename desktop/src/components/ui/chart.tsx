'use client';

import * as React from 'react';
import {
  Area,
  AreaChart as RcAreaChart,
  Bar,
  BarChart as RcBarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart as RcLineChart,
  Pie,
  PieChart as RcPieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useThemeTokens } from '@/design-system/tokens/use-theme-tokens';
import { cn } from '@/lib/utils';

import { EmptyState } from './empty-state';
import { Skeleton } from './skeleton';

export interface ChartSeries {
  /** Key into each datum. */
  dataKey: string;
  /** Legend/tooltip label. Defaults to `dataKey`. */
  label?: string;
  /** Override the themed series color. Prefer leaving unset. */
  color?: string;
}

export interface BaseChartProps<T> {
  data: T[];
  series: ChartSeries[];
  /** Key into each datum for the category (X) axis. */
  categoryKey: string;
  height?: number;
  loading?: boolean;
  emptyMessage?: string;
  /** Formats Y-axis ticks and tooltip values. */
  valueFormatter?: (value: number) => string;
  showLegend?: boolean;
  showGrid?: boolean;
  className?: string;
}

/** Shared axis/grid/tooltip styling derived from the active theme. */
function useChartTheme() {
  const { colors, chart } = useThemeTokens();

  return React.useMemo(
    () => ({
      palette: chart,
      axis: {
        stroke: colors['border-strong'],
        tick: { fill: colors['foreground-muted'], fontSize: 11 },
        tickLine: false,
        axisLine: false,
      },
      grid: { stroke: colors.border, strokeDasharray: '3 3', vertical: false },
      tooltip: {
        contentStyle: {
          background: colors['surface-raised'],
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: colors.border,
          borderRadius: 10,
          fontSize: 12,
          color: colors.foreground,
          boxShadow: 'var(--shadow-ds-3)',
        },
        labelStyle: { color: colors['foreground-muted'], marginBottom: 4 },
        cursor: { fill: colors['surface-sunken'] },
      },
      legend: { wrapperStyle: { fontSize: 12, color: colors['foreground-muted'] } },
    }),
    [colors, chart],
  );
}

function ChartFrame({
  loading,
  isEmpty,
  emptyMessage,
  height,
  className,
  children,
}: {
  loading?: boolean;
  isEmpty: boolean;
  emptyMessage: string;
  height: number;
  className?: string;
  children: React.ReactElement;
}) {
  if (loading) {
    return <Skeleton className={cn('w-full', className)} style={{ height }} />;
  }
  if (isEmpty) {
    return (
      <div className={cn('flex items-center justify-center', className)} style={{ height }}>
        <EmptyState title={emptyMessage} />
      </div>
    );
  }
  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

export function LineChart<T>({
  data,
  series,
  categoryKey,
  height = 280,
  loading,
  emptyMessage = 'No data to display',
  valueFormatter,
  showLegend = true,
  showGrid = true,
  className,
}: BaseChartProps<T>) {
  const t = useChartTheme();
  return (
    <ChartFrame
      loading={loading}
      isEmpty={data.length === 0}
      emptyMessage={emptyMessage}
      height={height}
      className={className}
    >
      <RcLineChart data={data as object[]}>
        {showGrid && <CartesianGrid {...t.grid} />}
        <XAxis dataKey={categoryKey} {...t.axis} />
        <YAxis {...t.axis} tickFormatter={valueFormatter} />
        <Tooltip {...t.tooltip} formatter={valueFormatter as never} />
        {showLegend && <Legend {...t.legend} />}
        {series.map((s, i) => (
          <Line
            key={s.dataKey}
            type="monotone"
            dataKey={s.dataKey}
            name={s.label ?? s.dataKey}
            stroke={s.color ?? t.palette[i % t.palette.length]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </RcLineChart>
    </ChartFrame>
  );
}

export function AreaChart<T>({
  data,
  series,
  categoryKey,
  height = 280,
  loading,
  emptyMessage = 'No data to display',
  valueFormatter,
  showLegend = true,
  showGrid = true,
  className,
}: BaseChartProps<T>) {
  const t = useChartTheme();
  return (
    <ChartFrame
      loading={loading}
      isEmpty={data.length === 0}
      emptyMessage={emptyMessage}
      height={height}
      className={className}
    >
      <RcAreaChart data={data as object[]}>
        {showGrid && <CartesianGrid {...t.grid} />}
        <XAxis dataKey={categoryKey} {...t.axis} />
        <YAxis {...t.axis} tickFormatter={valueFormatter} />
        <Tooltip {...t.tooltip} formatter={valueFormatter as never} />
        {showLegend && <Legend {...t.legend} />}
        {series.map((s, i) => {
          const c = s.color ?? t.palette[i % t.palette.length];
          return (
            <Area
              key={s.dataKey}
              type="monotone"
              dataKey={s.dataKey}
              name={s.label ?? s.dataKey}
              stroke={c}
              fill={c}
              fillOpacity={0.15}
              strokeWidth={2}
            />
          );
        })}
      </RcAreaChart>
    </ChartFrame>
  );
}

export function BarChart<T>({
  data,
  series,
  categoryKey,
  height = 280,
  loading,
  emptyMessage = 'No data to display',
  valueFormatter,
  showLegend = true,
  showGrid = true,
  className,
  stacked = false,
}: BaseChartProps<T> & { stacked?: boolean }) {
  const t = useChartTheme();
  return (
    <ChartFrame
      loading={loading}
      isEmpty={data.length === 0}
      emptyMessage={emptyMessage}
      height={height}
      className={className}
    >
      <RcBarChart data={data as object[]}>
        {showGrid && <CartesianGrid {...t.grid} />}
        <XAxis dataKey={categoryKey} {...t.axis} />
        <YAxis {...t.axis} tickFormatter={valueFormatter} />
        <Tooltip {...t.tooltip} formatter={valueFormatter as never} />
        {showLegend && <Legend {...t.legend} />}
        {series.map((s, i) => (
          <Bar
            key={s.dataKey}
            dataKey={s.dataKey}
            name={s.label ?? s.dataKey}
            fill={s.color ?? t.palette[i % t.palette.length]}
            stackId={stacked ? 'stack' : undefined}
            radius={stacked ? undefined : [4, 4, 0, 0]}
          />
        ))}
      </RcBarChart>
    </ChartFrame>
  );
}

export interface PieChartProps<T> {
  data: T[];
  /** Key holding the numeric value. */
  dataKey: string;
  /** Key holding the slice label. */
  nameKey: string;
  height?: number;
  loading?: boolean;
  emptyMessage?: string;
  valueFormatter?: (value: number) => string;
  showLegend?: boolean;
  /** Renders a donut instead of a full pie. */
  donut?: boolean;
  className?: string;
}

export function PieChart<T>({
  data,
  dataKey,
  nameKey,
  height = 280,
  loading,
  emptyMessage = 'No data to display',
  valueFormatter,
  showLegend = true,
  donut = false,
  className,
}: PieChartProps<T>) {
  const t = useChartTheme();
  return (
    <ChartFrame
      loading={loading}
      isEmpty={data.length === 0}
      emptyMessage={emptyMessage}
      height={height}
      className={className}
    >
      <RcPieChart>
        <Tooltip {...t.tooltip} formatter={valueFormatter as never} />
        {showLegend && <Legend {...t.legend} />}
        <Pie
          data={data as object[]}
          dataKey={dataKey}
          nameKey={nameKey}
          innerRadius={donut ? '55%' : 0}
          outerRadius="80%"
          paddingAngle={donut ? 2 : 0}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={t.palette[i % t.palette.length]} />
          ))}
        </Pie>
      </RcPieChart>
    </ChartFrame>
  );
}
