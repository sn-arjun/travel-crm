'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials, formatRelativeTime } from '@/lib/utils';
import {
  Phone,
  Mail,
  MessageSquare,
  FileText,
  Calendar,
  DollarSign,
  UserPlus,
  CheckCircle2,
  AlertCircle,
  Edit3,
} from 'lucide-react';

const activityIcons: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
  call: { icon: Phone, color: 'bg-ds-info-subtle text-ds-info' },
  email: { icon: Mail, color: 'bg-ds-primary-subtle text-ds-primary' },
  message: { icon: MessageSquare, color: 'bg-ds-success-subtle text-ds-success' },
  document: { icon: FileText, color: 'bg-ds-warning-subtle text-ds-warning' },
  meeting: { icon: Calendar, color: 'bg-ds-info-subtle text-ds-info' },
  payment: { icon: DollarSign, color: 'bg-ds-success-subtle text-ds-success' },
  contact: { icon: UserPlus, color: 'bg-ds-primary-subtle text-ds-primary' },
  completed: { icon: CheckCircle2, color: 'bg-ds-success-subtle text-ds-success' },
  alert: { icon: AlertCircle, color: 'bg-ds-danger-subtle text-ds-danger' },
  edit: { icon: Edit3, color: 'bg-ds-surface-sunken text-ds-foreground-muted' },
};

interface ActivityItem {
  id: string;
  type: keyof typeof activityIcons;
  title: string;
  description?: string;
  timestamp: string | Date;
  user?: {
    name: string;
    avatar?: string;
  };
}

interface ActivityTimelineProps {
  activities: ActivityItem[];
  className?: string;
  maxItems?: number;
}

export function ActivityTimeline({ activities, className, maxItems }: ActivityTimelineProps) {
  const items = maxItems ? activities.slice(0, maxItems) : activities;

  return (
    <div role="list" className={cn('relative', className)}>
      {/* Timeline line */}
      <div aria-hidden="true" className="absolute start-5 top-2 bottom-2 w-px bg-border" />

      <div className="space-y-4">
        {items.map((activity, idx) => {
          const config = activityIcons[activity.type] ?? activityIcons.edit!;
          const Icon = config!.icon;

          return (
            <div
              key={activity.id}
              role="listitem"
              className="relative flex gap-3 animate-slide-up"
              style={{ animationDelay: `${idx * 60}ms`, animationFillMode: 'both' }}
            >
              {/* Icon */}
              <div className={cn('relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full', config!.color)}>
                <Icon className="h-5 w-5" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-foreground">
                    <span className="font-medium">{activity.title}</span>
                  </p>
                  <time className="shrink-0 text-xs text-muted-foreground">
                    {formatRelativeTime(activity.timestamp)}
                  </time>
                </div>
                {activity.description && (
                  <p className="mt-0.5 text-ds-sm text-muted-foreground line-clamp-2">
                    {activity.description}
                  </p>
                )}
                {activity.user && (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <Avatar size="sm">
                      {activity.user.avatar && <AvatarImage src={activity.user.avatar} />}
                      <AvatarFallback className="text-ds-xs">{getInitials(activity.user.name)}</AvatarFallback>
                    </Avatar>
                    <span className="text-xs text-muted-foreground">{activity.user.name}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
