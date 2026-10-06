'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { Button, EmptyState, Skeleton } from '@/components/ui';
import { PageContainer } from '@/components/layout/page-container';
import { useFeatureGate, UPGRADE_HREF } from '@/hooks/use-feature-gate';
import { whatsappCampaignsApi, type WhatsappCampaign } from '@/lib/api/whatsapp-campaigns';
import { WhatsappCampaignFormPage } from '../../whatsapp-campaign-form';

export default function EditWhatsappCampaignPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { enabled, loading: gateLoading } = useFeatureGate('whatsapp_campaigns');
  const [campaign, setCampaign] = React.useState<WhatsappCampaign | null>(null);
  const [state, setState] = React.useState<'loading' | 'ready' | 'missing'>('loading');

  React.useEffect(() => {
    if (gateLoading || !enabled) return;
    whatsappCampaignsApi
      .getById(params.id)
      .then((res) => {
        setCampaign(res.data);
        setState('ready');
      })
      .catch(() => setState('missing'));
  }, [gateLoading, enabled, params.id]);

  if (gateLoading || (enabled && state === 'loading')) {
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
        <Button size="sm" variant="outline" asChild>
          <a href={UPGRADE_HREF}>Upgrade plan</a>
        </Button>
      </PageContainer>
    );
  }

  if (state === 'missing' || !campaign) {
    return (
      <EmptyState
        title="Campaign not found"
        description="This campaign could not be loaded."
        action={<Button variant="outline" onClick={() => router.push('/marketing/whatsapp')}>Back to campaigns</Button>}
      />
    );
  }

  if (campaign.status !== 'draft') {
    return (
      <EmptyState
        title="Campaign can no longer be edited"
        description="Only draft campaigns can be edited."
        action={<Button variant="outline" onClick={() => router.push(`/marketing/whatsapp/${campaign.id}`)}>Back to campaign</Button>}
      />
    );
  }

  return (
    <WhatsappCampaignFormPage
      campaignId={campaign.id}
      initial={{
        name: campaign.name,
        templateId: campaign.templateId,
        segmentId: campaign.segmentId ?? '',
        scheduledFor: campaign.scheduledFor ? new Date(campaign.scheduledFor) : undefined,
      }}
    />
  );
}
