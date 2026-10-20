'use client';

import * as React from 'react';
import { Check, Copy, Download, Loader2, ShieldCheck, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button, Input, Label, SectionCard, Switch } from '@/components/ui';
import { QrCode } from '@/components/auth/qr-code';
import { authApi, type TwoFactorSetupResponse, type TwoFactorStatus } from '@/lib/api/auth';
import { useAuthStore } from '@/stores/auth-store';

type Mode = 'idle' | 'password' | 'scan' | 'codes' | 'disable' | 'regenerate';

function errorMessage(err: unknown, fallback: string): string {
  return (err as { message?: string } | null)?.message || fallback;
}

/** The recovery codes as a plain-text file the person can keep somewhere safe. */
export function recoveryCodesFile(codes: string[], account: string): string {
  return [
    'TravelCRM Pro recovery codes',
    `Account: ${account}`,
    '',
    'Each code works once if you cannot use your authenticator app.',
    'Keep this file somewhere safe and private.',
    '',
    ...codes,
    '',
  ].join('\n');
}

function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Settings > Security: turn two-factor sign-in on (QR code, confirm with a code, save recovery codes) or off. */
export function TwoFactorCard() {
  const user = useAuthStore((s) => s.user);
  const [status, setStatus] = React.useState<TwoFactorStatus | null>(null);
  const [loadError, setLoadError] = React.useState('');
  const [mode, setMode] = React.useState<Mode>('idle');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [code, setCode] = React.useState('');
  const [setup, setSetup] = React.useState<TwoFactorSetupResponse | null>(null);
  const [recoveryCodes, setRecoveryCodes] = React.useState<string[]>([]);
  const [saved, setSaved] = React.useState(false);
  const isAdmin = user?.role === 'admin';

  const refresh = React.useCallback(async () => {
    try {
      const res = await authApi.twoFactorStatus();
      setStatus(res.data);
      setLoadError('');
    } catch (err) {
      setLoadError(errorMessage(err, 'Could not load the two-factor status'));
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  function reset(next: Mode = 'idle') {
    setMode(next);
    setError('');
    setPassword('');
    setCode('');
    setBusy(false);
  }

  async function startSetup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await authApi.twoFactorSetup({ password });
      setSetup(res.data);
      setPassword('');
      setCode('');
      setMode('scan');
    } catch (err) {
      setError(errorMessage(err, 'Could not start the setup'));
    } finally {
      setBusy(false);
    }
  }

  async function confirmSetup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await authApi.twoFactorEnable({ code: code.trim() });
      const store = useAuthStore.getState();
      // The new token carries no "set up two-factor first" restriction.
      if (res.data.accessToken && store.refreshToken) store.setTokens(res.data.accessToken, store.refreshToken);
      store.setTwoFactorSetupRequired(false);
      setRecoveryCodes(res.data.recoveryCodes);
      setSaved(false);
      setSetup(null);
      setCode('');
      setMode('codes');
      toast.success('Two-factor sign-in is on');
      void refresh();
    } catch (err) {
      setError(errorMessage(err, 'That code is not right'));
    } finally {
      setBusy(false);
    }
  }

  async function submitPasswordAndCode(e: React.FormEvent, action: 'disable' | 'regenerate') {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (action === 'disable') {
        await authApi.twoFactorDisable({ password, code: code.trim() });
        toast.success('Two-factor sign-in is off');
        reset();
      } else {
        const res = await authApi.twoFactorRecoveryCodes({ password, code: code.trim() });
        setRecoveryCodes(res.data.recoveryCodes);
        setSaved(false);
        setMode('codes');
        setPassword('');
        setCode('');
      }
      void refresh();
    } catch (err) {
      setError(errorMessage(err, 'That did not work'));
    } finally {
      setBusy(false);
    }
  }

  async function togglePolicy(required: boolean) {
    try {
      await authApi.setTwoFactorPolicy({ required });
      setStatus((s) => (s ? { ...s, required } : s));
      toast.success(required ? 'Everyone must now use two-factor sign-in' : 'Two-factor sign-in is optional again');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not change the requirement'));
    }
  }

  async function copyCodes() {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join('\n'));
      toast.success('Recovery codes copied');
    } catch {
      toast.error('Could not copy. Select the codes and copy them by hand.');
    }
  }

  const enabled = status?.enabled === true;

  return (
    <SectionCard
      title="Two-factor authentication"
      description="Ask for a code from an authenticator app each time you sign in."
      actions={status ? <Badge variant={enabled ? 'default' : 'secondary'}>{enabled ? 'On' : 'Off'}</Badge> : undefined}
    >
      <div className="space-y-ds-4" data-testid="two-factor-card">
        {loadError && (
          <p role="alert" className="text-sm text-ds-danger">
            {loadError}
          </p>
        )}
        {!status && !loadError && (
          <div className="flex items-center gap-ds-2 text-sm text-ds-foreground-muted">
            <Loader2 className="size-4 animate-spin" /> Loading
          </div>
        )}

        {error && (
          <div role="alert" className="rounded-ds-md border border-ds-danger bg-ds-danger-subtle px-ds-3 py-ds-2 text-sm text-ds-danger">
            {error}
          </div>
        )}

        {status && mode === 'idle' && !enabled && (
          <div className="space-y-ds-3">
            <div className="flex items-start gap-ds-3 text-sm text-ds-foreground-muted">
              <Smartphone className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <p>
                Works with Google Authenticator, Microsoft Authenticator, Authy, 1Password and similar apps. You will also get
                recovery codes for the day your phone is lost.
              </p>
            </div>
            <Button onClick={() => reset('password')} data-testid="two-factor-start">
              Turn on two-factor sign-in
            </Button>
          </div>
        )}

        {status && mode === 'idle' && enabled && (
          <div className="space-y-ds-4">
            <p className="flex items-center gap-ds-2 text-sm text-ds-foreground-muted">
              <ShieldCheck className="size-4 text-ds-success" aria-hidden="true" />
              Sign-in asks for a code. {status.recoveryCodesRemaining} recovery {status.recoveryCodesRemaining === 1 ? 'code is' : 'codes are'} left.
            </p>
            <div className="flex flex-wrap gap-ds-2">
              <Button variant="outline" onClick={() => reset('regenerate')}>
                New recovery codes
              </Button>
              <Button variant="outline" onClick={() => reset('disable')} disabled={status.required} data-testid="two-factor-disable-start">
                Turn off
              </Button>
            </div>
            {status.required && (
              <p className="text-xs text-ds-foreground-muted">Your agency requires two-factor sign-in, so it cannot be turned off.</p>
            )}
            {isAdmin && (
              <div className="flex items-center justify-between gap-ds-4 border-t border-ds-border pt-ds-4">
                <div>
                  <Label htmlFor="require-two-factor">Require for everyone</Label>
                  <p className="text-xs text-ds-foreground-muted">Users who have not set it up are asked to the next time they sign in.</p>
                </div>
                <Switch id="require-two-factor" checked={status.required} onCheckedChange={(v) => void togglePolicy(v)} />
              </div>
            )}
          </div>
        )}

        {mode === 'password' && (
          <form onSubmit={startSetup} className="max-w-md space-y-ds-3">
            <div className="space-y-ds-2">
              <Label htmlFor="two-factor-password">Confirm with your password</Label>
              <Input
                id="two-factor-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex gap-ds-2">
              <Button type="submit" disabled={busy || !password}>
                {busy && <Loader2 className="me-2 size-4 animate-spin" />}
                Continue
              </Button>
              <Button type="button" variant="ghost" onClick={() => reset()}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {mode === 'scan' && setup && (
          <form onSubmit={confirmSetup} className="space-y-ds-4">
            <ol className="list-decimal space-y-ds-1 ps-ds-5 text-sm text-ds-foreground-muted">
              <li>Open your authenticator app and add an account.</li>
              <li>Scan this code, or type the key by hand.</li>
              <li>Enter the 6-digit code the app shows.</li>
            </ol>
            <div className="flex flex-wrap items-start gap-ds-6">
              <QrCode value={setup.otpauthUri} label="Authenticator setup code" className="rounded-ds-md border border-ds-border" />
              <div className="min-w-0 space-y-ds-2">
                <Label>Key for manual entry</Label>
                <code data-testid="two-factor-secret" className="block break-all rounded-ds-md bg-ds-surface-sunken px-ds-3 py-ds-2 font-mono text-sm">
                  {setup.secret}
                </code>
                <p className="text-xs text-ds-foreground-muted">
                  Account: {setup.account}. Time based, 6 digits. This key is shown only now.
                </p>
              </div>
            </div>
            <div className="max-w-xs space-y-ds-2">
              <Label htmlFor="two-factor-code">Code from the app</Label>
              <Input
                id="two-factor-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                className="font-mono tracking-widest"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            </div>
            <div className="flex gap-ds-2">
              <Button type="submit" disabled={busy || code.length !== 6} data-testid="two-factor-confirm">
                {busy && <Loader2 className="me-2 size-4 animate-spin" />}
                Turn on
              </Button>
              <Button type="button" variant="ghost" onClick={() => reset()}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {mode === 'codes' && (
          <div className="space-y-ds-4" data-testid="two-factor-recovery">
            <p className="text-sm text-ds-foreground-muted">
              Save these recovery codes now. Each works once if you cannot use your authenticator app. They are not shown again.
            </p>
            <ul className="grid max-w-md grid-cols-2 gap-ds-2 font-mono text-sm" data-testid="two-factor-recovery-codes">
              {recoveryCodes.map((c) => (
                <li key={c} className="rounded-ds-md bg-ds-surface-sunken px-ds-3 py-ds-1">
                  {c}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-ds-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => downloadText('travelcrm-recovery-codes.txt', recoveryCodesFile(recoveryCodes, user?.email ?? ''))}
              >
                <Download className="me-2 size-4" /> Download
              </Button>
              <Button type="button" variant="outline" onClick={() => void copyCodes()}>
                <Copy className="me-2 size-4" /> Copy
              </Button>
            </div>
            <label className="flex items-center gap-ds-2 text-sm">
              <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} data-testid="two-factor-saved" />
              I have saved these codes
            </label>
            <Button
              disabled={!saved}
              onClick={() => {
                setRecoveryCodes([]);
                reset();
              }}
              data-testid="two-factor-done"
            >
              <Check className="me-2 size-4" /> Done
            </Button>
          </div>
        )}

        {(mode === 'disable' || mode === 'regenerate') && (
          <form onSubmit={(e) => void submitPasswordAndCode(e, mode)} className="max-w-md space-y-ds-3">
            <p className="text-sm text-ds-foreground-muted">
              {mode === 'disable' ? 'Turn off two-factor sign-in.' : 'Make a new set of recovery codes. The old ones stop working.'} Enter your
              password and a code from your app (or a recovery code).
            </p>
            <div className="space-y-ds-2">
              <Label htmlFor="two-factor-password">Password</Label>
              <Input
                id="two-factor-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-ds-2">
              <Label htmlFor="two-factor-code">Code</Label>
              <Input
                id="two-factor-code"
                autoComplete="one-time-code"
                placeholder="000000"
                className="font-mono tracking-widest"
                value={code}
                onChange={(e) => setCode(e.target.value.slice(0, 16))}
              />
            </div>
            <div className="flex gap-ds-2">
              <Button type="submit" disabled={busy || !password || !code.trim()} variant={mode === 'disable' ? 'destructive' : 'default'}>
                {busy && <Loader2 className="me-2 size-4 animate-spin" />}
                {mode === 'disable' ? 'Turn off' : 'Make new codes'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => reset()}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </SectionCard>
  );
}
