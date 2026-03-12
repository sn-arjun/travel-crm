'use client';

import * as React from 'react';
import { useAiSettings, invalidateAiSettingsCache } from '@/hooks/use-ai-feature';
import { aiApi } from '@/lib/api/ai';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Sparkles, Shield, Zap, Brain, Eye, Search, MessageSquare,
  Map, Calculator, Phone, Truck, Users as UsersIcon, BarChart3,
  CreditCard, Stamp, Megaphone, TrendingUp, CalendarClock,
  Award, RefreshCw, Server, Cloud,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const AI_FEATURE_META: Record<string, { label: string; description: string; icon: React.ComponentType<any> }> = {
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

export default function AiSettingsPage() {
  const { features, usageCaps, provider, plan, loading, error, refetch } = useAiSettings();
  const [saving, setSaving] = React.useState<string | null>(null);
  const [usageData, setUsageData] = React.useState<any>(null);
  const [loadingUsage, setLoadingUsage] = React.useState(false);

  // Fetch detailed usage
  React.useEffect(() => {
    setLoadingUsage(true);
    aiApi.settings.getUsage()
      .then((res: any) => {
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
      // Will show error via refetch
    } finally {
      setSaving(null);
    }
  };

  const proFeatures = features.filter(f => f.tier === 'pro');
  const enterpriseFeatures = features.filter(f => f.tier === 'enterprise');

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={refetch}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage AI features, usage quotas, and provider configuration for your <Badge variant="outline" className="ml-1">{plan}</Badge> plan
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refetch} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Provider Status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Server className="h-4 w-4" />
            AI Provider
          </CardTitle>
          <CardDescription>Active AI model provider</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Cloud className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-sm font-medium">Cloudflare Workers AI</p>
                <p className="text-xs text-muted-foreground">
                  {provider?.cloudflare ? 'Active' : 'Unavailable'} — Free tier included
                </p>
              </div>
              {provider?.defaultProvider === 'cloudflare' && (
                <Badge variant="default" className="ml-2 text-[10px]">Default</Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-violet-500" />
              <div>
                <p className="text-sm font-medium">Claude API</p>
                <p className="text-xs text-muted-foreground">
                  {provider?.anthropic ? 'Connected' : 'No API key set'}
                </p>
              </div>
              {provider?.defaultProvider === 'anthropic' && (
                <Badge variant="default" className="ml-2 text-[10px]">Default</Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Usage Quotas */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Usage Quotas
          </CardTitle>
          <CardDescription>Current usage against your plan limits</CardDescription>
        </CardHeader>
        <CardContent>
          {Object.keys(usageCaps).length === 0 ? (
            <p className="text-sm text-muted-foreground">No usage caps configured for your plan.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {Object.entries(usageCaps).map(([key, cap]: [string, any]) => (
                <div key={key} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium capitalize">{key.replace(/_/g, ' ')}</span>
                    <span className="text-muted-foreground">
                      {cap.used ?? 0} / {cap.limit ?? 0}
                    </span>
                  </div>
                  <Progress
                    value={cap.percentUsed ?? 0}
                    className={cn(
                      'h-2',
                      (cap.percentUsed ?? 0) >= 90 && '[&>div]:bg-red-500',
                      (cap.percentUsed ?? 0) >= 70 && (cap.percentUsed ?? 0) < 90 && '[&>div]:bg-amber-500',
                    )}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {cap.remaining ?? 0} remaining — resets {cap.resetPeriod ?? 'daily'}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Daily trend */}
          {usageData?.dailyTrend?.length > 0 && (
            <div className="mt-6 border-t pt-4">
              <p className="text-sm font-medium mb-3">Last 7 Days</p>
              <div className="flex items-end gap-1 h-16">
                {usageData.dailyTrend.map((d: any, i: number) => {
                  const maxReq = Math.max(...usageData.dailyTrend.map((t: any) => t.requests), 1);
                  const height = (d.requests / maxReq) * 100;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className="w-full rounded-t bg-primary/80 transition-all"
                        style={{ height: `${Math.max(height, 4)}%` }}
                        title={`${d.day}: ${d.requests} requests`}
                      />
                      <span className="text-[9px] text-muted-foreground">
                        {d.day?.slice(5)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pro AI Features */}
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <Badge className="bg-blue-600">Pro</Badge>
          AI Features ({proFeatures.filter(f => f.enabled).length}/{proFeatures.length})
        </h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {proFeatures.map((feature) => {
            const meta = AI_FEATURE_META[feature.key];
            if (!meta) return null;
            const Icon = meta.icon;
            const canToggle = plan === 'pro' || plan === 'enterprise' || plan === 'trial';

            return (
              <Card key={feature.key} className={cn(!feature.enabled && 'opacity-60')}>
                <CardContent className="flex items-start gap-3 py-4">
                  <div className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                    feature.enabled ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-muted text-muted-foreground',
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium truncate">{meta.label}</p>
                      <Switch
                        checked={feature.enabled}
                        disabled={!canToggle || saving === feature.key}
                        onCheckedChange={(v) => handleToggleFeature(feature.key, v)}
                        aria-label={`Toggle ${meta.label}`}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{meta.description}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Enterprise AI Features */}
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <Badge className="bg-purple-600">Enterprise</Badge>
          AI Features ({enterpriseFeatures.filter(f => f.enabled).length}/{enterpriseFeatures.length})
        </h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {enterpriseFeatures.map((feature) => {
            const meta = AI_FEATURE_META[feature.key];
            if (!meta) return null;
            const Icon = meta.icon;
            const canToggle = plan === 'enterprise';

            return (
              <Card key={feature.key} className={cn(!feature.enabled && 'opacity-60')}>
                <CardContent className="flex items-start gap-3 py-4">
                  <div className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                    feature.enabled ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-muted text-muted-foreground',
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium truncate">{meta.label}</p>
                      <Switch
                        checked={feature.enabled}
                        disabled={!canToggle || saving === feature.key}
                        onCheckedChange={(v) => handleToggleFeature(feature.key, v)}
                        aria-label={`Toggle ${meta.label}`}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{meta.description}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Usage Breakdown */}
      {usageData?.breakdown?.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Usage Breakdown (Last 30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Task</th>
                    <th className="pb-2 font-medium">Model</th>
                    <th className="pb-2 font-medium text-right">Requests</th>
                    <th className="pb-2 font-medium text-right">Tokens</th>
                    <th className="pb-2 font-medium text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {usageData.breakdown.map((row: any, i: number) => (
                    <tr key={i} className="border-b border-muted/50">
                      <td className="py-2 capitalize">{row.taskType?.replace(/_/g, ' ')}</td>
                      <td className="py-2 text-muted-foreground text-xs">{row.modelName}</td>
                      <td className="py-2 text-right">{row.requestCount}</td>
                      <td className="py-2 text-right">{(row.totalInputTokens + row.totalOutputTokens).toLocaleString()}</td>
                      <td className="py-2 text-right">${row.totalCost?.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
