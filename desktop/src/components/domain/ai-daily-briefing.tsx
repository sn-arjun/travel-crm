'use client';

import * as React from 'react';
import { ChevronRight, Clock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';

interface PriorityItem {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  urgency: 'high' | 'medium' | 'low';
  action: string;
}

interface AIDailyBriefingProps {
  userName?: string;
  onAskAI?: () => void;
}

export function AIDailyBriefing({ userName, onAskAI }: AIDailyBriefingProps) {
  const authName = useAuthStore((s) => s.user?.name);
  const displayName = userName ?? authName?.trim().split(' ')[0] ?? 'there';
  const followUpsDue = 8;
  const leadsNeedAttention = 5;
  const paymentsOverdue = 2;

  const priorityItems: PriorityItem[] = [
    {
      id: '1',
      icon: <Clock className="h-4 w-4" />,
      title: 'Priya Patel - Follow-up Call',
      description: 'Interested in Maldives package 3 days ago',
      urgency: 'high',
      action: 'Call now',
    },
    {
      id: '2',
      icon: <AlertCircle className="h-4 w-4" />,
      title: 'Amit Kumar - Pending Quote',
      description: 'Bali proposal pending 5 days',
      urgency: 'high',
      action: 'Send quote',
    },
    {
      id: '3',
      icon: <CheckCircle2 className="h-4 w-4" />,
      title: 'Rajesh Joshi - Visa Reminder',
      description: 'Passport expires in 15 days',
      urgency: 'medium',
      action: 'Send reminder',
    },
  ];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground mb-1">Good morning,</p>
            <CardTitle className="text-2xl">
              {displayName}
              <span className="text-xl ml-1">👋</span>
            </CardTitle>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-3">
            <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">{followUpsDue}</p>
            <p className="text-xs text-blue-600 dark:text-blue-300 font-medium">Follow-ups due</p>
          </div>
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 p-3">
            <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{leadsNeedAttention}</p>
            <p className="text-xs text-amber-600 dark:text-amber-300 font-medium">Leads need attention</p>
          </div>
          <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-3">
            <p className="text-2xl font-bold text-red-700 dark:text-red-400">{paymentsOverdue}</p>
            <p className="text-xs text-red-600 dark:text-red-300 font-medium">Payments overdue</p>
          </div>
        </div>

        {/* Priority Items */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Top Priority</p>
          <div className="space-y-2">
            {priorityItems.map((item: any) => (
              <div key={item.id} className="flex items-start justify-between gap-3 rounded-lg border border-border/50 bg-muted/30 p-3 hover:bg-muted/50 transition-colors">
                <div className="flex gap-3 flex-1">
                  <div
                    className={cn(
                      'h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
                      item.urgency === 'high' && 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400',
                      item.urgency === 'medium' && 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
                      item.urgency === 'low' && 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400',
                    )}
                  >
                    {item.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{item.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                  </div>
                </div>
                <Button size="sm" variant="ghost" className="h-8 px-2 text-xs flex-shrink-0">
                  {item.action}
                  <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Ask AI Link */}
        <Button
          onClick={onAskAI}
          variant="outline"
          className="w-full justify-center text-xs font-medium text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800/50 hover:bg-blue-50 dark:hover:bg-blue-950/30"
        >
          Ask AI for more insights
          <ChevronRight className="h-3 w-3 ml-1" />
        </Button>
      </CardContent>
    </Card>
  );
}
