'use client';

import * as React from 'react';
import { CheckCircle2, Circle, Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Input, Label } from '@/components/ui';
import { authApi, passwordPolicyError, PASSWORD_MIN_LENGTH } from '@/lib/api/auth';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils';

interface ChangePasswordFormProps {
  /** Called after the password was changed and the session carries the fresh token. */
  onDone: () => void;
  /** Label of the current-password field; a first login names the temporary password. */
  currentLabel?: string;
  className?: string;
}

function Rule({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  const Icon = ok ? CheckCircle2 : Circle;
  return (
    <li className={cn('flex items-center gap-ds-2 text-xs', ok ? 'text-ds-success' : 'text-ds-foreground-muted')}>
      <Icon className="size-3.5" aria-hidden="true" />
      {children}
    </li>
  );
}

/** Current / new / confirm password with a live strength hint. Shared by the forced first-login screen and Settings > Security. */
export function ChangePasswordForm({ onDone, currentLabel = 'Current password', className }: ChangePasswordFormProps) {
  const [current, setCurrent] = React.useState('');
  const [next, setNext] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [show, setShow] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  const longEnough = next.length >= PASSWORD_MIN_LENGTH;
  const hasLetter = /[A-Za-z]/.test(next);
  const hasDigit = /[0-9]/.test(next);
  const matches = next.length > 0 && next === confirm;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const policy = passwordPolicyError(next);
    if (policy) return setError(policy);
    if (next !== confirm) return setError('The new passwords do not match');
    if (next === current) return setError('Choose a password different from the current one');

    setBusy(true);
    try {
      const res = await authApi.changePassword({ currentPassword: current, newPassword: next });
      const store = useAuthStore.getState();
      // The API revoked the other sessions and kept this one; swap in the token without the restriction.
      if (res.data?.accessToken && store.refreshToken) store.setTokens(res.data.accessToken, store.refreshToken);
      store.setMustChangePassword(false);
      toast.success('Password changed');
      onDone();
    } catch (err) {
      const message = (err as { message?: string } | null)?.message || 'Could not change the password';
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-ds-4', className)} noValidate>
      {error && (
        <div role="alert" className="rounded-ds-md border border-ds-danger bg-ds-danger-subtle px-ds-3 py-ds-2 text-sm text-ds-danger">
          {error}
        </div>
      )}

      <div className="space-y-ds-2">
        <Label htmlFor="currentPassword">{currentLabel}</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ds-foreground-muted" aria-hidden="true" />
          <Input
            id="currentPassword"
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>
      </div>

      <div className="space-y-ds-2">
        <Label htmlFor="newPassword">New password</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ds-foreground-muted" aria-hidden="true" />
          <Input
            id="newPassword"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className="pl-9 pr-10"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? 'Hide passwords' : 'Show passwords'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ds-foreground-muted hover:text-ds-foreground"
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        <ul className="space-y-ds-1" aria-label="Password requirements">
          <Rule ok={longEnough}>At least {PASSWORD_MIN_LENGTH} characters</Rule>
          <Rule ok={hasLetter}>One letter</Rule>
          <Rule ok={hasDigit}>One digit</Rule>
        </ul>
      </div>

      <div className="space-y-ds-2">
        <Label htmlFor="confirmPassword">Confirm new password</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ds-foreground-muted" aria-hidden="true" />
          <Input
            id="confirmPassword"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="pl-9"
          />
        </div>
        {confirm.length > 0 && !matches && <p className="text-xs text-ds-danger">The passwords do not match</p>}
      </div>

      <Button type="submit" className="w-full" disabled={busy || !current || !next || !confirm}>
        {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
        Change password
      </Button>
    </form>
  );
}
