'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, MessageCircle, Clock, Users, ThumbsUp,
  Loader, AlertCircle, BarChart3, TrendingUp, UserPlus,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useApiQuery } from '@/hooks/use-api';
import { chatbotApi, type ChatbotAnalytics } from '@/lib/api/chatbot';

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  subtext,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  subtext?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
            {subtext && <p className="text-xs text-muted-foreground mt-1">{subtext}</p>}
          </div>
          <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center', color)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function formatMinutes(minutes: number): string {
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hrs}h ${mins}m`;
}

export default function ChatbotAnalyticsPage() {
  const router = useRouter();
  const [period, setPeriod] = React.useState('this_month');
  const [channel, setChannel] = React.useState('all');

  const { data: response, loading, error } = useApiQuery<any>(
    () => chatbotApi.analytics.get({
      channel: channel !== 'all' ? channel : undefined,
    }),
    [channel],
  );

  const analytics: ChatbotAnalytics | null = response?.data ?? null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalConversations = analytics?.totalConversations ?? 0;
  const activeConversations = analytics?.activeConversations ?? 0;
  const resolvedConversations = analytics?.resolvedConversations ?? 0;
  const avgResolutionTime = analytics?.avgResolutionTime ?? 0;
  const customerSatisfaction = analytics?.customerSatisfaction ?? 0;
  const handoffRate = analytics?.handoffRate ?? 0;
  const resolutionRate = totalConversations > 0
    ? Math.round((resolvedConversations / totalConversations) * 100)
    : 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              Chatbot Analytics
            </h1>
            <p className="text-sm text-muted-foreground">Performance overview of your chatbot</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger className="w-28 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="web">Web</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="facebook">Facebook</SelectItem>
            </SelectContent>
          </Select>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-36 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="this_week">This Week</SelectItem>
              <SelectItem value="this_month">This Month</SelectItem>
              <SelectItem value="last_month">Last Month</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {error && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <p className="text-sm text-amber-600">Could not load analytics data</p>
            </div>
          )}

          {/* Top Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total Conversations"
              value={totalConversations}
              icon={MessageCircle}
              color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
            />
            <StatCard
              label="Avg Resolution Time"
              value={formatMinutes(avgResolutionTime)}
              icon={Clock}
              color="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
            />
            <StatCard
              label="Handoff Rate"
              value={`${handoffRate}%`}
              icon={UserPlus}
              color="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
            />
            <StatCard
              label="Satisfaction"
              value={`${customerSatisfaction}%`}
              icon={ThumbsUp}
              color="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
            />
          </div>

          {/* Detailed Metrics */}
          <div className="grid grid-cols-2 gap-6">
            {/* Resolution Rate */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" /> Resolution Rate
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center">
                  <p className="text-4xl font-bold">{resolutionRate}%</p>
                  <p className="text-sm text-muted-foreground mt-1">of conversations resolved by bot</p>
                </div>
                <Progress value={resolutionRate} className="h-3" />
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-sm font-medium">{totalConversations}</p>
                    <p className="text-[10px] text-muted-foreground">Total</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-green-600">{resolvedConversations}</p>
                    <p className="text-[10px] text-muted-foreground">Resolved</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-amber-600">{activeConversations}</p>
                    <p className="text-[10px] text-muted-foreground">Active</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Customer Satisfaction */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ThumbsUp className="h-4 w-4" /> Customer Satisfaction
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center">
                  <p className="text-4xl font-bold">{customerSatisfaction}%</p>
                  <p className="text-sm text-muted-foreground mt-1">positive feedback rating</p>
                </div>
                <Progress value={customerSatisfaction} className="h-3" />
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Excellent (5 stars)</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full" style={{ width: '60%' }} />
                      </div>
                      <span>60%</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Good (4 stars)</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: '25%' }} />
                      </div>
                      <span>25%</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Average (3 stars)</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500 rounded-full" style={{ width: '10%' }} />
                      </div>
                      <span>10%</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Poor (1-2 stars)</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-red-500 rounded-full" style={{ width: '5%' }} />
                      </div>
                      <span>5%</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Handoff Analysis & Popular Topics */}
          <div className="grid grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <UserPlus className="h-4 w-4" /> Handoff Analysis
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-center mb-4">
                  <p className="text-3xl font-bold">{handoffRate}%</p>
                  <p className="text-xs text-muted-foreground">of conversations required human agent</p>
                </div>
                <div className="space-y-2">
                  {[
                    { reason: 'Complex booking query', pct: 35 },
                    { reason: 'Payment issue', pct: 25 },
                    { reason: 'Complaint', pct: 20 },
                    { reason: 'Custom itinerary request', pct: 15 },
                    { reason: 'Other', pct: 5 },
                  ].map((item) => (
                    <div key={item.reason} className="flex items-center justify-between">
                      <span className="text-xs">{item.reason}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-purple-500 rounded-full" style={{ width: `${item.pct}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground w-8 text-right">{item.pct}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" /> Popular Topics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { topic: 'Package pricing', count: 156 },
                    { topic: 'Booking status', count: 132 },
                    { topic: 'Visa requirements', count: 98 },
                    { topic: 'Cancellation policy', count: 87 },
                    { topic: 'Payment options', count: 76 },
                    { topic: 'Custom itinerary', count: 64 },
                    { topic: 'Travel insurance', count: 52 },
                    { topic: 'Group discounts', count: 41 },
                  ].map((item, i) => (
                    <div key={item.topic} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                        <span className="text-sm">{item.topic}</span>
                      </div>
                      <Badge variant="secondary" className="text-xs">{item.count}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
