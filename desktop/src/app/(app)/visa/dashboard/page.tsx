'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Calendar, Globe } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { Tag } from '@/components/ui/tag';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Stat } from '@/components/ui/stat';
import { useApiQuery } from '@/hooks/use-api';
import { visaApi, type VisaRecord } from '@/lib/api/visa';
import { cn } from '@/lib/utils';

const STATUS_TONE: Record<string, 'neutral' | 'success' | 'danger' | 'warning' | 'info'> = {
  not_started: 'neutral',
  documents_collecting: 'info',
  applied: 'info',
  processing: 'warning',
  approved: 'success',
  rejected: 'danger',
};

export default function VisaDashboardPage() {
  const router = useRouter();

  const { data: response, loading } = useApiQuery(() => visaApi.list({ page: 1, limit: 200 }), []);

  const records: VisaRecord[] = React.useMemo(() => {
    const data = response?.data as unknown;
    if (Array.isArray(data)) return data as VisaRecord[];
    return ((data as { data?: VisaRecord[] })?.data ?? []) as VisaRecord[];
  }, [response]);

  const stats = React.useMemo(() => {
    const applied = records.filter((r) => r.status === 'applied').length;
    const processing = records.filter((r) => r.status === 'processing').length;
    const approved = records.filter((r) => r.status === 'approved').length;
    const rejected = records.filter((r) => r.status === 'rejected').length;
    return { applied, processing, approved, rejected, total: records.length };
  }, [records]);

  const upcomingDeadlines = React.useMemo(() => {
    const now = new Date();
    return records
      .filter((r) => r.expiryDate && new Date(r.expiryDate) > now && r.status !== 'rejected')
      .sort((a, b) => new Date(a.expiryDate!).getTime() - new Date(b.expiryDate!).getTime())
      .slice(0, 10);
  }, [records]);

  const byCountry = React.useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    records.forEach((r) => {
      map[r.countryName] ??= {};
      map[r.countryName]![r.status] = (map[r.countryName]![r.status] ?? 0) + 1;
    });
    return Object.entries(map)
      .map(([country, statuses]) => ({
        country,
        statuses,
        total: Object.values(statuses).reduce((a, b) => a + b, 0),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [records]);

  if (loading) {
    return (
      <div className="flex flex-col gap-ds-4 p-ds-4">
        <Skeleton className="h-9 w-64" />
        <div className="grid grid-cols-4 gap-ds-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-ds-lg" />)}
        </div>
        <Skeleton className="h-64 rounded-ds-lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-ds-4">
      <PageHeader
        title="Visa Dashboard"
        description={`${stats.total} total applications`}
        back={
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()} aria-label="Go back">
            <ArrowLeft aria-hidden="true" />
          </Button>
        }
        actions={<Button onClick={() => router.push('/visa')}>View All Applications</Button>}
      />

      <div className="grid grid-cols-2 gap-ds-4 sm:grid-cols-4">
        <Stat label="Applied" value={stats.applied} />
        <Stat label="Processing" value={stats.processing} />
        <Stat label="Approved" value={stats.approved} />
        <Stat label="Rejected" value={stats.rejected} />
      </div>

      <div className="grid gap-ds-4 lg:grid-cols-2">
        <SectionCard title="Upcoming Deadlines" flush>
          {upcomingDeadlines.length === 0 ? (
            <EmptyState title="No upcoming deadlines" />
          ) : (
            <ul className="divide-y divide-ds-border">
              {upcomingDeadlines.map((r) => {
                const daysUntil = Math.ceil((new Date(r.expiryDate!).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => router.push(`/visa/${r.id}`)}
                      className="flex w-full items-center justify-between gap-ds-3 px-ds-4 py-ds-3 text-left transition-colors hover:bg-ds-surface-sunken"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{r.travellerName}</p>
                        <p className="text-xs text-ds-foreground-muted">{r.countryName}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-ds-2">
                        <span
                          className={cn(
                            'text-xs',
                            daysUntil <= 7 ? 'font-semibold text-ds-danger' : daysUntil <= 30 ? 'text-ds-warning' : 'text-ds-foreground-muted',
                          )}
                        >
                          {new Date(r.expiryDate!).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} ({daysUntil}d)
                        </span>
                        <Tag tone={STATUS_TONE[r.status] ?? 'info'} size="sm">{r.status}</Tag>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Applications by Country">
          {byCountry.length === 0 ? (
            <EmptyState icon={<Globe />} title="No data available" />
          ) : (
            <div className="flex flex-col gap-ds-3">
              {byCountry.map(({ country, statuses, total }) => (
                <div key={country} className="flex items-center gap-ds-3">
                  <span className="w-28 shrink-0 truncate text-sm font-medium">{country}</span>
                  <div className="flex h-6 flex-1 items-center gap-ds-1">
                    {(['approved', 'processing', 'applied', 'rejected'] as const).map((s) =>
                      statuses[s] ? (
                        <div
                          key={s}
                          className={cn(
                            'h-full rounded-ds-sm',
                            s === 'approved' && 'bg-ds-success',
                            s === 'processing' && 'bg-ds-warning',
                            s === 'applied' && 'bg-ds-info',
                            s === 'rejected' && 'bg-ds-danger',
                          )}
                          style={{ width: `${(statuses[s]! / total) * 100}%` }}
                          title={`${s}: ${statuses[s]}`}
                        />
                      ) : null,
                    )}
                  </div>
                  <span className="w-8 shrink-0 text-right text-sm text-ds-foreground-muted">{total}</span>
                </div>
              ))}
              <div className="mt-ds-2 flex items-center gap-ds-4 border-t border-ds-border pt-ds-3">
                <span className="flex items-center gap-ds-1 text-xs"><span className="size-2 rounded-ds-sm bg-ds-success" />Approved</span>
                <span className="flex items-center gap-ds-1 text-xs"><span className="size-2 rounded-ds-sm bg-ds-warning" />Processing</span>
                <span className="flex items-center gap-ds-1 text-xs"><span className="size-2 rounded-ds-sm bg-ds-info" />Applied</span>
                <span className="flex items-center gap-ds-1 text-xs"><span className="size-2 rounded-ds-sm bg-ds-danger" />Rejected</span>
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
