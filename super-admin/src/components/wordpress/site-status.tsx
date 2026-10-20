import { Badge } from '@/components/ui/badge';

export interface WpSite {
  id: string;
  tenantId: string;
  companyName: string | null;
  subdomain: string;
  status: string;
  siteUrl: string | null;
  adminUrl: string | null;
  attempts: number;
  lastError: string | null;
  provisionedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface WpHistoryEntry {
  id: string;
  event: string;
  status: string | null;
  detail: string | null;
  at: string;
}

const STATUS_STYLE: Record<string, string> = {
  queued: 'bg-gray-100 text-gray-800 dark:bg-gray-700/30 dark:text-gray-300',
  provisioning: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  suspended: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
};

const STATUS_LABEL: Record<string, string> = {
  queued: 'Queued',
  provisioning: 'Building',
  active: 'Live',
  failed: 'Failed',
  suspended: 'Suspended',
};

export function SiteStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={STATUS_STYLE[status] ?? ''}>
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

/** A site that is still moving: the pages poll while any site is in one of these states. */
export function isInFlight(status: string): boolean {
  return status === 'queued' || status === 'provisioning';
}

export function formatTime(value: string | null): string {
  return value ? new Date(value).toLocaleString() : '—';
}

export function HistoryList({ history }: { history: WpHistoryEntry[] }) {
  if (history.length === 0) return <p className="text-sm text-muted-foreground">No history yet.</p>;
  return (
    <ul className="space-y-1 text-sm">
      {history.map((h) => (
        <li key={h.id} className="flex flex-wrap gap-x-3">
          <span className="text-muted-foreground tabular-nums">{formatTime(h.at)}</span>
          <span className="font-medium">{h.event.replace(/_/g, ' ')}</span>
          {h.detail && <span className="text-muted-foreground break-all">{h.detail}</span>}
        </li>
      ))}
    </ul>
  );
}
