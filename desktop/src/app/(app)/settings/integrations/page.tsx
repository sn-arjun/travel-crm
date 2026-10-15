'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Copy, Check, Webhook, MessageSquare, Mail, Plus, Trash2, KeyRound } from 'lucide-react';
import {
  Button, Input, Label, SectionCard, PageHeader, Badge, Tag, Skeleton,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, useConfirm,
} from '@/components/ui';
import { PhoneInput } from '@/components/ui/phone-input';
import { toast } from 'sonner';
import { useApiBaseUrl } from '@/lib/api/use-api-base-url';
import { PageContainer } from '@/components/layout/page-container';
import { useApiQuery } from '@/hooks/use-api';
import { PaymentGateways } from './_payment-gateways';
import { WhatsAppMeta } from './_whatsapp-meta';
import {
  integrationsApi,
  type ChannelAddress,
  type IntegrationApiKey,
  type ReceivingChannel,
} from '@/lib/api/integrations';

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

/** Where a provider delivers customer messages. Set once on the number, per provider. */
const INBOUND_URLS: Array<{ key: string; label: string; path: string }> = [
  { key: 'twilio-inbound', label: 'Twilio (WhatsApp and SMS): "A message comes in" URL', path: '/webhooks/inbound/twilio/message' },
  { key: 'plivo-inbound-whatsapp', label: 'Plivo WhatsApp: message URL', path: '/webhooks/inbound/plivo/message?channel=whatsapp' },
  { key: 'plivo-inbound-sms', label: 'Plivo SMS: message URL', path: '/webhooks/inbound/plivo/message?channel=sms' },
];

const CHANNEL_LABELS: Record<ReceivingChannel, string> = {
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  email: 'Email',
  voice: 'Calls',
};

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

function CopyableUrl({ id, url, copyLabel = 'Copy webhook URL', copiedMessage = 'Webhook URL copied' }: {
  id: string;
  url: string;
  copyLabel?: string;
  copiedMessage?: string;
}) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success(copiedMessage);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };

  return (
    <div className="flex items-center gap-ds-2">
      <Input id={id} value={url} readOnly className="font-mono text-xs" />
      <Button variant="outline" size="icon" aria-label={copyLabel} onClick={handleCopy}>
        {copied ? <Check className="size-4 text-ds-success" /> : <Copy className="size-4" />}
      </Button>
    </div>
  );
}

// ── Receiving numbers and mailboxes ──────────────────────────

function ReceivingAddresses() {
  const apiBaseUrl = useApiBaseUrl();
  const { data, loading, error, refetch } = useApiQuery(() => integrationsApi.listChannels(), []);
  const addresses: ChannelAddress[] = data?.data ?? [];
  const { confirm, dialog } = useConfirm();

  const [channel, setChannel] = React.useState<ReceivingChannel>('whatsapp');
  const [phone, setPhone] = React.useState('');
  const [countryCode, setCountryCode] = React.useState('+91');
  const [email, setEmail] = React.useState('');
  const [label, setLabel] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const isEmail = channel === 'email';
  const address = isEmail ? email.trim() : `${countryCode}${phone.replace(/\D/g, '')}`;
  const canAdd = isEmail ? email.trim().length > 3 : phone.replace(/\D/g, '').length >= 6;

  const handleAdd = async () => {
    setSaving(true);
    try {
      await integrationsApi.addChannel({ channel, address, label: label.trim() || undefined });
      toast.success(`${CHANNEL_LABELS[channel]} address added`);
      setPhone('');
      setEmail('');
      setLabel('');
      await refetch({ silent: true });
    } catch (err) {
      toast.error(errorMessage(err, 'Could not add the address'));
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (row: ChannelAddress) => {
    const ok = await confirm({
      title: 'Stop receiving on this address?',
      description: `Messages sent to ${row.address} will no longer appear in the inbox.`,
      confirmLabel: 'Remove',
      tone: 'destructive',
    });
    if (!ok) return;
    try {
      await integrationsApi.removeChannel(row.id);
      toast.success('Address removed');
      await refetch({ silent: true });
    } catch (err) {
      toast.error(errorMessage(err, 'Could not remove the address'));
    }
  };

  return (
    <SectionCard
      title="Receiving numbers and mailboxes"
      description="Customer messages sent to these addresses arrive in your inbox and are read by the assistant."
    >
      {dialog}
      <div className="flex flex-col gap-ds-4">
        {loading ? (
          <Skeleton className="h-12 w-full" />
        ) : error ? (
          <p className="text-sm text-ds-foreground-muted">Only administrators can manage receiving addresses.</p>
        ) : addresses.length === 0 ? (
          <p className="text-sm text-ds-foreground-muted">
            No address registered yet. Add the WhatsApp or SMS number and the enquiry mailbox your customers write to.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-ds-border rounded-ds-md border border-ds-border">
            {addresses.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-ds-3 px-ds-3 py-ds-2">
                <div className="flex min-w-0 items-center gap-ds-3">
                  <Tag tone={row.channel === 'email' ? 'info' : row.channel === 'whatsapp' ? 'success' : 'warning'}>
                    {CHANNEL_LABELS[row.channel] ?? row.channel}
                  </Tag>
                  <span className="truncate font-mono text-sm">{row.address}</span>
                  {row.label && <span className="truncate text-sm text-ds-foreground-muted">{row.label}</span>}
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${row.address}`}
                  className="text-ds-danger hover:text-ds-danger"
                  onClick={() => handleRemove(row)}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {!error && (
          <div className="grid grid-cols-1 items-end gap-ds-3 md:grid-cols-[10rem_1fr_1fr_auto]">
            <div className="flex flex-col gap-ds-2">
              <Label htmlFor="receiving-channel">Channel</Label>
              <Select value={channel} onValueChange={(v) => setChannel(v as ReceivingChannel)}>
                <SelectTrigger id="receiving-channel" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="voice">Calls</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-ds-2">
              <Label htmlFor="receiving-address">{isEmail ? 'Mailbox' : 'Number'}</Label>
              {isEmail ? (
                <Input
                  id="receiving-address"
                  type="email"
                  placeholder="enquiries@youragency.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              ) : (
                <PhoneInput value={phone} onChange={setPhone} countryCode={countryCode} onCountryCodeChange={setCountryCode} />
              )}
            </div>
            <div className="flex flex-col gap-ds-2">
              <Label htmlFor="receiving-label">Label (optional)</Label>
              <Input id="receiving-label" placeholder="Main line" value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>
            <Button onClick={handleAdd} disabled={!canAdd || saving}>
              <Plus className="size-4" aria-hidden="true" />
              Add address
            </Button>
          </div>
        )}

        {!error && (
          <div className="flex flex-col gap-ds-3 border-t border-ds-border pt-ds-4">
            <p className="text-xs text-ds-foreground-muted">
              Set these as the incoming-message URL on the number with your provider. Email arrives through the mailbox forwarding set up for your workspace.
            </p>
            {INBOUND_URLS.map((item) => (
              <div key={item.key} className="flex flex-col gap-ds-2">
                <Label htmlFor={`${item.key}-url`}>{item.label}</Label>
                <CopyableUrl
                  id={`${item.key}-url`}
                  url={`${apiBaseUrl}${item.path}`}
                  copyLabel="Copy inbound URL"
                  copiedMessage="Inbound URL copied"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// ── Website-form API keys ────────────────────────────────────

function ApiKeys() {
  const { data, loading, error, refetch } = useApiQuery(() => integrationsApi.listApiKeys(), []);
  const keys: IntegrationApiKey[] = data?.data ?? [];
  const { confirm, dialog } = useConfirm();
  const [issued, setIssued] = React.useState<IntegrationApiKey | null>(null);
  const [creating, setCreating] = React.useState(false);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await integrationsApi.createApiKey({ label: 'Website form' });
      setIssued(res.data);
      toast.success('API key created');
      await refetch({ silent: true });
    } catch (err) {
      toast.error(errorMessage(err, 'Could not create an API key'));
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (key: IntegrationApiKey) => {
    const ok = await confirm({
      title: 'Revoke this API key?',
      description: 'Forms that still use this key will stop creating leads straight away.',
      confirmLabel: 'Revoke',
      tone: 'destructive',
    });
    if (!ok) return;
    try {
      await integrationsApi.revokeApiKey(key.id);
      if (issued?.id === key.id) setIssued(null);
      toast.success('API key revoked');
      await refetch({ silent: true });
    } catch (err) {
      toast.error(errorMessage(err, 'Could not revoke the API key'));
    }
  };

  const hasKeys = keys.length > 0;

  return (
    <SectionCard
      title={hasKeys || loading ? 'Website form API keys' : 'No API key found'}
      description="Lead capture webhook calls must include a tenant API key. Create one here and add it to your website form as api_key."
      actions={
        !error ? (
          <Button size="sm" variant="outline" onClick={handleCreate} disabled={creating}>
            <KeyRound className="size-4" aria-hidden="true" />
            Create API key
          </Button>
        ) : undefined
      }
    >
      {dialog}
      <div className="flex flex-col gap-ds-3">
        {issued?.apiKey && (
          <div className="flex flex-col gap-ds-2 rounded-ds-md border border-ds-border bg-ds-surface-sunken p-ds-3">
            <Label htmlFor="issued-api-key">Your new key. Copy it now; it is not shown again.</Label>
            <CopyableUrl id="issued-api-key" url={issued.apiKey} copyLabel="Copy API key" copiedMessage="API key copied" />
          </div>
        )}

        {loading ? (
          <Skeleton className="h-10 w-full" />
        ) : error ? (
          <p className="text-sm text-ds-foreground-muted">Only administrators can manage API keys.</p>
        ) : !hasKeys ? (
          <Badge variant="outline" className="w-fit gap-ds-1 border-ds-warning text-ds-warning">
            Create a key to connect your website form
          </Badge>
        ) : (
          <ul className="flex flex-col divide-y divide-ds-border rounded-ds-md border border-ds-border">
            {keys.map((key) => (
              <li key={key.id} className="flex items-center justify-between gap-ds-3 px-ds-3 py-ds-2">
                <div className="flex min-w-0 items-center gap-ds-3">
                  <span className="font-mono text-sm">{key.maskedKey}</span>
                  {key.label && <span className="truncate text-sm text-ds-foreground-muted">{key.label}</span>}
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Revoke key ${key.maskedKey}`}
                  className="text-ds-danger hover:text-ds-danger"
                  onClick={() => handleRevoke(key)}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SectionCard>
  );
}

function IntegrationsSettingsPageContent() {
  const apiBaseUrl = useApiBaseUrl();
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

      <ReceivingAddresses />
      <ApiKeys />
      <WhatsAppMeta />
      <PaymentGateways />

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
                <CopyableUrl id={`${wh.key}-url`} url={`${apiBaseUrl}${wh.path}`} />
              </div>
              <p className="text-xs text-ds-foreground-muted">{wh.authNote}</p>
            </div>
          </SectionCard>
        ))}
      </div>
    </div>
  );
}

export default function IntegrationsSettingsPage() {
  return (
    <PageContainer>
      <IntegrationsSettingsPageContent />
    </PageContainer>
  );
}
