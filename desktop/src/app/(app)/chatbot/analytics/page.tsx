'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, MessageCircle, Clock, ThumbsUp, Lock, Sparkles, UserPlus, CheckCircle2,
} from 'lucide-react';
import {
  Button, Card, CardContent, CardHeader, CardTitle, Progress, Skeleton, EmptyState,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui';
import { useApiQuery } from '@/hooks/use-api';
import { useFeatureGate } from '@/hooks/use-feature-gate';
import { chatbotApi, type ChatbotAnalytics } from '@/lib/api/chatbot';
import { PageContainer } from '@/components/layout/page-container';

function StatCard({
  label, value, icon: Icon, subtext,
}: {
  label: string; value: string | number; icon: React.ElementType; subtext?: string;
}) {
  return (
    <Card>
      <CardContent className="p-ds-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="mb-ds-1 text-xs text-ds-foreground-muted">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
            {subtext && <p className="mt-ds-1 text-xs text-ds-foreground-muted">{subtext}</p>}
          </div>
          <div className="flex size-10 items-center justify-center rounded-ds-lg bg-ds-primary-subtle text-ds-primary">
            <Icon className="size-5" aria-hidden="true" />
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

function ChatbotAnalyticsContent() {
  const router = useRouter();
  const [channel, setChannel] = React.useState('all');

  const { data: response, loading, error } = useApiQuery(
    () => chatbotApi.analytics.get({ channel: channel !== 'all' ? channel : undefined }),
    [channel],
  );

  const analytics: ChatbotAnalytics | null = response?.data ?? null;

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
    <PageContainer>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-ds-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()} aria-label="Back">
            <ArrowLeft aria-hidden="true" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Chatbot Analytics</h1>
            <p className="text-sm text-ds-foreground-muted">Performance overview of your chatbot</p>
          </div>
        </div>
        <Select value={channel} onValueChange={setChannel}>
          <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All channels</SelectItem>
            <SelectItem value="web">Web</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="facebook">Facebook</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-ds-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : error ? (
        <EmptyState title="Could not load analytics" description="Try refreshing the page." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-ds-4 lg:grid-cols-4">
            <StatCard label="Total conversations" value={totalConversations} icon={MessageCircle} />
            <StatCard label="Avg resolution time" value={formatMinutes(avgResolutionTime)} icon={Clock} />
            <StatCard label="Handoff rate" value={`${handoffRate}%`} icon={UserPlus} />
            <StatCard label="Satisfaction" value={`${customerSatisfaction}%`} icon={ThumbsUp} />
          </div>

          <div className="grid gap-ds-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-ds-2 text-base">
                  <CheckCircle2 className="size-4" aria-hidden="true" /> Resolution rate
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-ds-4">
                <div className="text-center">
                  <p className="text-4xl font-bold">{resolutionRate}%</p>
                  <p className="mt-ds-1 text-sm text-ds-foreground-muted">of conversations resolved by bot</p>
                </div>
                <Progress value={resolutionRate} className="h-3" />
                <div className="grid grid-cols-3 gap-ds-3 text-center">
                  <div>
                    <p className="text-sm font-medium">{totalConversations}</p>
                    <p className="text-xs text-ds-foreground-muted">Total</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-ds-success">{resolvedConversations}</p>
                    <p className="text-xs text-ds-foreground-muted">Resolved</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-ds-warning">{activeConversations}</p>
                    <p className="text-xs text-ds-foreground-muted">Active</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-ds-2 text-base">
                  <ThumbsUp className="size-4" aria-hidden="true" /> Customer satisfaction
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-ds-4">
                <div className="text-center">
                  <p className="text-4xl font-bold">{customerSatisfaction}%</p>
                  <p className="mt-ds-1 text-sm text-ds-foreground-muted">positive feedback rating</p>
                </div>
                <Progress value={customerSatisfaction} className="h-3" />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </PageContainer>
  );
}

export default function ChatbotAnalyticsPage() {
  const { enabled, reason, upgradeHref, loading } = useFeatureGate('ai_chatbot');

  if (loading) {
    return (
      <div className="flex flex-col gap-ds-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="flex flex-col items-center justify-center gap-ds-3 rounded-ds-lg border border-dashed border-ds-border py-ds-9 text-center">
        <div className="flex size-12 items-center justify-center rounded-ds-full bg-ds-surface-sunken">
          <Lock className="size-5 text-ds-foreground-muted" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-medium text-ds-foreground">
            {reason === 'cap_exceeded' ? "Today's chatbot quota is used up" : 'AI Chatbot is not on your plan'}
          </p>
          <p className="mt-ds-1 text-xs text-ds-foreground-muted">
            {reason === 'cap_exceeded'
              ? 'Your quota resets automatically tomorrow, or upgrade for a higher daily limit.'
              : 'Upgrade your plan to unlock chatbot analytics.'}
          </p>
        </div>
        <Button asChild size="sm" className="gap-ds-2">
          <Link href={upgradeHref}>
            <Sparkles className="size-3.5" aria-hidden="true" />
            {reason === 'cap_exceeded' ? 'Upgrade for more' : 'Upgrade to enable'}
          </Link>
        </Button>
      </div>
    );
  }

  return <ChatbotAnalyticsContent />;
}
