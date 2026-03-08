'use client';

import Link from 'next/link';
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

const AI_FEATURES = [
  {
    title: 'Lead Extraction',
    description: 'Extract lead details from emails and inquiry text using AI',
    icon: UserPlus,
    href: '/ai/lead-creation',
    color: 'text-blue-600',
    bg: 'bg-blue-50 dark:bg-blue-950/30',
  },
  {
    title: 'Itinerary Generator',
    description: 'Generate day-by-day travel itineraries with AI suggestions',
    icon: Map,
    href: '/ai/itinerary',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
  },
  {
    title: 'Message Composer',
    description: 'Draft professional messages for email, SMS, and WhatsApp',
    icon: MessageSquare,
    href: '/ai/compose',
    color: 'text-purple-600',
    bg: 'bg-purple-50 dark:bg-purple-950/30',
  },
  {
    title: 'Natural Language Search',
    description: 'Ask questions about your CRM data in plain English',
    icon: Search,
    href: '/ai/search',
    color: 'text-orange-600',
    bg: 'bg-orange-50 dark:bg-orange-950/30',
  },
  {
    title: 'AI Insights',
    description: 'Get AI-generated insights and recommendations for your business',
    icon: Lightbulb,
    href: '/ai/insights',
    color: 'text-amber-600',
    bg: 'bg-amber-50 dark:bg-amber-950/30',
  },
  {
    title: 'Lead Scoring',
    description: 'AI-powered lead scoring with factor breakdown and recommendations',
    icon: Target,
    href: '/ai/lead-score',
    color: 'text-red-600',
    bg: 'bg-red-50 dark:bg-red-950/30',
  },
  {
    title: 'Document OCR',
    description: 'Scan passports, visas, and invoices to extract data automatically',
    icon: ScanText,
    href: '/ai/ocr',
    color: 'text-cyan-600',
    bg: 'bg-cyan-50 dark:bg-cyan-950/30',
  },
  {
    title: 'Smart Follow-ups',
    description: 'AI-suggested follow-up actions and optimal timing for leads',
    icon: BellRing,
    href: '/ai/smart-followups',
    color: 'text-pink-600',
    bg: 'bg-pink-50 dark:bg-pink-950/30',
  },
  {
    title: 'Business Intelligence',
    description: 'AI-driven dashboards, health scores, and trend analysis',
    icon: BarChart3,
    href: '/ai/bi',
    color: 'text-indigo-600',
    bg: 'bg-indigo-50 dark:bg-indigo-950/30',
  },
];

export default function AIHubPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">AI Hub</h1>
        <p className="text-muted-foreground mt-1">
          Leverage artificial intelligence to automate tasks, gain insights, and grow your business
        </p>
      </div>

      <div className="flex items-center gap-3 rounded-lg border bg-gradient-to-r from-primary/5 to-primary/10 p-4">
        <Brain className="h-8 w-8 text-primary" />
        <div>
          <p className="font-semibold">AI-Powered CRM</p>
          <p className="text-sm text-muted-foreground">
            All features use advanced AI models to help you work smarter, not harder.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {AI_FEATURES.map((feature) => (
          <Link key={feature.href} href={feature.href}>
            <Card className="h-full transition-all hover:shadow-md hover:border-primary/30 cursor-pointer">
              <CardHeader className="pb-3">
                <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${feature.bg}`}>
                  <feature.icon className={`h-5 w-5 ${feature.color}`} />
                </div>
                <CardTitle className="text-lg mt-3">{feature.title}</CardTitle>
                <CardDescription>{feature.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <span className="text-sm text-primary font-medium">
                  Open &rarr;
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
