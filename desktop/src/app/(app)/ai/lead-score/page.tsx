'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Lock, Sparkles, Target } from 'lucide-react';
import { toast } from 'sonner';
import { RelationCombobox } from '@/components/domain';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from '@/components/ui';
import { useFeatureGate } from '@/hooks/use-feature-gate';
import { leadsApi } from '@/lib/api/leads';
import type { Lead } from '@travelcrm/shared';

function LeadScoreIndexContent() {
  const router = useRouter();
  const [leadId, setLeadId] = React.useState<string | null>(null);

  const handleScore = () => {
    if (!leadId) {
      toast.error('Please choose a lead');
      return;
    }
    router.push(`/ai/lead-score/${leadId}`);
  };

  return (
    <div className="flex flex-col gap-ds-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-ds-foreground">AI Lead Scoring</h1>
        <p className="mt-ds-1 text-ds-foreground-muted">
          Get AI-powered scoring with factor breakdown and recommendations
        </p>
      </div>

      <Card className="max-w-lg">
        <CardHeader>
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-ds-lg bg-ds-danger-subtle">
            <Target className="h-5 w-5 text-ds-danger-on-subtle" />
          </div>
          <CardTitle className="text-lg mt-ds-3">Score a lead</CardTitle>
          <CardDescription>
            Pick a lead to get a detailed AI-powered score breakdown with recommendations on how to improve
            conversion chances.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-ds-4">
          <RelationCombobox<Lead>
            value={leadId}
            onChange={(id) => setLeadId(id)}
            fetcher={async (query, page) => {
              const res = await leadsApi.list({ search: query, page, limit: 20 });
              const body = res as unknown as { data: Lead[]; pagination?: { total: number } };
              return { items: body.data ?? [], total: body.pagination?.total ?? body.data?.length ?? 0 };
            }}
            getOptionId={(l) => l.id}
            getOptionLabel={(l) => l.title}
            getOptionDescription={(l) => l.contact?.name}
            resolveSelected={async (id) => (await leadsApi.getById(id)).data}
            placeholder="Select a lead…"
            searchPlaceholder="Search leads…"
          />
          <Button onClick={handleScore} disabled={!leadId} className="w-full gap-ds-2">
            <Target className="h-4 w-4" />
            Get lead score
            <ArrowRight className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LeadScoreIndexPage() {
  const { enabled, reason, upgradeHref, loading } = useFeatureGate('ai_intelligence');

  if (loading) {
    return (
      <div className="flex flex-col gap-ds-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full max-w-lg" />
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
            {reason === 'cap_exceeded' ? "Today's AI intelligence quota is used up" : 'AI Intelligence is not on your plan'}
          </p>
          <p className="mt-ds-1 text-xs text-ds-foreground-muted">
            {reason === 'cap_exceeded'
              ? 'Your quota resets automatically tomorrow, or upgrade for a higher daily limit.'
              : 'Upgrade your plan to unlock AI-powered lead scoring.'}
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

  return <LeadScoreIndexContent />;
}
