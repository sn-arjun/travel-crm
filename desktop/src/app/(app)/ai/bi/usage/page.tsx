'use client';

import * as React from 'react';
import {
  Activity,
  Brain,
  UserPlus,
  Map,
  MessageSquare,
  Search,
  ScanText,
  Target,
  BellRing,
  Lightbulb,
  BarChart3,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

// Usage data is local/static since there's no dedicated usage endpoint
// In production this would come from an analytics API

interface UsageFeature {
  name: string;
  icon: React.ElementType;
  calls: number;
  tokens: number;
  color: string;
}

const USAGE_FEATURES: UsageFeature[] = [
  { name: 'Lead Extraction', icon: UserPlus, calls: 0, tokens: 0, color: 'text-blue-600' },
  { name: 'Itinerary Generator', icon: Map, calls: 0, tokens: 0, color: 'text-emerald-600' },
  { name: 'Message Composer', icon: MessageSquare, calls: 0, tokens: 0, color: 'text-purple-600' },
  { name: 'NL Search', icon: Search, calls: 0, tokens: 0, color: 'text-orange-600' },
  { name: 'Document OCR', icon: ScanText, calls: 0, tokens: 0, color: 'text-cyan-600' },
  { name: 'Lead Scoring', icon: Target, calls: 0, tokens: 0, color: 'text-red-600' },
  { name: 'Smart Follow-ups', icon: BellRing, calls: 0, tokens: 0, color: 'text-pink-600' },
  { name: 'Insights', icon: Lightbulb, calls: 0, tokens: 0, color: 'text-amber-600' },
  { name: 'BI Reports', icon: BarChart3, calls: 0, tokens: 0, color: 'text-indigo-600' },
];

export default function UsagePage() {
  // In a real implementation, this would fetch from an analytics endpoint
  const [features] = React.useState<UsageFeature[]>(USAGE_FEATURES);

  const totalCalls = features.reduce((s, f) => s + f.calls, 0);
  const totalTokens = features.reduce((s, f) => s + f.tokens, 0);
  const maxCalls = Math.max(...features.map((f) => f.calls), 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI Usage Statistics</h1>
          <p className="text-muted-foreground mt-1">
            Track AI feature usage, API calls, and token consumption
          </p>
        </div>
        <Button variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total API Calls</p>
                <p className="text-2xl font-bold mt-1">{totalCalls.toLocaleString()}</p>
              </div>
              <Activity className="h-8 w-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Tokens Used</p>
                <p className="text-2xl font-bold mt-1">{totalTokens.toLocaleString()}</p>
              </div>
              <Brain className="h-8 w-8 text-purple-600 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Features</p>
                <p className="text-2xl font-bold mt-1">
                  {features.filter((f) => f.calls > 0).length}/{features.length}
                </p>
              </div>
              <Lightbulb className="h-8 w-8 text-amber-600 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Tokens/Call</p>
                <p className="text-2xl font-bold mt-1">
                  {totalCalls > 0 ? Math.round(totalTokens / totalCalls).toLocaleString() : '0'}
                </p>
              </div>
              <BarChart3 className="h-8 w-8 text-blue-600 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Feature Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Usage by Feature</CardTitle>
          <CardDescription>Breakdown of AI API calls and token consumption per feature</CardDescription>
        </CardHeader>
        <CardContent>
          {totalCalls === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Activity className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">No usage data yet</p>
              <p className="text-xs mt-1">
                Start using AI features to see usage statistics here
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {features
                .sort((a, b) => b.calls - a.calls)
                .map((feature, idx) => {
                  const Icon = feature.icon;
                  return (
                    <div key={idx} className="flex items-center gap-4">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50 shrink-0">
                        <Icon className={cn('h-4 w-4', feature.color)} />
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{feature.name}</span>
                          <div className="flex items-center gap-4">
                            <span className="text-muted-foreground">
                              {feature.calls.toLocaleString()} calls
                            </span>
                            <span className="text-muted-foreground">
                              {feature.tokens.toLocaleString()} tokens
                            </span>
                          </div>
                        </div>
                        <Progress value={(feature.calls / maxCalls) * 100} className="h-2" />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 p-4 border border-blue-200/50 dark:border-blue-800/30">
            <Brain className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                About AI Usage
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                Usage statistics are tracked automatically as you use AI features across the
                platform. Token consumption varies by feature and input size. Contact support
                if you need to increase your AI usage limits.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
