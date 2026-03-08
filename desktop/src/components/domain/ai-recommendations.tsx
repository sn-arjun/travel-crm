'use client';

import * as React from 'react';
import { X, CheckCircle2, Zap, AlertCircle, TrendingUp, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Recommendation {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  priority: 'high' | 'medium' | 'low';
  action: string;
}

interface AIRecommendationsProps {
  onDismiss?: (id: string) => void;
  onAction?: (id: string, action: string) => void;
}

export function AIRecommendations({ onDismiss, onAction }: AIRecommendationsProps) {
  const [dismissedIds, setDismissedIds] = React.useState<Set<string>>(new Set());

  const recommendations: Recommendation[] = [
    {
      id: '1',
      title: 'Follow up with Priya Patel',
      description: 'Interested in Maldives package - contacted 3 days ago',
      icon: <Clock className="h-5 w-5" />,
      priority: 'high',
      action: 'Call now',
    },
    {
      id: '2',
      title: 'Send quote to Amit Kumar',
      description: 'Proposal pending for 5 days - risk of losing lead',
      icon: <AlertCircle className="h-5 w-5" />,
      priority: 'high',
      action: 'Send quote',
    },
    {
      id: '3',
      title: "Rajesh Joshi's visa expires soon",
      description: 'Passport expires in 15 days - send reminder',
      icon: <Zap className="h-5 w-5" />,
      priority: 'medium',
      action: 'Send reminder',
    },
    {
      id: '4',
      title: 'Monthly revenue is 12% above target',
      description: 'Consider upselling premium packages to active customers',
      icon: <TrendingUp className="h-5 w-5" />,
      priority: 'medium',
      action: 'View opportunities',
    },
    {
      id: '5',
      title: '3 leads haven\'t been contacted',
      description: 'No interaction in 7+ days - risk going cold',
      icon: <CheckCircle2 className="h-5 w-5" />,
      priority: 'low',
      action: 'Reach out',
    },
  ];

  const handleDismiss = (id: string) => {
    setDismissedIds((prev) => new Set(prev).add(id));
    onDismiss?.(id);
  };

  const handleAction = (id: string, action: string) => {
    onAction?.(id, action);
  };

  const visibleRecommendations = recommendations.filter((rec: any) => !dismissedIds.has(rec.id));

  const getPriorityColor = (priority: Recommendation['priority']) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400 border-red-200 dark:border-red-800/50';
      case 'medium':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border-amber-200 dark:border-amber-800/50';
      case 'low':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 border-blue-200 dark:border-blue-800/50';
    }
  };

  const getPriorityIconColor = (priority: Recommendation['priority']) => {
    switch (priority) {
      case 'high':
        return 'text-red-600 dark:text-red-400';
      case 'medium':
        return 'text-amber-600 dark:text-amber-400';
      case 'low':
        return 'text-blue-600 dark:text-blue-400';
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">AI Recommendations</CardTitle>
        <p className="text-xs text-muted-foreground mt-1">{visibleRecommendations.length} actionable items</p>
      </CardHeader>

      <CardContent className="space-y-3">
        {visibleRecommendations.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground">All caught up!</p>
            <p className="text-xs text-muted-foreground mt-1">Great job managing your leads</p>
          </div>
        ) : (
          <>
            {visibleRecommendations.map((rec: any) => (
              <div
                key={rec.id}
                className={cn(
                  'rounded-lg border p-3 space-y-2 transition-all duration-200',
                  'bg-card hover:shadow-sm',
                  'hover:border-border/80',
                )}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 flex-1">
                    <div className={cn('flex-shrink-0 mt-0.5', getPriorityIconColor(rec.priority))}>{rec.icon}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">{rec.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{rec.description}</p>
                    </div>
                  </div>
                  <Button
                    onClick={() => handleDismiss(rec.id)}
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 flex-shrink-0"
                  >
                    <X className="h-4 w-4" />
                    <span className="sr-only">Dismiss</span>
                  </Button>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-2 border-t">
                  <Badge variant="outline" className={cn('text-xs', getPriorityColor(rec.priority))}>
                    {rec.priority.charAt(0).toUpperCase() + rec.priority.slice(1)} Priority
                  </Badge>
                  <Button
                    onClick={() => handleAction(rec.id, rec.action)}
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-primary hover:bg-primary/10"
                  >
                    {rec.action}
                  </Button>
                </div>
              </div>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}
