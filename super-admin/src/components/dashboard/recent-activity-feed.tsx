'use client';

import { Badge } from '@/components/ui/badge';
import { LogIn, AlertTriangle, Building2, Clock } from 'lucide-react';

interface Activity {
  id: string;
  action: string;
  description: string;
  timestamp: string;
  actor: string;
}

interface RecentActivityFeedProps {
  activities: Activity[];
}

const actionConfig: Record<string, { icon: typeof LogIn; color: string }> = {
  login: { icon: LogIn, color: 'text-green-600' },
  failed_login: { icon: AlertTriangle, color: 'text-red-600' },
  tenant_created: { icon: Building2, color: 'text-blue-600' },
};

function formatTimestamp(ts: string): string {
  if (!ts) return '';
  const date = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function RecentActivityFeed({ activities }: RecentActivityFeedProps) {
  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Clock className="h-8 w-8 mb-2" />
        <p className="text-sm">No recent activity</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {activities.map((activity) => {
        const config = actionConfig[activity.action] || { icon: Clock, color: 'text-muted-foreground' };
        const Icon = config.icon;

        return (
          <div key={activity.id} className="flex items-start gap-3 py-2 border-b last:border-0">
            <div className={`mt-0.5 ${config.color}`}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">{activity.description}</p>
              <p className="text-xs text-muted-foreground">{formatTimestamp(activity.timestamp)}</p>
            </div>
            <Badge variant="outline" className="text-xs shrink-0">
              {activity.action.replace('_', ' ')}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}
