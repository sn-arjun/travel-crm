'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  TrendingUp, BarChart3, Users, Target, DollarSign,
  Zap, Truck, AlertCircle, ArrowUpRight, Activity,
  PieChart, FileText, Loader, Search, Star, StarOff, History, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useApiQuery } from '@/hooks/use-api';
import { reportsApi } from '@/lib/api/reports';

interface ReportCard {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  href: string;
  reportCount: number;
  color: string;
}

const reportCards: ReportCard[] = [
  {
    id: 'sales',
    title: 'Sales Reports',
    description: 'Revenue trends, sales by destination, team performance, deal size, forecasts, and win/loss analysis',
    icon: TrendingUp,
    href: '/reports/sales',
    reportCount: 10,
    color: 'from-blue-500 to-cyan-500',
  },
  {
    id: 'leads',
    title: 'Lead Reports',
    description: 'Pipeline summary, lead ageing, source analysis, velocity metrics, and funnel breakdown',
    icon: Target,
    href: '/reports/leads',
    reportCount: 10,
    color: 'from-purple-500 to-pink-500',
  },
  {
    id: 'financial',
    title: 'Financial Reports',
    description: 'Revenue overview, collections, P&L analysis, tax reporting, outstanding, and ageing',
    icon: DollarSign,
    href: '/reports/financial',
    reportCount: 10,
    color: 'from-green-500 to-emerald-500',
  },
  {
    id: 'team',
    title: 'Team Reports',
    description: 'Salesperson performance, targets, commissions, and team metrics',
    icon: Users,
    href: '/reports/team',
    reportCount: 5,
    color: 'from-orange-500 to-red-500',
  },
  {
    id: 'customer',
    title: 'Customer Reports',
    description: 'Customer segmentation, lifetime value, satisfaction, and retention analysis',
    icon: Activity,
    href: '/reports/customer',
    reportCount: 4,
    color: 'from-indigo-500 to-blue-500',
  },
  {
    id: 'visa',
    title: 'Visa Reports',
    description: 'Visa applications, status tracking, and processing metrics',
    icon: FileText,
    href: '/reports/visa',
    reportCount: 3,
    color: 'from-amber-500 to-yellow-500',
  },
  {
    id: 'supplier',
    title: 'Supplier Reports',
    description: 'Supplier performance, payments, ratings, and contract management',
    icon: Truck,
    href: '/reports/supplier',
    reportCount: 3,
    color: 'from-teal-500 to-green-500',
  },
  {
    id: 'fleet',
    title: 'Fleet Reports',
    description: 'Vehicle utilization, driver performance, maintenance costs, and trip logs',
    icon: Zap,
    href: '/reports/fleet',
    reportCount: 4,
    color: 'from-slate-500 to-gray-500',
  },
  {
    id: 'marketing',
    title: 'Marketing Reports',
    description: 'Campaign performance, ROI, lead sources, and customer acquisition cost',
    icon: PieChart,
    href: '/reports/marketing',
    reportCount: 3,
    color: 'from-rose-500 to-pink-500',
  },
];

function formatKPIValue(amount: number): string {
  if (amount >= 10000000) return `\u20B9${(amount / 10000000).toFixed(1)}Cr`;
  if (amount >= 100000) return `\u20B9${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `\u20B9${(amount / 1000).toFixed(0)}K`;
  return `\u20B9${amount}`;
}

function KPICard({ label, value, icon: Icon, loading }: { label: string; value: string; icon: React.ElementType; loading: boolean }) {
  if (loading) {
    return (
      <Card className="flex-1 min-w-[200px]">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-8 w-32" />
            </div>
            <Skeleton className="h-9 w-9 rounded-lg" />
          </div>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="flex-1 min-w-[200px]">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground mb-1">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
          <div className="bg-primary/10 p-2 rounded-lg">
            <Icon className="h-5 w-5 text-primary" />
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
  report: ReportCard;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
  onCardClick: (report: ReportCard) => void;
}) {
  const Icon = report.icon;
  return (
    <div className="relative" onClick={() => onCardClick(report)}>
      <button
        className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-white/80 dark:bg-black/50 hover:bg-white dark:hover:bg-black transition-colors"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggleFavorite(report.id);
        }}
        title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      >
        {isFavorite ? (
          <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />
        ) : (
          <StarOff className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>
      <Link href={report.href}>
        <Card className="h-full hover:shadow-lg transition-all duration-300 cursor-pointer group overflow-hidden">
          <CardContent className="p-0">
            <div className={cn(
              'h-24 bg-gradient-to-r flex items-center justify-center group-hover:scale-110 transition-transform duration-300',
              `bg-gradient-to-r ${report.color}`,
            )}>
              <Icon className="h-10 w-10 text-white/80" />
            </div>
            <div className="p-4">
              <h3 className="font-semibold text-sm mb-1 group-hover:text-primary transition-colors">{report.title}</h3>
              <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{report.description}</p>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">{report.reportCount} reports</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
              >
                View Reports
                <ArrowUpRight className="h-3.5 w-3.5 ml-1.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}

const FAVORITES_KEY = 'report_hub_favorites';
const RECENTLY_VIEWED_KEY = 'report_hub_recently_viewed';

export default function ReportsHub() {
  const [search, setSearch] = React.useState('');
  const [favorites, setFavorites] = React.useState<string[]>([]);
  const [recentlyViewed, setRecentlyViewed] = React.useState<string[]>([]);
  const [showRecent, setShowRecent] = React.useState(false);

  React.useEffect(() => {
    try {
      const fav = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
      setFavorites(Array.isArray(fav) ? fav : []);
    } catch {
      setFavorites([]);
    }
    try {
      const rec = JSON.parse(localStorage.getItem(RECENTLY_VIEWED_KEY) || '[]');
      setRecentlyViewed(Array.isArray(rec) ? rec : []);
    } catch {
      setRecentlyViewed([]);
    }
  }, []);

  const { data: dashboardResp, loading: dashLoading, error: dashError } = useApiQuery(
    () => reportsApi.getDashboard(),
    [],
  );

  const dashData = (dashboardResp as any)?.data;

  const totalRevenue = dashData?.financial?.revenueThisMonth ?? 0;
  const outstanding = dashData?.financial?.outstanding ?? 0;
  const pipeline = (dashData?.pipeline ?? []) as Array<{ status: string; count: number; total_value: number }>;
  const activeLeads = pipeline
    .filter((p) => !['won', 'lost'].includes(p.status))
    .reduce((sum, p) => sum + p.count, 0);
  const totalLeads = pipeline.reduce((sum, p) => sum + p.count, 0);
  const wonLeads = pipeline.find((p) => p.status === 'won')?.count ?? 0;
  const conversionRate = totalLeads > 0 ? ((wonLeads / totalLeads) * 100).toFixed(1) : '0';

  const handleToggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id];
      try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const handleCardClick = (report: ReportCard) => {
    setRecentlyViewed((prev) => {
      const filtered = prev.filter((id) => id !== report.id);
      const next = [report.id, ...filtered].slice(0, 5);
      try { localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const filteredCards = reportCards.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return r.title.toLowerCase().includes(q) || r.description.toLowerCase().includes(q);
  });

  const favoriteCards = reportCards.filter((r) => favorites.includes(r.id));
  const recentCards = recentlyViewed
    .map((id) => reportCards.find((r) => r.id === id))
    .filter(Boolean) as ReportCard[];

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Reports Hub</h1>
          <p className="text-sm text-muted-foreground">Comprehensive business analytics and insights</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowRecent((v) => !v)}
          >
            <History className="h-4 w-4 mr-1.5" />
            Recently Viewed
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-auto space-y-8">
        {/* KPI Cards */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">Key Metrics</h2>
          {dashError ? (
            <div className="flex items-center gap-3 p-4 rounded-lg border border-destructive/50 bg-destructive/5 text-destructive">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <p className="text-sm">Failed to load dashboard metrics. Please try again.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <KPICard
                label="Revenue This Month"
                value={dashLoading ? '-' : formatKPIValue(totalRevenue)}
                icon={DollarSign}
                loading={dashLoading}
              />
              <KPICard
                label="Active Leads"
                value={dashLoading ? '-' : String(activeLeads)}
                icon={Target}
                loading={dashLoading}
              />
              <KPICard
                label="Conversion Rate"
                value={dashLoading ? '-' : `${conversionRate}%`}
                icon={TrendingUp}
                loading={dashLoading}
              />
              <KPICard
                label="Outstanding"
                value={dashLoading ? '-' : formatKPIValue(outstanding)}
                icon={BarChart3}
                loading={dashLoading}
              />
            </div>
          )}
        </div>

        {/* Recently Viewed */}
        {showRecent && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <History className="h-4 w-4" />
                Recently Viewed
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setShowRecent(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            {recentCards.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recently viewed reports.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
          </div>
        )}

        {/* Favorites */}
        {favoriteCards.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4 flex items-center gap-2">
              <Star className="h-4 w-4 text-yellow-500" />
              Favorites
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {favoriteCards.map((report) => (
                <ReportCardComponent
                  key={report.id}
                  report={report}
                  isFavorite={true}
                  onToggleFavorite={handleToggleFavorite}
                  onCardClick={handleCardClick}
                />
              ))}
            </div>
          </div>
        )}

        {/* Search + All Report Cards */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Available Reports</h2>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search reports..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
              {search && (
                <button
                  className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                  onClick={() => setSearch('')}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          {filteredCards.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Search className="h-8 w-8 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No reports match &quot;{search}&quot;</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
        </div>
      </div>
    </div>
  );
}
