'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  Brain,
  UserPlus,
  Map,
  MessageSquare,
  Search,
  Lightbulb,
  Target,
  ScanText,
  BellRing,
  BarChart3,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/ui/page-header';
import { AiGate } from '@/components/domain/ai/ai-gate';
import { AiQuotaBadge } from '@/components/domain/ai/quota-badge';
import { AiAvailabilityBanner } from '@/components/domain/ai/ai-availability-banner';

const TONE_CLASSES = {
  info: 'bg-ds-info-subtle text-ds-info-on-subtle',
  success: 'bg-ds-success-subtle text-ds-success-on-subtle',
  primary: 'bg-ds-primary-subtle text-ds-primary-on-subtle',
  warning: 'bg-ds-warning-subtle text-ds-warning-on-subtle',
  danger: 'bg-ds-danger-subtle text-ds-danger-on-subtle',
} as const;

const AI_FEATURES: ReadonlyArray<{
  title: string;
  description: string;
  icon: LucideIcon;
  href: string;
  tone: keyof typeof TONE_CLASSES;
}> = [
  {
    title: 'Lead Extraction',
    description: 'Extract lead details from emails and inquiry text using AI',
    icon: UserPlus,
    href: '/ai/lead-creation',
    tone: 'info',
  },
  {
    title: 'Itinerary Generator',
    description: 'Generate day-by-day travel itineraries with AI suggestions',
    icon: Map,
    href: '/ai/itinerary',
    tone: 'success',
  },
  {
    title: 'Message Composer',
    description: 'Draft professional messages for email, SMS, and WhatsApp',
    icon: MessageSquare,
    href: '/ai/compose',
    tone: 'primary',
  },
  {
    title: 'Natural Language Search',
    description: 'Ask questions about your CRM data in plain English',
    icon: Search,
    href: '/ai/search',
    tone: 'warning',
  },
  {
    title: 'AI Insights',
    description: 'Get AI-generated insights and recommendations for your business',
    icon: Lightbulb,
    href: '/ai/insights',
    tone: 'warning',
  },
  {
    title: 'Lead Scoring',
    description: 'AI-powered lead scoring with factor breakdown and recommendations',
    icon: Target,
    href: '/ai/lead-score',
    tone: 'danger',
  },
  {
    title: 'Document OCR',
    description: 'Scan passports, visas, and invoices to extract data automatically',
    icon: ScanText,
    href: '/ai/ocr',
    tone: 'info',
  },
  {
    title: 'Smart Follow-ups',
    description: 'AI-suggested follow-up actions and optimal timing for leads',
    icon: BellRing,
    href: '/ai/smart-followups',
    tone: 'danger',
  },
  {
    title: 'Business Intelligence',
    description: 'AI-driven dashboards, health scores, and trend analysis',
    icon: BarChart3,
    href: '/ai/bi',
    tone: 'primary',
  },
];

export default function AIHubPage() {
  return (
    <PageContainer>
      <PageHeader
        title="AI Hub"
        description="Leverage artificial intelligence to automate tasks, gain insights, and grow your business"
        actions={<AiQuotaBadge capKey="ai_requests" />}
      />

      <AiGate>
        <AiAvailabilityBanner note="Tools that only read existing data still work." />
        <div className="flex items-center gap-ds-3 rounded-ds-lg border border-ds-border bg-ds-primary-subtle p-ds-4">
          <Brain className="size-8 text-ds-primary" aria-hidden="true" />
          <div>
            <p className="font-semibold text-ds-foreground">AI-Powered CRM</p>
            <p className="text-sm text-ds-foreground-muted">
              Pick a tool to get started. AI output is always a draft for you to review before it is saved.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-ds-4">
          {AI_FEATURES.map((feature) => (
            <Link key={feature.href} href={feature.href}>
              <Card className="h-full transition-all hover:shadow-ds-2 hover:border-ds-primary cursor-pointer">
                <CardHeader className="pb-3">
                  <div className={`inline-flex size-10 items-center justify-center rounded-ds-lg ${TONE_CLASSES[feature.tone]}`}>
                    <feature.icon className="size-5" aria-hidden="true" />
                  </div>
                  <CardTitle className="text-lg mt-3">{feature.title}</CardTitle>
                  <CardDescription>{feature.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <span className="text-sm font-medium text-ds-primary">
                    Open &rarr;
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </AiGate>
    </PageContainer>
  );
}
