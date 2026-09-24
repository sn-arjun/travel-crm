'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Copy, Check, Webhook, MessageSquare, Mail } from 'lucide-react';
import { Button, Input, Label, SectionCard, PageHeader, Badge } from '@/components/ui';
import { toast } from 'sonner';
import { API_BASE_URL } from '@/lib/api/config';

interface WebhookInfo {
  key: string;
  title: string;
  description: string;
  method: 'POST';
  path: string;
  icon: React.ReactNode;
  authNote: string;
}

const WEBHOOKS: WebhookInfo[] = [
  {
    key: 'lead-capture',
    title: 'Lead Capture Webhook',
    description: 'Point your website form, landing page builder, or ad platform at this URL to auto-create leads in TravelCRM.',
    method: 'POST',
    path: '/leads/webhook',
    icon: <Webhook className="size-4" aria-hidden="true" />,
    authNote: 'Authenticate by including your tenant api_key in the JSON request body.',
  },
  {
    key: 'sendgrid-events',
    title: 'SendGrid Event Webhook',
    description: 'Configure this as the Event Webhook URL in your SendGrid account to receive delivery, open, and bounce events for outbound email.',
    method: 'POST',
    path: '/webhooks/sendgrid/events',
    icon: <Mail className="size-4" aria-hidden="true" />,
    authNote: 'Verified by SendGrid signed event webhook headers.',
  },
  {
    key: 'twilio-status',
    title: 'Twilio Status Callback',
    description: 'Set this as the status callback URL on your Twilio number to receive SMS and call delivery status updates.',
    method: 'POST',
    path: '/webhooks/twilio/status',
    icon: <MessageSquare className="size-4" aria-hidden="true" />,
    authNote: 'Twilio request signature verification is not yet enabled on this endpoint.',
  },
];

function CopyableUrl({ url }: { url: string }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Webhook URL copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };

  return (
    <div className="flex items-center gap-ds-2">
      <Input value={url} readOnly className="font-mono text-xs" />
      <Button variant="outline" size="icon" aria-label="Copy webhook URL" onClick={handleCopy}>
        {copied ? <Check className="size-4 text-ds-success" /> : <Copy className="size-4" />}
      </Button>
    </div>
  );
}

export default function IntegrationsSettingsPage() {
  const router = useRouter();

  const backButton = (
    <Button variant="ghost" size="icon" onClick={() => router.push('/settings')} aria-label="Back to settings">
      <ArrowLeft className="size-4" />
    </Button>
  );

  return (
    <div className="flex flex-col gap-ds-6">
      <PageHeader
        title="Webhooks & Integrations"
        description="Inbound webhook endpoints for connecting external systems to TravelCRM."
        back={backButton}
        count={WEBHOOKS.length}
      />

      <SectionCard
        title="No API key found"
        description="Lead capture webhook calls must include a tenant API key. API key issuance is managed by your account administrator and is not yet self-service in this settings area."
      >
        <Badge variant="outline" className="gap-ds-1 border-ds-warning text-ds-warning">
          Manual setup required
        </Badge>
      </SectionCard>

      <div className="flex flex-col gap-ds-4">
        {WEBHOOKS.map((wh) => (
          <SectionCard key={wh.key} title={wh.title} description={wh.description}>
            <div className="flex flex-col gap-ds-3">
              <div className="flex items-center gap-ds-2">
                <span className="text-ds-foreground-muted">{wh.icon}</span>
                <Badge variant="outline" className="font-mono text-xs">
                  {wh.method}
                </Badge>
              </div>
              <div className="flex flex-col gap-ds-2">
                <Label htmlFor={`${wh.key}-url`}>Endpoint URL</Label>
                <CopyableUrl url={`${API_BASE_URL}${wh.path}`} />
              </div>
              <p className="text-xs text-ds-foreground-muted">{wh.authNote}</p>
            </div>
          </SectionCard>
        ))}
      </div>
    </div>
  );
}
