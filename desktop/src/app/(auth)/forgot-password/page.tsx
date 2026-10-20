'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Mail, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { authApi, type ForgotPasswordRequest } from '@/lib/api/auth';
import { useT } from '@/lib/i18n';

export default function ForgotPasswordPage() {
  const t = useT();
  const [email, setEmail] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      if (!email) {
        setError(t('auth.login.emailRequired'));
        setIsLoading(false);
        return;
      }

      const request: ForgotPasswordRequest = { email };
      await authApi.forgotPassword(request);

      setSent(true);
      toast.success(t('auth.forgot.sent'));
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : t('auth.forgot.failed');
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-ds-success-subtle">
          <CheckCircle2 className="h-8 w-8 text-ds-success" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>{t('auth.forgot.checkEmailTitle')}</h2>
          <p className="text-muted-foreground text-sm mt-2">
            {t('auth.forgot.checkEmailBody')}<br />
            <span className="font-medium text-foreground">{email}</span>
          </p>
        </div>
        <div className="space-y-3">
          <Button variant="outline" className="w-full" onClick={() => setSent(false)}>
            {t('auth.forgot.tryDifferent')}
          </Button>
          <Link href="/login" className="block text-sm text-primary hover:underline">
            {t('auth.common.backToSignIn')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/login" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {t('auth.common.backToSignIn')}
      </Link>

      <div>
        <h2 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>{t('auth.login.forgotPassword')}</h2>
        <p className="text-muted-foreground text-sm mt-1">
          {t('auth.forgot.subtitle')}
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">{t('auth.fields.email')}</Label>
          <div className="relative">
            <Mail className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="ps-9"
              required
              autoFocus
            />
          </div>
        </div>

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
          {t('auth.forgot.submit')}
        </Button>
      </form>
    </div>
  );
}
