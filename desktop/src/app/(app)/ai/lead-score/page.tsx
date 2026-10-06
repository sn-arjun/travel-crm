'use client';

import { PageContainer } from '@/components/layout/page-container';
import { AiFeaturePageGate } from '@/components/domain/ai/ai-feature-page-gate';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Target } from 'lucide-react';
import { toast } from 'sonner';
import { RelationCombobox } from '@/components/domain';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';
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
    <PageContainer>
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
    </PageContainer>
  );
}

export default function LeadScoreIndexPage() {
  return (
    <AiFeaturePageGate feature="ai_intelligence" title="Lead Scoring" featureName="AI Intelligence" benefit="AI-powered lead scoring">
      <LeadScoreIndexContent />
    </AiFeaturePageGate>
  );
}
