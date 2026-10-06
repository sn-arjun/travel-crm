'use client';

import { PageContainer } from '@/components/layout/page-container';
import { AiFeaturePageGate } from '@/components/domain/ai/ai-feature-page-gate';
import * as React from 'react';
import {
  BellRing,
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  Send,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { RelationCombobox } from '@/components/domain';
import { Button, Card, CardContent, EmptyState, Separator, Skeleton, Tag } from '@/components/ui';
import { useApiQuery } from '@/hooks/use-api';
import { aiApi, isAiUnavailableError, type AiUnavailableError, type SmartFollowup } from '@/lib/api/ai';
import { AiAvailabilityBanner } from '@/components/domain/ai/ai-availability-banner';
import { AiUnavailableNotice } from '@/components/domain/ai/ai-unavailable-notice';
import { useAiAvailability } from '@/components/domain/ai/use-ai-availability';
import { leadsApi } from '@/lib/api/leads';
import type { Lead } from '@travelcrm/shared';

const STATUS_TONE: Record<string, 'success' | 'warning' | 'neutral'> = {
  sent: 'success',
  dismissed: 'neutral',
  pending: 'warning',
};

function SmartFollowupsContent() {
  const [selectedLeadId, setSelectedLeadId] = React.useState<string | null>(null);
  const [generating, setGenerating] = React.useState(false);
  const [refetchKey, setRefetchKey] = React.useState(0);
  const [unavailable, setUnavailable] = React.useState<AiUnavailableError | null>(null);
  const availability = useAiAvailability();

  const { data, loading } = useApiQuery(() => aiApi.intelligence.listSmartFollowups(), [refetchKey]);
  const followups: SmartFollowup[] = data?.data ?? [];

  const handleGenerate = async () => {
    if (!selectedLeadId) {
      toast.error('Please choose a lead');
      return;
    }
    setGenerating(true);
    setUnavailable(null);
    try {
      await aiApi.intelligence.generateSmartFollowup(selectedLeadId);
      toast.success('Smart follow-up generated');
      setSelectedLeadId(null);
      setRefetchKey((k) => k + 1);
    } catch (err) {
      if (isAiUnavailableError(err)) {
        setUnavailable(err);
        return;
      }
      const msg = err instanceof Error ? err.message : 'Failed to generate follow-up suggestion';
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  };

  const handleSend = async (id?: string) => {
    if (!id) return;
    try {
      await aiApi.intelligence.sendSmartFollowup(id);
      toast.success('Follow-up sent');
      setRefetchKey((k) => k + 1);
    } catch {
      toast.error('Could not send follow-up');
    }
  };

  const handleDismiss = async (id?: string) => {
    if (!id) return;
    try {
      await aiApi.intelligence.dismissSmartFollowup(id);
      toast.info('Follow-up dismissed');
      setRefetchKey((k) => k + 1);
    } catch {
      toast.error('Could not dismiss follow-up');
    }
  };

  const pending = followups.filter((f) => (f.status ?? 'pending') === 'pending');
  const processed = followups.filter((f) => (f.status ?? 'pending') !== 'pending');

  return (
    <PageContainer>
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-ds-foreground">Smart Follow-ups</h1>
        <p className="mt-ds-1 text-ds-foreground-muted">
          AI-suggested follow-up actions and optimal timing for your leads
        </p>
      </div>

      <AiAvailabilityBanner note="Existing follow-up suggestions stay available." />
      {unavailable && (
        <AiUnavailableNotice
          error={unavailable}
          onRetry={() => {
            setUnavailable(null);
            availability.recheck();
          }}
        />
      )}

      <Card>
        <CardContent className="pt-ds-6">
          <div className="flex flex-col sm:flex-row gap-ds-3">
            <div className="flex-1">
              <RelationCombobox<Lead>
                value={selectedLeadId}
                onChange={(id) => setSelectedLeadId(id)}
                fetcher={async (query, page) => {
                  const res = await leadsApi.list({ search: query, page, limit: 20 });
                  const body = res as unknown as { data: Lead[]; pagination?: { total: number } };
                  return { items: body.data ?? [], total: body.pagination?.total ?? body.data?.length ?? 0 };
                }}
                getOptionId={(l) => l.id}
                getOptionLabel={(l) => l.title}
                getOptionDescription={(l) => l.contact?.name}
                resolveSelected={async (id) => (await leadsApi.getById(id)).data}
                placeholder="Select a lead to generate a follow-up…"
                searchPlaceholder="Search leads…"
              />
            </div>
            <Button onClick={handleGenerate} disabled={generating || !selectedLeadId} className="gap-ds-2">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
              Get suggestions
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex flex-col gap-ds-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : followups.length === 0 ? (
        <EmptyState
          icon={<BellRing className="size-10 text-ds-foreground-subtle" aria-hidden="true" />}
          title="No follow-up suggestions yet"
          description="Select a lead above to get AI-powered follow-up suggestions."
        />
      ) : (
        <>
          {pending.length > 0 && (
            <div className="flex flex-col gap-ds-3">
              <h2 className="text-lg font-semibold text-ds-foreground">Pending actions ({pending.length})</h2>
              {pending.map((entry) => (
                <Card key={entry.id}>
                  <CardContent className="pt-ds-6">
                    <div className="flex items-start gap-ds-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-ds-full bg-ds-primary-subtle shrink-0">
                        <BellRing className="h-5 w-5 text-ds-primary-on-subtle" />
                      </div>
                      <div className="flex-1 flex flex-col gap-ds-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-ds-foreground">{entry.leadName ?? `Lead ${entry.leadId}`}</p>
                            <p className="text-xs text-ds-foreground-muted">ID: {entry.leadId}</p>
                          </div>
                          {entry.suggestedTiming && (
                            <div className="flex items-center gap-ds-2">
                              <Calendar className="h-4 w-4 text-ds-foreground-muted" />
                              <span className="text-sm font-medium text-ds-foreground">
                                {new Date(entry.suggestedTiming).toLocaleDateString('en-IN')}
                              </span>
                            </div>
                          )}
                        </div>

                        {entry.suggestedChannel && (
                          <Tag tone="info">Channel: {entry.suggestedChannel}</Tag>
                        )}
                        {typeof entry.confidence === 'number' && (
                          <Tag tone="neutral">Confidence: {Math.round(entry.confidence * 100)}%</Tag>
                        )}

                        {entry.messageContent && (
                          <p className="text-sm text-ds-foreground-muted rounded-ds-lg border border-ds-border p-ds-3">
                            {entry.messageContent}
                          </p>
                        )}

                        {(entry.timingReasoning || entry.channelReasoning) && (
                          <div className="flex flex-col gap-ds-2">
                            <p className="text-xs text-ds-foreground-muted font-medium uppercase tracking-wider">
                              Why this suggestion
                            </p>
                            <ul className="flex flex-col gap-ds-1">
                              {[entry.channelReasoning, entry.timingReasoning].filter(Boolean).map((reason, idx) => (
                                <li
                                  key={idx}
                                  className="flex items-start gap-ds-2 text-sm rounded-ds-lg border border-ds-border p-ds-2"
                                >
                                  <Clock className="h-4 w-4 text-ds-foreground-muted shrink-0 mt-0.5" />
                                  {reason}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <Separator />

                        <div className="flex gap-ds-2">
                          <Button size="sm" className="gap-ds-1" onClick={() => handleSend(entry.id)}>
                            <Send className="h-3.5 w-3.5" />
                            Send
                          </Button>
                          <Button size="sm" variant="outline" className="gap-ds-1" onClick={() => handleDismiss(entry.id)}>
                            <X className="h-3.5 w-3.5" />
                            Dismiss
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {processed.length > 0 && (
            <div className="flex flex-col gap-ds-3">
              <h2 className="text-lg font-semibold text-ds-foreground-muted">Processed ({processed.length})</h2>
              {processed.map((entry) => (
                <Card key={entry.id} className="opacity-60">
                  <CardContent className="pt-ds-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-ds-3">
                        {entry.status === 'sent' ? (
                          <CheckCircle2 className="h-5 w-5 text-ds-success" />
                        ) : (
                          <X className="h-5 w-5 text-ds-foreground-muted" />
                        )}
                        <div>
                          <p className="font-medium text-ds-foreground">{entry.leadName ?? `Lead ${entry.leadId}`}</p>
                          <p className="text-xs text-ds-foreground-muted">
                            {entry.status === 'sent' ? 'Sent' : 'Dismissed'}
                          </p>
                        </div>
                      </div>
                      <Tag tone={STATUS_TONE[entry.status ?? 'pending']}>{entry.status}</Tag>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </PageContainer>
  );
}

export default function SmartFollowupsPage() {
  return (
    <AiFeaturePageGate feature="ai_intelligence" title="Smart Follow-ups" featureName="AI Intelligence" benefit="AI-powered smart follow-ups">
      <SmartFollowupsContent />
    </AiFeaturePageGate>
  );
}
