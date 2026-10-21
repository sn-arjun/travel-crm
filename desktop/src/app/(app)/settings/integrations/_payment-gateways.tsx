'use client';

import * as React from 'react';
import { Check, Copy, CreditCard, Plug, Trash2 } from 'lucide-react';
import {
  Button, Input, Label, SectionCard, Skeleton, Tag, useConfirm,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui';
import { toast } from 'sonner';
import { useApiQuery } from '@/hooks/use-api';
import { useT } from '@/lib/i18n';
import {
  integrationsApi,
  type PaymentGatewayAccount,
  type PaymentGatewayId,
} from '@/lib/api/integrations';

const GATEWAYS: Array<{ id: PaymentGatewayId; name: string; hint: string; keyIdLabel: string | null; secretLabel: string; webhookHint: string }> = [
  {
    id: 'razorpay',
    name: 'Razorpay',
    hint: 'For customers paying in rupees. Use the key id and key secret from Razorpay Dashboard > Account & Settings > API Keys.',
    keyIdLabel: 'Key id',
    secretLabel: 'Key secret',
    webhookHint: 'In Razorpay Dashboard > Webhooks, add the URL below, enable the "Payment Link" paid, expired and cancelled events and set a secret. Enter the same secret here.',
  },
  {
    id: 'stripe',
    name: 'Stripe',
    hint: 'For customers paying in other currencies. Use a secret or restricted key from Stripe Dashboard > Developers > API keys.',
    keyIdLabel: null,
    secretLabel: 'Secret key',
    webhookHint: 'In Stripe Dashboard > Developers > Webhooks, add the URL below for the checkout.session.completed and checkout.session.async_payment_succeeded events, then enter its signing secret (whsec_...) here.',
  },
];

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

function CopyField({ id, value, label }: { id: string; value: string; label: string }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success('Payment webhook URL copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };
  return (
    <div className="flex items-center gap-ds-2">
      <Input id={id} value={value} readOnly className="font-mono text-xs" />
      <Button variant="outline" size="icon" aria-label={label} onClick={copy}>
        {copied ? <Check className="size-4 text-ds-success" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
      </Button>
    </div>
  );
}

function GatewayCard({ gateway, account, onChanged }: {
  gateway: (typeof GATEWAYS)[number];
  account: PaymentGatewayAccount | undefined;
  onChanged: () => void;
}) {
  const t = useT();
  const { confirm, dialog } = useConfirm();
  const [editing, setEditing] = React.useState(!account);
  const [mode, setMode] = React.useState<'test' | 'live'>(account?.mode ?? 'test');
  const [keyId, setKeyId] = React.useState('');
  const [secret, setSecret] = React.useState('');
  const [webhookSecret, setWebhookSecret] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<{ ok: boolean; message: string } | null>(null);

  React.useEffect(() => {
    if (account) setMode(account.mode);
  }, [account]);

  const needsKeyId = gateway.keyIdLabel !== null;
  const canSave = account
    ? true
    : secret.trim().length >= 8 && (!needsKeyId || keyId.trim().length >= 3);

  const handleSave = async () => {
    setSaving(true);
    try {
      await integrationsApi.savePaymentGateway(gateway.id, {
        mode,
        keyId: keyId.trim() || undefined,
        keySecret: secret.trim() || undefined,
        webhookSecret: webhookSecret.trim() || undefined,
      });
      toast.success(`${gateway.name} saved`);
      // The secrets are never shown again: clear them from the form as soon as they are saved.
      setKeyId('');
      setSecret('');
      setWebhookSecret('');
      setEditing(false);
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err, `Could not save ${gateway.name}`));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await integrationsApi.testPaymentGateway(gateway.id);
      setTestResult(res.data);
      if (res.data.ok) onChanged();
    } catch (err) {
      setTestResult({ ok: false, message: errorMessage(err, 'Could not run the test') });
    } finally {
      setTesting(false);
    }
  };

  const handleToggle = async () => {
    if (!account) return;
    try {
      await integrationsApi.savePaymentGateway(gateway.id, { mode: account.mode, isActive: !account.isActive });
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not update the gateway'));
    }
  };

  const handleRemove = async () => {
    const ok = await confirm({
      title: `Disconnect ${gateway.name}?`,
      description: 'Existing payment links keep working at the gateway, but payments through them will no longer be recorded here.',
      confirmLabel: 'Disconnect',
      tone: 'destructive',
    });
    if (!ok) return;
    try {
      await integrationsApi.removePaymentGateway(gateway.id);
      toast.success(`${gateway.name} disconnected`);
      setEditing(true);
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not disconnect'));
    }
  };

  return (
    <div className="flex flex-col gap-ds-3 rounded-ds-md border border-ds-border p-ds-3" data-testid={`payment-gateway-${gateway.id}`}>
      {dialog}
      <div className="flex flex-wrap items-center justify-between gap-ds-2">
        <div className="flex items-center gap-ds-2">
          <Plug className="size-4 text-ds-foreground-muted" aria-hidden="true" />
          <span className="text-sm font-semibold">{gateway.name}</span>
          {account ? (
            <>
              <Tag tone={account.isActive ? 'success' : 'warning'}>{account.isActive ? 'Connected' : 'Paused'}</Tag>
              <Tag tone={account.mode === 'live' ? 'info' : 'warning'}>{account.mode === 'live' ? 'Live mode' : 'Test mode'}</Tag>
            </>
          ) : (
            <Tag tone="warning">Not connected</Tag>
          )}
        </div>
        {account && (
          <div className="flex items-center gap-ds-2">
            <Button size="sm" variant="outline" onClick={handleTest} disabled={testing}>
              {testing ? 'Testing…' : 'Test connection'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing((v) => !v)}>
              {editing ? 'Close' : 'Change keys'}
            </Button>
            <Button size="sm" variant="outline" onClick={handleToggle}>
              {account.isActive ? 'Pause' : 'Resume'}
            </Button>
            <Button size="icon-sm" variant="ghost" className="text-ds-danger hover:text-ds-danger" aria-label={`Disconnect ${gateway.name}`} onClick={handleRemove}>
              <Trash2 className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>

      <p className="text-xs text-ds-foreground-muted">{gateway.hint}</p>
      {gateway.id === 'stripe' && <p className="text-xs text-ds-foreground-muted" data-testid="stripe-methods-hint">{t('payments.gateway.stripeHint')}</p>}

      {account && (
        <dl className="grid grid-cols-1 gap-ds-2 text-sm sm:grid-cols-3">
          {needsKeyId && (
            <div>
              <dt className="text-xs text-ds-foreground-muted">{gateway.keyIdLabel}</dt>
              <dd className="font-mono">{account.keyIdLast4 ? `…${account.keyIdLast4}` : 'Not set'}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-ds-foreground-muted">{gateway.secretLabel}</dt>
            <dd className="font-mono">{account.keyConfigured ? `Configured ····${account.secretLast4 ?? ''}` : 'Not set'}</dd>
          </div>
          <div>
            <dt className="text-xs text-ds-foreground-muted">Webhook secret</dt>
            <dd className="font-mono">{account.webhookSecretConfigured ? 'Configured' : 'Not set'}</dd>
          </div>
        </dl>
      )}

      {testResult && (
        <p role="status" className={testResult.ok ? 'text-sm text-ds-success' : 'text-sm text-ds-danger'}>
          {testResult.ok ? 'Connection works.' : testResult.message}
        </p>
      )}

      {editing && (
        <div className="flex flex-col gap-ds-3 border-t border-ds-border pt-ds-3">
          <div className="grid grid-cols-1 gap-ds-3 md:grid-cols-2">
            <div className="flex flex-col gap-ds-2">
              <Label htmlFor={`${gateway.id}-mode`}>Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as 'test' | 'live')}>
                <SelectTrigger id={`${gateway.id}-mode`} className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="test">Test</SelectItem>
                  <SelectItem value="live">Live</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {needsKeyId && (
              <div className="flex flex-col gap-ds-2">
                <Label htmlFor={`${gateway.id}-key-id`}>{gateway.keyIdLabel}</Label>
                <Input id={`${gateway.id}-key-id`} autoComplete="off" placeholder={account ? 'Leave blank to keep the saved one' : 'rzp_test_...'} value={keyId} onChange={(e) => setKeyId(e.target.value)} />
              </div>
            )}
            <div className="flex flex-col gap-ds-2">
              <Label htmlFor={`${gateway.id}-secret`}>{gateway.secretLabel}</Label>
              <Input id={`${gateway.id}-secret`} type="password" autoComplete="off" placeholder={account ? 'Leave blank to keep the saved one' : ''} value={secret} onChange={(e) => setSecret(e.target.value)} />
            </div>
            <div className="flex flex-col gap-ds-2">
              <Label htmlFor={`${gateway.id}-webhook-secret`}>Webhook secret</Label>
              <Input id={`${gateway.id}-webhook-secret`} type="password" autoComplete="off" placeholder={account?.webhookSecretConfigured ? 'Leave blank to keep the saved one' : ''} value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} />
            </div>
          </div>
          <div>
            <Button onClick={handleSave} disabled={!canSave || saving}>
              {saving ? 'Saving…' : account ? 'Save changes' : `Connect ${gateway.name}`}
            </Button>
          </div>
        </div>
      )}

      {account?.webhookUrl && (
        <div className="flex flex-col gap-ds-2 border-t border-ds-border pt-ds-3">
          <Label htmlFor={`${gateway.id}-payment-webhook-url`}>Webhook URL for {gateway.name}</Label>
          <CopyField id={`${gateway.id}-payment-webhook-url`} value={account.webhookUrl} label={`Copy ${gateway.name} payment webhook URL`} />
          <p className="text-xs text-ds-foreground-muted">{gateway.webhookHint}</p>
        </div>
      )}
    </div>
  );
}

/** The test gateway (R142): offered only where the API says it is available (local and test stacks). Holds no keys. */
function MockGatewayCard({ account, onChanged }: { account: PaymentGatewayAccount | undefined; onChanged: () => void }) {
  const t = useT();
  const [busy, setBusy] = React.useState(false);

  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(done);
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err, t('payments.gateway.mock.failed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-ds-3 rounded-ds-md border border-ds-border p-ds-3" data-testid="payment-gateway-mock">
      <div className="flex flex-wrap items-center justify-between gap-ds-2">
        <div className="flex items-center gap-ds-2">
          <Plug className="size-4 text-ds-foreground-muted" aria-hidden="true" />
          <span className="text-sm font-semibold">{t('payments.gateway.mock.name')}</span>
          <Tag tone={account ? 'success' : 'warning'}>{account ? t('payments.gateway.mock.connected') : t('payments.gateway.mock.notConnected')}</Tag>
        </div>
        {account ? (
          <Button
            size="icon-sm"
            variant="ghost"
            className="text-ds-danger hover:text-ds-danger"
            aria-label={t('payments.gateway.mock.disconnect')}
            disabled={busy}
            onClick={() => void run(() => integrationsApi.removePaymentGateway('mock'), t('payments.gateway.mock.removed'))}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={busy}
            data-testid="payment-gateway-mock-connect"
            onClick={() => void run(() => integrationsApi.savePaymentGateway('mock', {}), t('payments.gateway.mock.saved'))}
          >
            {t('payments.gateway.mock.connect')}
          </Button>
        )}
      </div>
      <p className="text-xs text-ds-foreground-muted">{t('payments.gateway.mock.hint')}</p>
    </div>
  );
}

/** Settings > Integrations: the agency's own Razorpay or Stripe account, used to collect from its customers. */
export function PaymentGateways() {
  const { data, loading, error, refetch } = useApiQuery(() => integrationsApi.listPaymentGateways(), []);
  const accounts: PaymentGatewayAccount[] = data?.data?.accounts ?? [];

  return (
    <SectionCard
      title="Online payments from your customers"
      description="Connect your own Razorpay or Stripe account to send customers a link to pay an invoice. The money goes straight to your account."
      actions={<CreditCard className="size-4 text-ds-foreground-muted" aria-hidden="true" />}
    >
      <div className="flex flex-col gap-ds-3">
        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : error ? (
          <p className="text-sm text-ds-foreground-muted">Only administrators can manage payment gateways.</p>
        ) : (
          [
            ...GATEWAYS.map((gateway) => (
            <GatewayCard
              key={gateway.id}
              gateway={gateway}
              account={accounts.find((a) => a.gateway === gateway.id)}
              onChanged={() => void refetch({ silent: true })}
            />
            )),
            ...(data?.data?.mockAvailable
              ? [<MockGatewayCard key="mock" account={accounts.find((a) => a.gateway === 'mock')} onChanged={() => void refetch({ silent: true })} />]
              : []),
          ]
        )}
      </div>
    </SectionCard>
  );
}
