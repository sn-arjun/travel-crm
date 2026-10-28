'use client';

import * as React from 'react';
import {
  Sparkles, Shield, Zap, Brain, Eye, Search, MessageSquare,
  Map, Calculator, Phone, Truck, Users as UsersIcon, BarChart3,
  CreditCard, Stamp, Megaphone, TrendingUp, CalendarClock,
  Award, RefreshCw, Cloud,
} from 'lucide-react';

import { useAiSettings, invalidateAiSettingsCache } from '@/hooks/use-ai-feature';
import { useFeatureGate } from '@/hooks/use-feature-gate';
import { aiApi, type UsageData } from '@/lib/api/ai';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tag } from '@/components/ui/tag';
import { cn } from '@/lib/utils';
import { PageContainer } from '@/components/layout/page-container';

const AI_FEATURE_META: Record<string, { label: string; description: string; icon: React.ComponentType<{ className?: string }> }> = {
  ai_copilot: { label: 'AI Co-Pilot', description: 'Contextual AI assistance across all modules', icon: Sparkles },
  ai_call_summary: { label: 'Call Summary', description: 'Auto-summarize call recordings and extract action items', icon: Phone },
  ai_lead_scoring: { label: 'Lead Scoring', description: 'AI-powered lead prioritization (0-100 score)', icon: TrendingUp },
  ai_message_compose: { label: 'Message Composer', description: 'AI-drafted WhatsApp, email, and SMS messages', icon: MessageSquare },
  ai_itinerary_generate: { label: 'Itinerary Generator', description: 'Generate day-by-day itineraries from natural language', icon: Map },
  ai_cost_estimation: { label: 'Cost Estimation', description: 'Auto-estimate trip costs from itinerary data', icon: Calculator },
  ai_ocr: { label: 'Document OCR', description: 'Extract data from passports, visas, and invoices', icon: Eye },
  ai_search: { label: 'AI Search', description: 'Natural language CRM search ("Show me leads from Goa")', icon: Search },
  ai_dialer_cards: { label: 'Dialer AI Cards', description: 'Real-time AI context cards during calls', icon: Phone },
  ai_vehicle_recommend: { label: 'Vehicle Recommend', description: 'AI vehicle selection based on trip requirements', icon: Truck },
  ai_driver_recommend: { label: 'Driver Recommend', description: 'AI driver assignment based on route and availability', icon: UsersIcon },
  ai_expense_analysis: { label: 'Expense Analysis', description: 'AI-powered expense categorization and analysis', icon: BarChart3 },
  ai_margin_insights: { label: 'Margin Insights', description: 'Real-time margin analysis and optimization tips', icon: TrendingUp },
  ai_payment_prediction: { label: 'Payment Prediction', description: 'Predict payment likelihood and timing', icon: CreditCard },
  ai_visa_intelligence: { label: 'Visa Intelligence', description: 'Visa approval prediction and document recommendations', icon: Stamp },
  ai_campaign_content: { label: 'Campaign Content', description: 'AI-generated marketing content and copy', icon: Megaphone },
  ai_campaign_optimize: { label: 'Campaign Optimize', description: 'A/B test suggestions and send-time optimization', icon: Megaphone },
  ai_follow_up_suggest: { label: 'Follow-up Suggest', description: 'Smart follow-up timing and channel recommendations', icon: CalendarClock },
  ai_churn_prediction: { label: 'Churn Prediction', description: 'Identify at-risk customers before they churn', icon: Shield },
  ai_daily_briefing: { label: 'Daily Briefing', description: 'AI-generated daily business summary', icon: Brain },
  ai_supplier_negotiate: { label: 'Supplier Negotiate', description: 'AI negotiation tips based on supplier history', icon: Award },
  ai_coaching: { label: 'AI Coaching', description: 'Real-time sales coaching during calls', icon: Zap },
};

function FeatureCard({
  featureKey,
  enabled,
  canToggle,
  saving,
  onToggle,
}: {
  featureKey: string;
  enabled: boolean;
  canToggle: boolean;
  saving: boolean;
  onToggle: (key: string, enabled: boolean) => void;
}) {
  const meta = AI_FEATURE_META[featureKey];
  if (!meta) return null;
  const Icon = meta.icon;

  return (
    <div
      className={cn(
        'flex items-start gap-ds-3 rounded-ds-lg border border-ds-border bg-ds-surface p-ds-4 shadow-ds-1',
        !enabled && 'opacity-60',
      )}
    >
      <div
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-ds-md',
          enabled ? 'bg-ds-primary-subtle text-ds-primary-on-subtle' : 'bg-ds-surface-sunken text-ds-foreground-subtle',
        )}
      >
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-ds-2">
          <p className="truncate text-sm font-medium text-ds-foreground">{meta.label}</p>
          <Switch
            checked={enabled}
            disabled={!canToggle || saving}
            onCheckedChange={(v) => onToggle(featureKey, v)}
            aria-label={`Toggle ${meta.label}`}
          />
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs text-ds-foreground-muted">{meta.description}</p>
      </div>
    </div>
  );
}

function AiSettingsPageContent() {
  const { enabled: gateEnabled, reason, loading: gateLoading } = useFeatureGate('ai_assistant');
  const { features, usageCaps, provider, plan, loading, error, refetch } = useAiSettings();
  const [saving, setSaving] = React.useState<string | null>(null);
  const [usageData, setUsageData] = React.useState<UsageData | null>(null);
  const [loadingUsage, setLoadingUsage] = React.useState(false);

  React.useEffect(() => {
    setLoadingUsage(true);
    aiApi.settings
      .getUsage()
      .then((res) => {
        if (res?.data) setUsageData(res.data);
      })
      .catch(() => {})
      .finally(() => setLoadingUsage(false));
  }, []);

  const handleToggleFeature = async (featureKey: string, enabled: boolean) => {
    setSaving(featureKey);
    try {
      await aiApi.settings.updateFeatures({ [featureKey]: enabled });
      invalidateAiSettingsCache();
      refetch();
    } catch {
      // Refetch will surface the reverted state.
    } finally {
      setSaving(null);
    }
  };

  const proFeatures = features.filter((f) => f.tier === 'pro');
  const enterpriseFeatures = features.filter((f) => f.tier === 'enterprise');

  if (gateLoading || loading) {
    return (
      <div className="space-y-ds-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-ds-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (!gateEnabled) {
    return (
      <div className="space-y-ds-6">
        <PageHeader title="AI Settings" description="Manage AI features, usage quotas, and provider configuration." />
        <SectionCard>
          <div className="flex flex-col items-center gap-ds-3 py-ds-8 text-center">
            <Sparkles className="size-8 text-ds-foreground-subtle" />
            <p className="text-sm text-ds-foreground-muted">
              AI Assistant is not available on your current plan.
            </p>
            <Button disabled>
              {reason === 'cap_exceeded' ? 'Limit reached' : 'Upgrade to enable'}
            </Button>
          </div>
        </SectionCard>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <SectionCard>
          <div className="py-ds-8 text-center">
            <p className="text-sm text-ds-danger">{error}</p>
            <Button variant="outline" size="sm" className="mt-ds-4" onClick={refetch}>
              Try Again
            </Button>
          </div>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="space-y-ds-8">
      <PageHeader
        title="AI Settings"
        description={`Manage AI features, usage quotas, and provider configuration for your plan.`}
        status={<Badge variant="outline">{plan}</Badge>}
        actions={
          <Button variant="outline" size="sm" onClick={refetch} className="gap-ds-2">
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
        }
      />

      <SectionCard title="AI Provider" description="Active AI model provider">
        <div className="flex flex-wrap items-center gap-ds-6">
          <div className="flex items-center gap-ds-2">
            <Cloud className="size-5 text-ds-warning" />
            <div>
              <p className="text-sm font-medium text-ds-foreground">Cloudflare Workers AI</p>
              <p className="text-xs text-ds-foreground-muted">
                {provider?.cloudflare ? 'Active' : 'Unavailable'} — Free tier included
              </p>
            </div>
            {provider?.defaultProvider === 'cloudflare' && (
              <Tag tone="primary" size="sm">Default</Tag>
            )}
          </div>
          <div className="flex items-center gap-ds-2">
            <Sparkles className="size-5 text-ds-primary" />
            <div>
              <p className="text-sm font-medium text-ds-foreground">Claude API</p>
              <p className="text-xs text-ds-foreground-muted">
                {provider?.anthropic ? 'Connected' : 'No API key set'}
              </p>
            </div>
            {provider?.defaultProvider === 'anthropic' && (
              <Tag tone="primary" size="sm">Default</Tag>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Usage Quotas" description="Current usage against your plan limits">
        {Object.keys(usageCaps).length === 0 ? (
          <p className="text-sm text-ds-foreground-muted">No usage caps configured for your plan.</p>
        ) : (
          <div className="grid gap-ds-4 md:grid-cols-2">
            {Object.entries(usageCaps).map(([key, cap]) => (
              <div key={key} className="space-y-ds-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium capitalize text-ds-foreground">{key.replace(/_/g, ' ')}</span>
                  <span className="text-ds-foreground-muted">
                    {cap.used ?? 0} / {cap.limit ?? 0}
                  </span>
                </div>
                <Progress
                  value={cap.percentUsed ?? 0}
                  className={cn(
                    'h-2',
                    (cap.percentUsed ?? 0) >= 90 && '[&>div]:bg-ds-danger',
                    (cap.percentUsed ?? 0) >= 70 && (cap.percentUsed ?? 0) < 90 && '[&>div]:bg-ds-warning',
                  )}
                />
                <p className="text-xs text-ds-foreground-muted">
                  {cap.remaining ?? 0} remaining
                </p>
              </div>
            ))}
          </div>
        )}

        {!loadingUsage && usageData?.dailyTrend && usageData.dailyTrend.length > 0 && (
          <div className="mt-ds-6 border-t border-ds-border pt-ds-4">
            <p className="mb-ds-3 text-sm font-medium text-ds-foreground">Last 7 Days</p>
            <div className="flex h-16 items-end gap-ds-1">
              {usageData.dailyTrend.map((d, i) => {
                const maxReq = Math.max(...usageData.dailyTrend.map((t) => t.requests), 1);
                const height = (d.requests / maxReq) * 100;
                return (
                  <div key={i} className="flex flex-1 flex-col items-center gap-ds-1">
                    <div
                      className="w-full rounded-t bg-ds-primary/80 transition-all"
                      style={{ height: `${Math.max(height, 4)}%` }}
                      title={`${d.day}: ${d.requests} requests`}
                    />
                    <span className="text-xs text-ds-foreground-muted">{d.day?.slice(5)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </SectionCard>

      <div>
        <h2 className="mb-ds-4 flex items-center gap-ds-2 text-lg font-semibold text-ds-foreground">
          <Tag tone="info">Pro</Tag>
          AI Features ({proFeatures.filter((f) => f.enabled).length}/{proFeatures.length})
        </h2>
        <div className="grid gap-ds-3 md:grid-cols-2 lg:grid-cols-3">
          {proFeatures.map((feature) => (
            <FeatureCard
              key={feature.key}
              featureKey={feature.key}
              enabled={feature.enabled}
              canToggle={plan === 'pro' || plan === 'enterprise' || plan === 'trial'}
              saving={saving === feature.key}
              onToggle={handleToggleFeature}
            />
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-ds-4 flex items-center gap-ds-2 text-lg font-semibold text-ds-foreground">
          <Tag tone="primary">Enterprise</Tag>
          AI Features ({enterpriseFeatures.filter((f) => f.enabled).length}/{enterpriseFeatures.length})
        </h2>
        <div className="grid gap-ds-3 md:grid-cols-2 lg:grid-cols-3">
          {enterpriseFeatures.map((feature) => (
            <FeatureCard
              key={feature.key}
              featureKey={feature.key}
              enabled={feature.enabled}
              canToggle={plan === 'enterprise'}
              saving={saving === feature.key}
              onToggle={handleToggleFeature}
            />
          ))}
        </div>
      </div>

      {!loadingUsage && usageData?.breakdown && usageData.breakdown.length > 0 && (
        <SectionCard title="Usage Breakdown (Last 30 Days)" flush>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ds-border text-left text-ds-foreground-muted">
                  <th className="px-ds-4 py-ds-2 font-medium">Task</th>
                  <th className="px-ds-4 py-ds-2 font-medium">Model</th>
                  <th className="px-ds-4 py-ds-2 text-right font-medium">Requests</th>
                  <th className="px-ds-4 py-ds-2 text-right font-medium">Tokens</th>
                  <th className="px-ds-4 py-ds-2 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {usageData.breakdown.map((row, i) => (
                  <tr key={i} className="border-b border-ds-border/50 last:border-0">
                    <td className="px-ds-4 py-ds-2 capitalize text-ds-foreground">{row.taskType?.replace(/_/g, ' ')}</td>
                    <td className="px-ds-4 py-ds-2 text-xs text-ds-foreground-muted">{row.modelName}</td>
                    <td className="px-ds-4 py-ds-2 text-right text-ds-foreground">{row.requestCount}</td>
                    <td className="px-ds-4 py-ds-2 text-right text-ds-foreground">
                      {(row.totalInputTokens + row.totalOutputTokens).toLocaleString()}
                    </td>
                    <td className="px-ds-4 py-ds-2 text-right text-ds-foreground">${row.totalCost?.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

export default function AiSettingsPage() {
  return (
    <PageContainer>
      <AiSettingsPageContent />
    </PageContainer>
  );
}
