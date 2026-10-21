'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  TrendingUp, BarChart3, Users, Target, DollarSign,
  Truck, AlertCircle, ArrowUpRight, Activity,
  PieChart, FileText, Search, Star, StarOff, History, X, Car, RefreshCw, Ticket,
} from 'lucide-react';

import { PageContainer } from '@/components/layout/page-container';
import { Button, Card, CardContent, Input, PageHeader, Skeleton } from '@/components/ui';
import { formatReportCurrency } from '@/components/domain/reports/shared';
import { useApiQuery } from '@/hooks/use-api';
import { unwrapEntity } from '@/lib/api/envelope';
import { reportsApi, type DashboardResponse } from '@/lib/api/reports';
import { useGroupTours } from '@/hooks/use-group-tours';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface ReportCategory {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  href: string;
  reportCount: number;
}

const baseReportCards: ReportCategory[] = [
  {
    id: 'sales',
    title: 'Sales Reports',
    description: 'Revenue by salesperson, destination, trip type and source, deal size, forecast and win/loss',
    icon: TrendingUp,
    href: '/reports/sales',
    reportCount: 8,
  },
  {
    id: 'leads',
    title: 'Lead Reports',
    description: 'Pipeline summary, lead ageing, sources, response time, follow-ups, hot leads and velocity',
    icon: Target,
    href: '/reports/leads',
    reportCount: 8,
  },
  {
    id: 'financial',
    title: 'Financial Reports',
    description: 'Revenue, collections, receivables ageing, profit by lead, tax, payment methods and daily cash',
    icon: DollarSign,
    href: '/reports/financial',
    reportCount: 8,
  },
  {
    id: 'team',
    title: 'Team Reports',
    description: 'Leaderboard, individual performance, response time, activity and task completion',
    icon: Users,
    href: '/reports/team',
    reportCount: 5,
  },
  {
    id: 'customer',
    title: 'Customer Reports',
    description: 'Repeat customers, lifetime value, upcoming birthdays and dormant customers',
    icon: Activity,
    href: '/reports/customer',
    reportCount: 4,
  },
  {
    id: 'visa',
    title: 'Visa Reports',
    description: 'Application status by country, pending documents and approval rates',
    icon: FileText,
    href: '/reports/visa',
    reportCount: 3,
  },
  {
    id: 'supplier',
    title: 'Supplier Reports',
    description: 'Supplier usage, payment summary and outstanding balances',
    icon: Truck,
    href: '/reports/supplier',
    reportCount: 3,
  },
  {
    id: 'fleet',
    title: 'Fleet Reports',
    description: 'Vehicle utilization, driver performance, availability and trip cost analysis',
    icon: Car,
    href: '/reports/fleet',
    reportCount: 4,
  },
  {
    id: 'marketing',
    title: 'Marketing Reports',
    description: 'Campaign performance, lead source ROI and bulk message delivery',
    icon: PieChart,
    href: '/reports/marketing',
    reportCount: 3,
  },
];

function KPICard({ label, value, icon: Icon, loading }: { label: string; value: string; icon: React.ElementType; loading: boolean }) {
  return (
    <Card className="min-w-0">
      <CardContent className="p-ds-4">
        <div className="flex items-start justify-between gap-ds-3">
          <div className="min-w-0 flex-1">
            {loading ? (
              <>
                <Skeleton className="mb-ds-2 h-4 w-24" />
                <Skeleton className="h-8 w-32" />
              </>
            ) : (
              <>
                <p className="mb-1 text-sm text-ds-foreground-muted">{label}</p>
                <p className="text-2xl font-semibold tabular-nums text-ds-foreground">{value}</p>
              </>
            )}
          </div>
          <div className="rounded-ds-md bg-ds-primary-subtle p-ds-2 text-ds-primary-on-subtle">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ReportCardComponent({
  report,
  isFavorite,
  onToggleFavorite,
  onCardClick,
}: {
  report: ReportCategory;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
  onCardClick: (report: ReportCategory) => void;
}) {
  const Icon = report.icon;
  return (
    <div className="relative" onClick={() => onCardClick(report)}>
      <button
        type="button"
        className="absolute right-ds-2 top-ds-2 z-10 rounded-full p-ds-2 text-ds-foreground-muted transition-colors hover:bg-ds-surface-sunken hover:text-ds-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-ring"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggleFavorite(report.id);
        }}
        title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        aria-label={isFavorite ? `Remove ${report.title} from favorites` : `Add ${report.title} to favorites`}
        aria-pressed={isFavorite}
      >
        {isFavorite ? (
          <Star className="h-4 w-4 fill-ds-warning text-ds-warning" aria-hidden="true" />
        ) : (
          <StarOff className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
      <Link href={report.href} className="block h-full rounded-ds-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-ring">
        <Card className="group h-full cursor-pointer transition-shadow hover:shadow-ds-2">
          <CardContent className="flex h-full flex-col p-ds-4">
            <div className="mb-ds-3 flex size-11 items-center justify-center rounded-ds-md bg-ds-primary-subtle text-ds-primary-on-subtle">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </div>
            <h3 className="mb-1 text-sm font-semibold text-ds-foreground transition-colors group-hover:text-ds-primary">{report.title}</h3>
            <p className="mb-ds-3 line-clamp-3 flex-1 text-xs text-ds-foreground-muted">{report.description}</p>
            <div className="flex items-center justify-between">
              <span className="rounded-ds-sm bg-ds-surface-sunken px-ds-2 py-1 text-xs text-ds-foreground-muted">{report.reportCount} reports</span>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-ds-primary">
                View
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}

const FAVORITES_KEY = 'report_hub_favorites';
const RECENTLY_VIEWED_KEY = 'report_hub_recently_viewed';

function readIds(key: string): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function writeIds(key: string, ids: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // Storage unavailable (private mode); favourites just will not persist.
  }
}

export default function ReportsHub() {
  const t = useT();
  const groupTours = useGroupTours();
  const [search, setSearch] = React.useState('');
  const [favorites, setFavorites] = React.useState<string[]>([]);
  const [recentlyViewed, setRecentlyViewed] = React.useState<string[]>([]);
  const [showRecent, setShowRecent] = React.useState(false);

  React.useEffect(() => {
    setFavorites(readIds(FAVORITES_KEY));
    setRecentlyViewed(readIds(RECENTLY_VIEWED_KEY));
  }, []);

  const { data: dashboardResp, loading: dashLoading, error: dashError, refetch } = useApiQuery(
    () => reportsApi.getDashboard(),
    [],
  );

  const dash = dashboardResp ? unwrapEntity<Partial<DashboardResponse>>(dashboardResp) : undefined;
  const pipeline = Array.isArray(dash?.pipeline) ? dash.pipeline : [];
  const totalRevenue = dash?.financial?.revenueThisMonth ?? 0;
  const outstanding = dash?.financial?.outstanding ?? 0;
  const activeLeads = pipeline
    .filter((p) => !['won', 'lost'].includes(p.status))
    .reduce((sum, p) => sum + p.count, 0);
  const totalLeads = pipeline.reduce((sum, p) => sum + p.count, 0);
  const wonLeads = pipeline.find((p) => p.status === 'won')?.count ?? 0;
  const conversionRate = totalLeads > 0 ? ((wonLeads / totalLeads) * 100).toFixed(1) : '0';

  const handleToggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id];
      writeIds(FAVORITES_KEY, next);
      return next;
    });
  };

  const handleCardClick = (report: ReportCategory) => {
    setRecentlyViewed((prev) => {
      const next = [report.id, ...prev.filter((id) => id !== report.id)].slice(0, 5);
      writeIds(RECENTLY_VIEWED_KEY, next);
      return next;
    });
  };

  // The Tours group shows only when the plan has group departures and the agency switched them on.
  const reportCards: ReportCategory[] = React.useMemo(
    () => [
      ...baseReportCards,
      ...(groupTours.enabled
        ? [{ id: 'tours', title: t('reports.hub.toursTitle'), description: t('reports.hub.toursDescription'), icon: Ticket, href: '/reports/tours', reportCount: 3 }]
        : []),
    ],
    [groupTours.enabled, t],
  );

  const filteredCards = reportCards.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return r.title.toLowerCase().includes(q) || r.description.toLowerCase().includes(q);
  });

  const favoriteCards = reportCards.filter((r) => favorites.includes(r.id));
  const recentCards = recentlyViewed
    .map((id) => reportCards.find((r) => r.id === id))
    .filter((r): r is ReportCategory => Boolean(r));

  const sectionTitle = 'flex items-center gap-ds-2 text-sm font-semibold uppercase tracking-wide text-ds-foreground-muted';
  const cardGrid = 'grid grid-cols-1 gap-ds-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4';

  return (
    <PageContainer className="gap-ds-6">
      <PageHeader
        title="Reports Hub"
        description="Comprehensive business analytics and insights"
        actions={
          <Button variant="outline" size="sm" onClick={() => setShowRecent((v) => !v)}>
            <History className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Recently Viewed
          </Button>
        }
      />

      <section>
        <h2 className={cn(sectionTitle, 'mb-ds-4')}>Key Metrics</h2>
        {dashError ? (
          <div role="alert" className="flex items-center gap-ds-3 rounded-ds-lg border border-ds-danger bg-ds-danger-subtle p-ds-4 text-ds-danger-on-subtle">
            <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
            <p className="flex-1 text-sm">Failed to load dashboard metrics. Please try again.</p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Retry
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-ds-4 md:grid-cols-2 xl:grid-cols-4">
            <KPICard label="Revenue This Month" value={formatReportCurrency(totalRevenue)} icon={DollarSign} loading={dashLoading} />
            <KPICard label="Active Leads" value={String(activeLeads)} icon={Target} loading={dashLoading} />
            <KPICard label="Conversion Rate" value={`${conversionRate}%`} icon={TrendingUp} loading={dashLoading} />
            <KPICard label="Outstanding" value={formatReportCurrency(outstanding)} icon={BarChart3} loading={dashLoading} />
          </div>
        )}
      </section>

      {showRecent && (
        <section>
          <div className="mb-ds-4 flex items-center justify-between">
            <h2 className={sectionTitle}>
              <History className="h-4 w-4" aria-hidden="true" />
              Recently Viewed
            </h2>
            <Button variant="ghost" size="icon" aria-label="Close recently viewed" onClick={() => setShowRecent(false)}>
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          {recentCards.length === 0 ? (
            <p className="text-sm text-ds-foreground-muted">No recently viewed reports.</p>
          ) : (
            <div className={cardGrid}>
              {recentCards.map((report) => (
                <ReportCardComponent
                  key={report.id}
                  report={report}
                  isFavorite={favorites.includes(report.id)}
                  onToggleFavorite={handleToggleFavorite}
                  onCardClick={handleCardClick}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {favoriteCards.length > 0 && (
        <section>
          <h2 className={cn(sectionTitle, 'mb-ds-4')}>
            <Star className="h-4 w-4 text-ds-warning" aria-hidden="true" />
            Favorites
          </h2>
          <div className={cardGrid}>
            {favoriteCards.map((report) => (
              <ReportCardComponent
                key={report.id}
                report={report}
                isFavorite
                onToggleFavorite={handleToggleFavorite}
                onCardClick={handleCardClick}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-ds-4 flex flex-wrap items-center justify-between gap-ds-3">
          <h2 className={sectionTitle}>Available Reports</h2>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-ds-foreground-muted" aria-hidden="true" />
            <Input
              placeholder="Search reports..."
              aria-label="Search reports"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-8 text-sm"
            />
            {search && (
              <button
                type="button"
                aria-label="Clear search"
                className="absolute right-2 top-2.5 text-ds-foreground-muted hover:text-ds-foreground"
                onClick={() => setSearch('')}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        {filteredCards.length === 0 ? (
          <div className="py-12 text-center text-ds-foreground-muted">
            <Search className="mx-auto mb-ds-3 h-8 w-8 opacity-40" aria-hidden="true" />
            <p className="text-sm">No reports match &quot;{search}&quot;</p>
          </div>
        ) : (
          <div className={cardGrid}>
            {filteredCards.map((report) => (
              <ReportCardComponent
                key={report.id}
                report={report}
                isFavorite={favorites.includes(report.id)}
                onToggleFavorite={handleToggleFavorite}
                onCardClick={handleCardClick}
              />
            ))}
          </div>
        )}
      </section>
    </PageContainer>
  );
}
