'use client';

import { defaultCountryCode } from '@/lib/phone';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2, Mail, Lock, Phone, ArrowLeft, Building2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth-store';
import { authApi, isTwoFactorChallenge, type LoginResponse, type ResolvedTenant } from '@/lib/api/auth';
import { ServerAddress } from './_components/server-address';
import { useT } from '@/lib/i18n';

type Step = 'email' | 'password' | 'code';

export default function LoginPage() {
  const t = useT();
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [showPassword, setShowPassword] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [step, setStep] = React.useState<Step>('email');
  const [otpSent, setOtpSent] = React.useState(false);

  // Email login
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');

  // Tenant resolution
  const [resolvedTenants, setResolvedTenants] = React.useState<ResolvedTenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = React.useState('');

  // Second step (two-factor sign-in)
  const [challengeToken, setChallengeToken] = React.useState('');
  const [twoFactorCode, setTwoFactorCode] = React.useState('');
  const [useRecoveryCode, setUseRecoveryCode] = React.useState(false);

  // OTP login
  const [phone, setPhone] = React.useState('');
  const [countryCode, setCountryCode] = React.useState(() => defaultCountryCode());
  const [otp, setOtp] = React.useState('');

  /** Store the session and leave the login screen: a temporary password or a required 2FA setup comes first. */
  function finishSignIn(data: LoginResponse) {
    const { accessToken, refreshToken, user, tenant, mustChangePassword, twoFactorSetupRequired } = data;
    setAuth({ accessToken, refreshToken, user, tenant, mustChangePassword, twoFactorSetupRequired });
    toast.success(t('auth.login.success'));
    if (mustChangePassword) router.push('/change-password');
    else if (twoFactorSetupRequired) router.push('/settings/security');
    else router.push('/dashboard');
  }

  function startSecondStep(token: string) {
    setChallengeToken(token);
    setTwoFactorCode('');
    setUseRecoveryCode(false);
    setStep('code');
  }

  function goBackToEmail() {
    setChallengeToken('');
    setTwoFactorCode('');
    setUseRecoveryCode(false);
    setStep('email');
    setResolvedTenants([]);
    setSelectedTenantId('');
    setPassword('');
    setError('');
    setOtpSent(false);
  }

  async function handleResolveTenant(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      if (!email) {
        setError(t('auth.login.emailRequired'));
        setIsLoading(false);
        return;
      }

      const response = await authApi.resolveTenant({ email });
      const tenants = response.data?.tenants ?? [];

      if (tenants.length === 0) {
        setError(t('auth.login.noAccount'));
        return;
      }

      setResolvedTenants(tenants);
      setSelectedTenantId(tenants[0]!.id);
      setStep('password');
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('auth.login.lookupFailed');
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      if (!password) {
        setError(t('auth.login.passwordRequired'));
        setIsLoading(false);
        return;
      }

      const response = await authApi.login({ email, password, tenantId: selectedTenantId });

      if (response.data) {
        // Password accepted. With two-factor sign-in on there is no session until the authenticator code is checked.
        if (isTwoFactorChallenge(response.data)) startSecondStep(response.data.challengeToken);
        else finishSignIn(response.data);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('auth.login.invalidCredentials');
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      if (!phone || !countryCode) {
        setError(t('auth.login.phoneRequired'));
        setIsLoading(false);
        return;
      }

      const fullPhone = `${countryCode}${phone}`;
      await authApi.sendOtp({ phone: fullPhone, tenantId: selectedTenantId });

      setOtpSent(true);
      toast.success(t('auth.login.otpSent'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('auth.login.sendOtpFailed');
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      if (!otp || otp.length !== 6) {
        setError(t('auth.login.otpInvalid'));
        setIsLoading(false);
        return;
      }

      const fullPhone = `${countryCode}${phone}`;
      const response = await authApi.verifyOtp({ phone: fullPhone, otp, tenantId: selectedTenantId });

      if (response.data) {
        if (isTwoFactorChallenge(response.data)) startSecondStep(response.data.challengeToken);
        else finishSignIn(response.data);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('auth.login.otpFailed');
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleVerifyTwoFactor(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const code = twoFactorCode.trim();
      if (!code) {
        setError(useRecoveryCode ? t('auth.login.twoFactor.recoveryRequired') : t('auth.login.twoFactor.codeRequired'));
        return;
      }
      const response = await authApi.twoFactorVerify({ challengeToken, code });
      if (response.data) {
        if (response.data.usedRecoveryCode) {
          toast.info(t('auth.login.twoFactor.recoveryUsed', { count: response.data.recoveryCodesRemaining }));
        }
        finishSignIn(response.data);
      }
    } catch (err) {
      // The API client throws plain { status, message } objects, not Error instances.
      const failure = err as { status?: number; message?: string } | null;
      const status = failure?.status;
      const msg = failure?.message || t('auth.login.twoFactor.failed');
      setError(msg);
      // The challenge is spent after too many wrong codes or when it expires: start again from the password.
      if (status === 429 || /expired/i.test(msg)) {
        setStep('password');
        setChallengeToken('');
        setPassword('');
        setTwoFactorCode('');
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Mobile logo */}
      <div className="lg:hidden flex items-center gap-2 mb-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white font-bold text-sm">T</div>
        <span className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>{t('brand.name')}</span>
      </div>

      <div>
        <h2 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>{t('auth.login.title')}</h2>
        <p className="text-muted-foreground text-sm mt-1">
          {step === 'email' && t('auth.login.subtitle.email')}
          {step === 'password' && t('auth.login.subtitle.password', { email })}
          {step === 'code' && t('auth.login.subtitle.code')}
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Step 1: Email resolution */}
      {step === 'email' && (
        <form onSubmit={handleResolveTenant} className="space-y-4">
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
            {t('auth.login.continue')}
          </Button>
        </form>
      )}

      {/* Step 3: second factor, only for accounts with two-factor sign-in on */}
      {step === 'code' && (
        <form onSubmit={handleVerifyTwoFactor} className="space-y-4" data-testid="two-factor-form">
          <button
            type="button"
            onClick={goBackToEmail}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> {t('auth.login.twoFactor.startOver')}
          </button>
          <div className="space-y-2">
            <Label htmlFor="twoFactorCode">{useRecoveryCode ? t('auth.login.twoFactor.recoveryLabel') : t('auth.login.twoFactor.codeLabel')}</Label>
            <p className="text-xs text-muted-foreground">
              {useRecoveryCode
                ? t('auth.login.twoFactor.recoveryHelp')
                : t('auth.login.twoFactor.codeHelp')}
            </p>
            <div className="relative">
              <ShieldCheck className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="twoFactorCode"
                type="text"
                inputMode={useRecoveryCode ? 'text' : 'numeric'}
                autoComplete="one-time-code"
                placeholder={useRecoveryCode ? 'XXXXX-XXXXX' : '000000'}
                value={twoFactorCode}
                onChange={(e) =>
                  setTwoFactorCode(useRecoveryCode ? e.target.value.slice(0, 16) : e.target.value.replace(/\D/g, '').slice(0, 6))
                }
                className="ps-9 font-mono tracking-widest"
                autoFocus
                required
              />
            </div>
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={isLoading || (!useRecoveryCode && twoFactorCode.length !== 6) || (useRecoveryCode && twoFactorCode.trim().length < 10)}
          >
            {isLoading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            {t('auth.login.twoFactor.verify')}
          </Button>
          <button
            type="button"
            onClick={() => {
              setUseRecoveryCode((v) => !v);
              setTwoFactorCode('');
              setError('');
            }}
            className="w-full text-sm text-muted-foreground hover:text-foreground text-center"
          >
            {useRecoveryCode ? t('auth.login.twoFactor.useAuthenticator') : t('auth.login.twoFactor.useRecovery')}
          </button>
        </form>
      )}

      {/* Step 2: Password / OTP with tenant dropdown */}
      {step === 'password' && (
        <>
          <button
            type="button"
            onClick={goBackToEmail}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> {t('auth.login.changeEmail')}
          </button>

          {/* Tenant dropdown — only shown when multiple tenants */}
          {resolvedTenants.length > 1 && (
            <div className="space-y-2">
              <Label>{t('auth.login.organization')}</Label>
              <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
                <SelectTrigger className="w-full">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <SelectValue placeholder={t('auth.login.selectOrganization')} />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {resolvedTenants.map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      <div className="flex items-center gap-2">
                        <span>{tenant.companyName}</span>
                        <span className="text-xs text-muted-foreground capitalize">({tenant.role})</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Tabs defaultValue="email" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="email">{t('auth.fields.password')}</TabsTrigger>
              <TabsTrigger value="phone">{t('auth.login.tabs.phone')}</TabsTrigger>
            </TabsList>

            <TabsContent value="email" className="mt-4">
              <form onSubmit={handleEmailLogin} className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">{t('auth.fields.password')}</Label>
                    <Link href="/forgot-password" className="text-xs text-primary hover:underline">
                      {t('auth.login.forgotPassword')}
                    </Link>
                  </div>
                  <div className="relative">
                    <Lock className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder={t('auth.login.passwordPlaceholder')}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="ps-9 pe-10"
                      required
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                  {t('auth.login.signIn')}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="phone" className="mt-4">
              {!otpSent ? (
                <form onSubmit={handleSendOtp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">{t('auth.login.phoneNumber')}</Label>
                    <div className="flex gap-2">
                      <Input
                        value={countryCode}
                        onChange={(e) => setCountryCode(e.target.value)}
                        className="w-20 text-center"
                        placeholder="+91"
                      />
                      <div className="relative flex-1">
                        <Phone className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="phone"
                          type="tel"
                          placeholder="9876543210"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          className="ps-9"
                          required
                        />
                      </div>
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                    {t('auth.login.sendOtp')}
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="otp">{t('auth.login.otpLabel')}</Label>
                    <p className="text-xs text-muted-foreground">{t('auth.login.otpSentTo', { phone: `${countryCode} ${phone}` })}</p>
                    <Input
                      id="otp"
                      type="text"
                      placeholder="000000"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="text-center text-lg tracking-[0.5em] font-mono"
                      maxLength={6}
                      required
                      autoFocus
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading || otp.length !== 6}>
                    {isLoading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                    {t('auth.login.verifyOtp')}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setOtpSent(false)}
                    className="w-full text-sm text-muted-foreground hover:text-foreground text-center"
                  >
                    {t('auth.login.changePhone')}
                  </button>
                </form>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}

      <ServerAddress />

      <div className="text-center text-sm text-muted-foreground">
        {t('auth.login.noAccountPrompt')}{' '}
        <span className="text-foreground font-medium">{t('auth.login.contactAdmin')}</span>
      </div>
    </div>
  );
}
