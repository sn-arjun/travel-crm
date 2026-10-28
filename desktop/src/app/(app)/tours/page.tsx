'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarPlus, Compass, Eye, MapPin, Pencil, Plus } from 'lucide-react';

import { ListPage } from '@/components/domain';
import type { ListFilter } from '@/components/domain';
import { Button, Input, Tag } from '@/components/ui';
import type { DataTableColumn } from '@/components/ui';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { usePermission } from '@/hooks/use-permission';
import { toursApi, type Tour } from '@/lib/api/tours';
import { formatDisplayDate } from '@/lib/dates';
import { useT } from '@/lib/i18n';
import { SimpleSelect } from '../departures/_components/simple-select';

type StatusFilter = 'active' | 'archived' | 'all';

export default function ToursPage() {
  const t = useT();
  const router = useRouter();
  const canCreate = usePermission('departures', 'create');
  const canEdit = usePermission('departures', 'edit');
  const [status, setStatus] = React.useState<StatusFilter>('active');
  const [destination, setDestination] = React.useState('');
  const debouncedDestination = useDebouncedValue(destination, 300);
  const pager = React.useMemo(() => toursApi.pager(), []);

  const statusLabel = (s: StatusFilter) => (s === 'active' ? t('tours.status.active') : s === 'archived' ? t('tours.status.archived') : t('tours.filters.allStatuses'));

  const activeFilters = React.useMemo<ListFilter[]>(() => {
    const f: ListFilter[] = [];
    if (status !== 'active') f.push({ id: 'status', label: t('tours.filters.status'), value: statusLabel(status) });
    if (debouncedDestination.trim()) f.push({ id: 'destination', label: t('tours.filters.destination'), value: debouncedDestination.trim() });
    return f;
    // statusLabel only depends on t
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, debouncedDestination, t]);

  const columns: DataTableColumn<Tour>[] = [
    { key: 'code', header: t('tours.columns.code'), hideable: false, cell: (x) => <span className="font-mono text-sm">{x.code}</span> },
    { key: 'title', header: t('tours.columns.title'), minWidth: 'min-w-56', hideable: false, cell: (x) => <span className="font-medium">{x.title}</span> },
    {
      key: 'destination',
      header: t('tours.columns.destination'),
      cell: (x) =>
        x.destination ? (
          <span className="flex items-center gap-ds-1 text-sm">
            <MapPin className="size-3.5 text-ds-foreground-subtle" aria-hidden="true" />
            {x.destination}
          </span>
        ) : (
          <span className="text-ds-foreground-subtle">-</span>
        ),
    },
    { key: 'duration', header: t('tours.columns.duration'), align: 'right', cell: (x) => (x.durationDays ? t('tours.days', { count: x.durationDays }) : '-') },
    { key: 'capacity', header: t('tours.columns.capacity'), align: 'right', cell: (x) => (x.defaultCapacity ? String(x.defaultCapacity) : '-') },
    {
      key: 'status',
      header: t('tours.columns.status'),
      cell: (x) => <Tag tone={x.status === 'active' ? 'success' : 'neutral'}>{statusLabel(x.status)}</Tag>,
    },
    { key: 'updated', header: t('tours.columns.updated'), cell: (x) => formatDisplayDate(x.updatedAt) },
  ];

  return (
    <ListPage<Tour>
      title={t('tours.title')}
      description={t('tours.description')}
      getRowId={(x) => x.id}
      refreshKey={`${status}|${debouncedDestination}`}
      columns={columns}
      searchPlaceholder={t('tours.searchPlaceholder')}
      fetcher={({ page, limit, search }) =>
        pager.fetch(page, limit, { q: search || undefined, status, destination: debouncedDestination.trim() || undefined })
      }
      filters={activeFilters}
      onRemoveFilter={(id) => {
        if (id === 'status') setStatus('active');
        if (id === 'destination') setDestination('');
      }}
      onClearFilters={() => {
        setStatus('active');
        setDestination('');
      }}
      headerActions={
        <>
          <SimpleSelect
            value={status}
            onChange={(v) => setStatus((v as StatusFilter) ?? 'active')}
            aria-label={t('tours.filters.status')}
            className="h-9 w-40"
            options={[
              { value: 'active', label: t('tours.status.active') },
              { value: 'archived', label: t('tours.status.archived') },
              { value: 'all', label: t('tours.filters.allStatuses') },
            ]}
          />
          <Input
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            aria-label={t('tours.filters.destination')}
            placeholder={t('tours.filters.destinationPlaceholder')}
            className="h-9 w-44"
          />
        </>
      }
      primaryAction={
        canCreate ? (
          <Button size="sm" onClick={() => router.push('/tours/new')} data-testid="new-tour">
            <Plus aria-hidden="true" /> {t('tours.new')}
          </Button>
        ) : undefined
      }
      rowActions={(x) => (
        <>
          <Button variant="ghost" size="icon-sm" aria-label={t('tours.actions.open')} onClick={(e) => { e.stopPropagation(); router.push(`/tours/${x.id}`); }}>
            <Eye aria-hidden="true" />
          </Button>
          {canEdit && (
            <Button variant="ghost" size="icon-sm" aria-label={t('tours.actions.edit')} onClick={(e) => { e.stopPropagation(); router.push(`/tours/${x.id}/edit`); }}>
              <Pencil aria-hidden="true" />
            </Button>
          )}
          {canCreate && x.status === 'active' && (
            <Button variant="ghost" size="icon-sm" aria-label={t('tours.actions.addDepartures')} onClick={(e) => { e.stopPropagation(); router.push(`/departures/new?tourId=${x.id}`); }}>
              <CalendarPlus aria-hidden="true" />
            </Button>
          )}
        </>
      )}
      detailTitle={(x) => x.title}
      renderDetail={(x) => (
        <div className="space-y-ds-4 pt-ds-2" data-testid="tour-drawer">
          <div className="flex flex-wrap items-center gap-ds-2">
            <span className="font-mono text-sm">{x.code}</span>
            <Tag tone={x.status === 'active' ? 'success' : 'neutral'}>{statusLabel(x.status)}</Tag>
          </div>
          {x.description && <p className="text-sm text-ds-foreground-muted">{x.description}</p>}
          <dl className="grid grid-cols-2 gap-ds-3 text-sm">
            <div>
              <dt className="text-ds-foreground-muted">{t('tours.columns.destination')}</dt>
              <dd>{x.destination || '-'}</dd>
            </div>
            <div>
              <dt className="text-ds-foreground-muted">{t('tours.columns.duration')}</dt>
              <dd>{x.durationDays ? t('tours.days', { count: x.durationDays }) : '-'}</dd>
            </div>
            <div>
              <dt className="text-ds-foreground-muted">{t('tours.columns.capacity')}</dt>
              <dd>{x.defaultCapacity ?? '-'}</dd>
            </div>
            <div>
              <dt className="text-ds-foreground-muted">{t('tours.columns.updated')}</dt>
              <dd>{formatDisplayDate(x.updatedAt)}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-ds-2">
            <Link href={`/tours/${x.id}`}>
              <Button size="sm">{t('tours.actions.open')}</Button>
            </Link>
            {canCreate && x.status === 'active' && (
              <Link href={`/departures/new?tourId=${x.id}`}>
                <Button size="sm" variant="outline">{t('tours.actions.addDepartures')}</Button>
              </Link>
            )}
          </div>
        </div>
      )}
      emptyTitle={status === 'active' && !debouncedDestination ? t('tours.empty.title') : t('tours.empty.filteredTitle')}
      emptyDescription={status === 'active' && !debouncedDestination ? t('tours.empty.description') : t('tours.empty.filteredDescription')}
      emptyIcon={<Compass className="size-10" aria-hidden="true" />}
      emptyAction={
        canCreate ? (
          <Button size="sm" onClick={() => router.push('/tours/new')}>
            <Plus aria-hidden="true" /> {t('tours.empty.create')}
          </Button>
        ) : undefined
      }
    />
  );
}
