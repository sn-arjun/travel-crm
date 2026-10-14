'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  Bell,
  Building2,
  Megaphone,
  FileText,
  Globe,
  ListOrdered,
  MessageSquare,
  Phone,
  Receipt,
  Route,
  Shield,
  Sparkles,
  Upload,
  Users,
  Zap,
} from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/ui';
import { PageContainer } from '@/components/layout/page-container';

interface SettingsLink {
  label: string;
  description: string;
  href: string;
  icon: React.ReactNode;
}

interface SettingsGroup {
  title: string;
  links: SettingsLink[];
}

const groups: SettingsGroup[] = [
  {
    title: 'Company',
    links: [
      { label: 'Company Profile', description: 'Branding, address, and regional settings', href: '/settings/company', icon: <Building2 className="h-5 w-5" aria-hidden="true" /> },
      { label: 'Email Signature', description: 'Signature appended to outbound emails', href: '/settings/email-signature', icon: <MessageSquare className="h-5 w-5" aria-hidden="true" /> },
    ],
  },
  {
    title: 'Sales & Leads',
    links: [
      { label: 'Assignment Rules', description: 'Automatic lead assignment by criteria', href: '/settings/assignment-rules', icon: <Users className="h-5 w-5" aria-hidden="true" /> },
      { label: 'Routing Rules', description: 'Automatic lead routing by condition', href: '/settings/routing-rules', icon: <Route className="h-5 w-5" aria-hidden="true" /> },
      { label: 'Follow-up Sequences', description: 'Automated follow-up workflows', href: '/settings/followup-sequences', icon: <ListOrdered className="h-5 w-5" aria-hidden="true" /> },
    ],
  },
  {
    title: 'Billing & Documents',
    links: [
      { label: 'Invoice Defaults', description: 'Bank details and invoice default values', href: '/settings/invoice-defaults', icon: <Receipt className="h-5 w-5" aria-hidden="true" /> },
      { label: 'Document Numbering', description: 'Prefixes and numbering rules', href: '/settings/numbering', icon: <FileText className="h-5 w-5" aria-hidden="true" /> },
      { label: 'Itinerary Defaults', description: 'Default terms, inclusions, and validity', href: '/settings/itinerary-defaults', icon: <Globe className="h-5 w-5" aria-hidden="true" /> },
    ],
  },
  {
    title: 'Communication',
    links: [
      { label: 'Notifications', description: 'Notification channel preferences', href: '/settings/notifications', icon: <Bell className="h-5 w-5" aria-hidden="true" /> },
      { label: 'Integrations', description: 'Connect external services', href: '/settings/integrations', icon: <Zap className="h-5 w-5" aria-hidden="true" /> },
      { label: 'VoIP', description: 'Calling provider configuration', href: '/settings/voip', icon: <Phone className="h-5 w-5" aria-hidden="true" /> },
      { label: 'Phone Numbers', description: 'Business numbers for calls and messaging', href: '/settings/phone-numbers', icon: <Phone className="h-5 w-5" aria-hidden="true" /> },
      { label: 'Announcements', description: 'Broadcast notices to your whole team', href: '/settings/announcements', icon: <Megaphone className="h-5 w-5" aria-hidden="true" /> },
      { label: 'Chatbot', description: 'AI chatbot channel configuration', href: '/settings/chatbot', icon: <MessageSquare className="h-5 w-5" aria-hidden="true" /> },
    ],
  },
  {
    title: 'AI',
    links: [
      { label: 'AI Features', description: 'Toggle AI features and provider', href: '/settings/ai', icon: <Sparkles className="h-5 w-5" aria-hidden="true" /> },
      { label: 'Usage and limits', description: 'AI credits, SMS, WhatsApp, email, login codes and calls', href: '/settings/ai-usage', icon: <Sparkles className="h-5 w-5" aria-hidden="true" /> },
    ],
  },
  {
    title: 'Data',
    links: [
      { label: 'Import', description: 'Bulk import contacts and leads', href: '/settings/import', icon: <Upload className="h-5 w-5" aria-hidden="true" /> },
      { label: 'Export', description: 'Bulk export your data', href: '/settings/export', icon: <Upload className="h-5 w-5" aria-hidden="true" /> },
      { label: 'Custom Fields', description: 'Configure custom fields per entity', href: '/settings/custom-fields', icon: <FileText className="h-5 w-5" aria-hidden="true" /> },
    ],
  },
  {
    title: 'Account & Security',
    links: [
      { label: 'Team', description: 'Manage team members and roles', href: '/settings/team', icon: <Users className="h-5 w-5" aria-hidden="true" /> },
      { label: 'Profile', description: 'Your personal information', href: '/settings/profile', icon: <Users className="h-5 w-5" aria-hidden="true" /> },
      { label: 'Security', description: 'Change your password', href: '/settings/security', icon: <Shield className="h-5 w-5" aria-hidden="true" /> },
      { label: 'Active Sessions', description: 'View and revoke sessions', href: '/settings/sessions', icon: <Shield className="h-5 w-5" aria-hidden="true" /> },
      { label: 'Login History', description: 'Recent login activity', href: '/settings/login-history', icon: <Globe className="h-5 w-5" aria-hidden="true" /> },
      { label: 'Activity Log', description: 'System audit trail', href: '/settings/activity-log', icon: <Zap className="h-5 w-5" aria-hidden="true" /> },
    ],
  },
];

export default function SettingsPage() {
  return (
    <PageContainer>
      <PageHeader title="Settings" description="Manage your company configuration and preferences." />

      {groups.map((group) => (
        <SectionCard key={group.title} title={group.title}>
          <div className="grid grid-cols-1 gap-ds-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.links.map((link) => (
              <Link key={link.href} href={link.href}>
                <div className="flex items-start gap-ds-3 rounded-ds-md border border-ds-border bg-ds-surface p-ds-4 transition-colors hover:border-ds-border-strong hover:bg-ds-surface-raised focus-visible:ring-2 focus-visible:ring-ds-ring">
                  <div className="text-ds-primary">{link.icon}</div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-ds-1 text-sm font-medium text-ds-foreground">
                      {link.label}
                      <ArrowUpRight className="h-3 w-3 text-ds-foreground-subtle" aria-hidden="true" />
                    </p>
                    <p className="mt-ds-1 text-xs text-ds-foreground-muted">{link.description}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </SectionCard>
      ))}
    </PageContainer>
  );
}
