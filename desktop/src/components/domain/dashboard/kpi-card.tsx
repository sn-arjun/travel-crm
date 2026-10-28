'use client';

import * as React from 'react';
import Link from 'next/link';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface KpiTrend {
  /** Signed change versus the previous period. */
  value: number;
  unit: '%' | 'pts';
}

interface KpiCardProps {
  title: string;
  /** `null` renders an em dash (data unavailable for this role or period). */
  value: string | null;
  icon: React.ElementType;
  /** Only pass a trend when the previous-period value is known. */
  trend?: KpiTrend | null;
  hint?: string;
  href?: string;
}

function TrendChip({ trend }: { trend: KpiTrend }) {
  const up = trend.value > 0;
  const flat = trend.value === 0;
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  return (
    <div
      className={cn(
        'flex items-center gap-ds-1 text-xs font-medium',
        flat ? 'text-ds-foreground-muted' : up ? 'text-ds-success' : 'text-ds-danger',
      )}
      title="Compared with the previous period"
    >
      <Icon className="size-3" aria-hidden="true" />
      <span>
        {up ? '+' : ''}
        {trend.value}
        {trend.unit === '%' ? '%' : ' pts'}
      </span>
    </div>
  );
}

export function KpiCard({ title, value, icon: Icon, trend, hint, href }: KpiCardProps) {
  const body = (
    <Card className="h-full gap-0 py-0 transition-shadow hover:shadow-md">
      <CardContent className="p-ds-5">
        <div className="mb-ds-3 flex items-start justify-between">
          <div className="flex size-10 items-center justify-center rounded-ds-lg bg-ds-primary-subtle">
            <Icon className="size-5 text-ds-primary-on-subtle" aria-hidden="true" />
          </div>
          {trend ? <TrendChip trend={trend} /> : null}
        </div>
        <p className="text-2xl font-bold tracking-tight text-ds-foreground">{value ?? '—'}</p>
        <p className="mt-ds-1 text-xs text-ds-foreground-muted">{title}</p>
        {hint ? <p className="mt-ds-1 text-xs text-ds-foreground-subtle">{hint}</p> : null}
      </CardContent>
    </Card>
  );
  if (!href) return body;
  return (
    <Link href={href} className="block rounded-ds-lg focus-visible:ring-2 focus-visible:ring-ds-ring focus-visible:outline-none">
      {body}
    </Link>
  );
}
