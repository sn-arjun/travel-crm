'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Lock, Eye, EyeOff, CheckCircle2, User as UserIcon, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth-store';
import { passwordPolicyError } from '@/lib/api/auth';
import { useT } from '@/lib/i18n';
import { client, type ApiResponse } from '@/lib/api/client';
import type { User, Tenant } from '@travelcrm/shared';

interface SetupAccountResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
  tenant: Tenant;
}

export default function SetupAccountPageWrapper() {
  return (
    <React.Suspense
      fallback={
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <SetupAccountPage />
    </React.Suspense>
  );
}

function SetupAccountPage() {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams?.get('token') || '';
  const { setAuth } = useAuthStore();

  const [name, setName] = React.useState('');
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

  if (!token) {
    return (
      <div className="space-y-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-ds-warning-subtle">
          <AlertTriangle className="h-8 w-8 text-ds-warning" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            {t('auth.setup.invalidTitle')}
          </h2>
          <p className="text-muted-foreground text-sm mt-2">
            {t('auth.setup.invalidBody')}
          </p>
        </div>
        <Button className="w-full" onClick={() => router.push('/login')}>
          {t('auth.setup.goToSignIn')}
        </Button>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError(t('auth.setup.nameRequired'));
      return;
    }
    const policy = passwordPolicyError(password, t);
    if (policy) {
      setError(policy);
      return;
    }
    if (password !== confirmPassword) {
      setError(t('auth.password.mismatch'));
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      const response = await client.post<ApiResponse<SetupAccountResponse>>(
        '/auth/setup-account',
        { token, name: name.trim(), password, confirmPassword },
      );

      if (response.data) {
        const { accessToken, refreshToken, user, tenant } = response.data;
        setAuth({ accessToken, refreshToken, user, tenant });
        setSuccess(true);
        toast.success(t('auth.setup.success'));
        setTimeout(() => router.push('/'), 2000);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('auth.setup.failed');
      setError(msg);
      toast.error(msg);
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
          <h2 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            {t('auth.setup.doneTitle')}
          </h2>
          <p className="text-muted-foreground text-sm mt-2">
            {t('auth.setup.doneBody')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
          {t('auth.setup.title')}
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          {t('auth.setup.subtitle')}
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">{t('auth.fields.fullName')}</Label>
          <div className="relative">
            <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="name"
              type="text"
              placeholder={t('auth.setup.namePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="pl-9"
              required
              autoFocus
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">{t('auth.fields.password')}</Label>
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
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full ${
                      i <= passwordStrength.score
                        ? passwordStrength.score <= 1
                          ? 'bg-ds-danger'
                          : passwordStrength.score <= 2
                            ? 'bg-ds-warning'
                            : 'bg-ds-success'
                        : 'bg-muted'
                    }`}
                  />
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
          {t('auth.setup.submit')}
        </Button>
      </form>

      <div className="text-center text-sm text-muted-foreground">
        {t('auth.setup.haveAccount')}{' '}
        <a href="/login" className="text-primary hover:underline">
          {t('auth.login.signIn')}
        </a>
      </div>
    </div>
  );
}
