'use client';

import * as React from 'react';
import { Check, Copy, MessageCircle, Plug, Trash2 } from 'lucide-react';
import {
  Button, Input, Label, SectionCard, Skeleton, Tag, useConfirm,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui';
import { toast } from 'sonner';
import { useApiQuery } from '@/hooks/use-api';
import { integrationsApi, type WhatsAppProviderId, type WhatsAppSettings } from '@/lib/api/integrations';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

function CopyField({ id, value, label, copied: copiedMessage }: { id: string; value: string; label: string; copied: string }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(copiedMessage);
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

const PROVIDER_LABEL: Record<WhatsAppProviderId, string> = { meta: 'WhatsApp Cloud API (Meta)', twilio: 'Twilio' };

function MetaForm({ settings, onChanged }: { settings: WhatsAppSettings; onChanged: () => void }) {
  const { confirm, dialog } = useConfirm();
  const account = settings.account;
  const [editing, setEditing] = React.useState(!account);
  const [phoneNumberId, setPhoneNumberId] = React.useState(account?.phoneNumberId ?? '');
  const [wabaId, setWabaId] = React.useState(account?.wabaId ?? '');
  const [token, setToken] = React.useState('');
  const [appSecret, setAppSecret] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<{ ok: boolean; message: string } | null>(null);

  React.useEffect(() => {
    if (account) {
      setPhoneNumberId(account.phoneNumberId);
      setWabaId(account.wabaId ?? '');
    }
  }, [account]);

  const canSave = phoneNumberId.trim().length >= 5 && (!!account || token.trim().length >= 16 || settings.platformTokenAvailable);

  const handleSave = async () => {
    setSaving(true);
    try {
      await integrationsApi.saveWhatsAppMeta({
        phoneNumberId: phoneNumberId.trim() || undefined,
        wabaId: wabaId.trim() || undefined,
        accessToken: token.trim() || undefined,
        appSecret: appSecret.trim() || undefined,
      });
      toast.success('WhatsApp number saved');
      // The secrets are never shown again: clear them from the form as soon as they are saved.
      setToken('');
      setAppSecret('');
      setEditing(false);
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save the WhatsApp number'));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await integrationsApi.testWhatsAppMeta();
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
      await integrationsApi.saveWhatsAppMeta({ isActive: !account.isActive });
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not update WhatsApp'));
    }
  };

  const handleRemove = async () => {
    const ok = await confirm({
      title: 'Disconnect this WhatsApp number?',
      description: 'Messages to this number will no longer arrive here and nothing will be sent from it.',
      confirmLabel: 'Disconnect',
      tone: 'destructive',
    });
    if (!ok) return;
    try {
      await integrationsApi.removeWhatsAppMeta();
      toast.success('WhatsApp number disconnected');
      setEditing(true);
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not disconnect'));
    }
  };

  return (
    <div className="flex flex-col gap-ds-3 rounded-ds-md border border-ds-border p-ds-3" data-testid="whatsapp-meta-account">
      {dialog}
      <div className="flex flex-wrap items-center justify-between gap-ds-2">
        <div className="flex items-center gap-ds-2">
          <Plug className="size-4 text-ds-foreground-muted" aria-hidden="true" />
          <span className="text-sm font-semibold">Your WhatsApp number on Meta</span>
          {account ? (
            <Tag tone={account.isActive ? 'success' : 'warning'}>{account.isActive ? 'Connected' : 'Paused'}</Tag>
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
              {editing ? 'Close' : 'Change details'}
            </Button>
            <Button size="sm" variant="outline" onClick={handleToggle}>
              {account.isActive ? 'Pause' : 'Resume'}
            </Button>
            <Button size="icon-sm" variant="ghost" className="text-ds-danger hover:text-ds-danger" aria-label="Disconnect WhatsApp number" onClick={handleRemove}>
              <Trash2 className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>

      <p className="text-xs text-ds-foreground-muted">
        Messages go straight through Meta, with no reseller fee. In Meta Business Suite create a WhatsApp Business account and a system-user access token, then paste the phone number id and token here.
        Free-form replies work for 24 hours after the customer writes; otherwise an approved template is sent.
      </p>

      {account && (
        <dl className="grid grid-cols-1 gap-ds-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-ds-foreground-muted">Phone number id</dt>
            <dd className="font-mono">{account.phoneNumberId}</dd>
          </div>
          <div>
            <dt className="text-xs text-ds-foreground-muted">Access token</dt>
            <dd className="font-mono">{account.tokenConfigured ? `Configured ····${account.tokenLast4 ?? ''}` : settings.platformTokenAvailable ? 'Using the platform token' : 'Not set'}</dd>
          </div>
          <div>
            <dt className="text-xs text-ds-foreground-muted">App secret</dt>
            <dd className="font-mono">{account.appSecretConfigured ? 'Configured' : 'Using the platform app'}</dd>
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
              <Label htmlFor="wa-meta-phone-id">Phone number id</Label>
              <Input id="wa-meta-phone-id" autoComplete="off" inputMode="numeric" value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} />
            </div>
            <div className="flex flex-col gap-ds-2">
              <Label htmlFor="wa-meta-waba-id">WhatsApp Business Account id (optional)</Label>
              <Input id="wa-meta-waba-id" autoComplete="off" inputMode="numeric" value={wabaId} onChange={(e) => setWabaId(e.target.value)} />
            </div>
            <div className="flex flex-col gap-ds-2">
              <Label htmlFor="wa-meta-token">Access token</Label>
              <Input id="wa-meta-token" type="password" autoComplete="off" placeholder={account?.tokenConfigured ? 'Leave blank to keep the saved one' : ''} value={token} onChange={(e) => setToken(e.target.value)} />
            </div>
            <div className="flex flex-col gap-ds-2">
              <Label htmlFor="wa-meta-app-secret">App secret</Label>
              <Input id="wa-meta-app-secret" type="password" autoComplete="off" placeholder={account?.appSecretConfigured ? 'Leave blank to keep the saved one' : 'Needed to verify messages from your own Meta app'} value={appSecret} onChange={(e) => setAppSecret(e.target.value)} />
            </div>
          </div>
          <div>
            <Button onClick={handleSave} disabled={!canSave || saving}>
              {saving ? 'Saving…' : account ? 'Save changes' : 'Connect WhatsApp'}
            </Button>
          </div>
        </div>
      )}

      {account && (
        <div className="flex flex-col gap-ds-2 border-t border-ds-border pt-ds-3">
          <Label htmlFor="wa-meta-webhook-url">Callback URL for your Meta app</Label>
          <CopyField id="wa-meta-webhook-url" value={settings.webhookUrl} label="Copy WhatsApp callback URL" copied="Callback URL copied" />
          {settings.verifyToken && (
            <>
              <Label htmlFor="wa-meta-verify-token">Verify token</Label>
              <CopyField id="wa-meta-verify-token" value={settings.verifyToken} label="Copy WhatsApp verify token" copied="Verify token copied" />
            </>
          )}
          <p className="text-xs text-ds-foreground-muted">
            In your Meta app, open WhatsApp &gt; Configuration, paste both, verify, and subscribe to the &quot;messages&quot; field.
          </p>
        </div>
      )}
    </div>
  );
}

/** Settings > Integrations: which service sends WhatsApp, and the agency's own number on Meta's WhatsApp Cloud API. */
export function WhatsAppMeta() {
  const { data, loading, error, refetch } = useApiQuery(() => integrationsApi.getWhatsApp(), []);
  const settings: WhatsAppSettings | undefined = data?.data;
  const [switching, setSwitching] = React.useState(false);

  const choose = async (provider: WhatsAppProviderId) => {
    if (!settings || provider === settings.provider) return;
    setSwitching(true);
    try {
      await integrationsApi.setWhatsAppProvider(provider);
      toast.success(`WhatsApp now goes through ${PROVIDER_LABEL[provider]}`);
      void refetch({ silent: true });
    } catch (err) {
      toast.error(errorMessage(err, 'Could not change the WhatsApp provider'));
    } finally {
      setSwitching(false);
    }
  };

  return (
    <SectionCard
      title="WhatsApp"
      description="Choose how WhatsApp messages are sent and received. Meta's own WhatsApp Cloud API has no per-message reseller fee."
      actions={<MessageCircle className="size-4 text-ds-foreground-muted" aria-hidden="true" />}
    >
      <div className="flex flex-col gap-ds-3">
        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : error || !settings ? (
          <p className="text-sm text-ds-foreground-muted">Only administrators can manage WhatsApp.</p>
        ) : (
          <>
            <div className="flex flex-col gap-ds-2 md:max-w-sm">
              <Label htmlFor="wa-provider">Send WhatsApp through</Label>
              <Select value={settings.provider} onValueChange={(v) => void choose(v as WhatsAppProviderId)} disabled={switching}>
                <SelectTrigger id="wa-provider" className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="meta">{PROVIDER_LABEL.meta}</SelectItem>
                  <SelectItem value="twilio">{PROVIDER_LABEL.twilio}</SelectItem>
                </SelectContent>
              </Select>
              {!settings.providerExplicit && (
                <p className="text-xs text-ds-foreground-muted">Default for your workspace. Pick one to keep it.</p>
              )}
            </div>
            <MetaForm settings={settings} onChanged={() => void refetch({ silent: true })} />
          </>
        )}
      </div>
    </SectionCard>
  );
}
