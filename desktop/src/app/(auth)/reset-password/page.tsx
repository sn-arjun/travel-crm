'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Lock, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { authApi, passwordPolicyError, type ResetPasswordRequest } from '@/lib/api/auth';
import { useT } from '@/lib/i18n';

export default function ResetPasswordPageWrapper() {
  return (
    <React.Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
      <ResetPasswordPage />
    </React.Suspense>
  );
}

function ResetPasswordPage() {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams?.get('token') || '';
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [success, setSuccess] = React.useState(false);
  const [error, setError] = React.useState('');

  const passwordStrength = React.useMemo(() => {
    if (!password) return { score: 0, label: '' };
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    const labels = ['', t('auth.password.strength.weak'), t('auth.password.strength.fair'), t('auth.password.strength.good'), t('auth.password.strength.strong')];
    return { score, label: labels[score] || '' };
  }, [password, t]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError(t('auth.password.mismatch'));
      return;
    }
    const policy = passwordPolicyError(password, t);
    if (policy) {
      setError(policy);
      return;
    }
    if (!token) {
      setError(t('auth.reset.tokenMissing'));
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const request: ResetPasswordRequest = {
        token,
        password,
        confirmPassword,
      };
      await authApi.resetPassword(request);

      setSuccess(true);
      toast.success(t('auth.reset.success'));
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : t('auth.reset.failed');
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }

  if (success) {
    return (
      <div className="space-y-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-ds-success-subtle">
          <CheckCircle2 className="h-8 w-8 text-ds-success" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>{t('auth.reset.doneTitle')}</h2>
          <p className="text-muted-foreground text-sm mt-2">{t('auth.reset.doneBody')}</p>
        </div>
        <Button className="w-full" onClick={() => router.push('/login')}>
          {t('auth.reset.signInWithNew')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>{t('auth.reset.title')}</h2>
        <p className="text-muted-foreground text-sm mt-1">{t('auth.reset.subtitle')}</p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">{t('auth.fields.newPassword')}</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder={t('auth.password.placeholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-9 pr-10"
              required
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {password && (
            <div className="space-y-1">
              <div className="flex gap-1">
                {[1, 2, 3, 4].map((i: number) => (
                  <div key={i} className={`h-1 flex-1 rounded-full ${i <= passwordStrength.score ? (passwordStrength.score <= 1 ? 'bg-ds-danger' : passwordStrength.score <= 2 ? 'bg-ds-warning' : 'bg-ds-success') : 'bg-muted'}`} />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{passwordStrength.label}</p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">{t('auth.fields.confirmPassword')}</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              placeholder={t('auth.password.reenter')}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="pl-9"
              required
            />
          </div>
        </div>

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('auth.reset.submit')}
        </Button>
      </form>

      <Link href="/login" className="block text-center text-sm text-primary hover:underline">
        {t('auth.common.backToSignIn')}
      </Link>
    </div>
  );
}
