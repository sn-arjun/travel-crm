'use client';

import { Lock } from 'lucide-react';
import { Button, Skeleton } from '@/components/ui';
import { PageContainer } from '@/components/layout/page-container';
import { useFeatureGate, UPGRADE_HREF } from '@/hooks/use-feature-gate';
import { WhatsappCampaignFormPage } from '../whatsapp-campaign-form';

export default function NewWhatsappCampaignPage() {
  const { enabled, reason, loading: gateLoading } = useFeatureGate('whatsapp_campaigns');

  if (gateLoading) {
    return (
      <PageContainer>
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-96 w-full" />
      </PageContainer>
    );
  }

  if (!enabled) {
    return (
      <PageContainer className="items-center justify-center gap-ds-3 py-ds-10 text-center">
        <div className="flex size-12 items-center justify-center rounded-ds-full bg-ds-warning-subtle text-ds-warning-on-subtle">
          <Lock className="size-6" aria-hidden="true" />
        </div>
        <p className="text-sm font-medium text-ds-foreground">WhatsApp Campaigns is not available on your plan</p>
        <p className="max-w-sm text-sm text-ds-foreground-subtle">
          {reason === 'cap_exceeded'
            ? 'You have reached your WhatsApp messaging limit for this billing period.'
            : 'Upgrade your plan to send bulk WhatsApp campaigns from approved templates.'}
        </p>
        <Button size="sm" variant="outline" asChild>
          <a href={UPGRADE_HREF}>{reason === 'cap_exceeded' ? 'View usage' : 'Upgrade plan'}</a>
        </Button>
      </PageContainer>
    );
  }

  return <WhatsappCampaignFormPage />;
}
