'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2, Mail, Lock, Phone, ArrowLeft, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth-store';
import { authApi, type ResolvedTenant } from '@/lib/api/auth';

type Step = 'email' | 'password';

export default function LoginPage() {
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

  // OTP login
  const [phone, setPhone] = React.useState('');
  const [countryCode, setCountryCode] = React.useState('+91');
  const [otp, setOtp] = React.useState('');

  function goBackToEmail() {
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
        setError('Please enter your email address');
        setIsLoading(false);
        return;
      }

      const response = await authApi.resolveTenant({ email });
      const tenants = response.data?.tenants ?? [];

      if (tenants.length === 0) {
        setError('No account found with this email');
        return;
      }

      setResolvedTenants(tenants);
      setSelectedTenantId(tenants[0]!.id);
      setStep('password');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to look up account';
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
        setError('Please enter your password');
        setIsLoading(false);
        return;
      }

      const response = await authApi.login({ email, password, tenantId: selectedTenantId });

      if (response.data) {
        const { accessToken, refreshToken, user, tenant } = response.data;
        setAuth({ accessToken, refreshToken, user, tenant });
        toast.success('Logged in successfully');
        router.push('/');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid email or password';
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
        setError('Please enter your phone number');
        setIsLoading(false);
        return;
      }

      const fullPhone = `${countryCode}${phone}`;
      await authApi.sendOtp({ phone: fullPhone, tenantId: selectedTenantId });

      setOtpSent(true);
      toast.success('OTP sent to your phone');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send OTP';
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
        setError('Please enter a valid 6-digit OTP');
        setIsLoading(false);
        return;
      }

      const fullPhone = `${countryCode}${phone}`;
      const response = await authApi.verifyOtp({ phone: fullPhone, otp, tenantId: selectedTenantId });

      if (response.data) {
        const { accessToken, refreshToken, user, tenant } = response.data;
        setAuth({ accessToken, refreshToken, user, tenant });
        toast.success('Logged in successfully');
        router.push('/');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid OTP';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Mobile logo */}
      <div className="lg:hidden flex items-center gap-2 mb-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white font-bold text-sm">T</div>
        <span className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>TravelCRM Pro</span>
      </div>

      <div>
        <h2 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Welcome back</h2>
        <p className="text-muted-foreground text-sm mt-1">
          {step === 'email' && 'Enter your email to find your account'}
          {step === 'password' && `Signing in as ${email}`}
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
            <Label htmlFor="email">Email address</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-9"
                required
                autoFocus
              />
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Continue
          </Button>
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
            <ArrowLeft className="h-3.5 w-3.5" /> Change email
          </button>

          {/* Tenant dropdown — only shown when multiple tenants */}
          {resolvedTenants.length > 1 && (
            <div className="space-y-2">
              <Label>Organization</Label>
              <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
                <SelectTrigger className="w-full">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <SelectValue placeholder="Select organization" />
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
              <TabsTrigger value="email">Password</TabsTrigger>
              <TabsTrigger value="phone">Phone / OTP</TabsTrigger>
            </TabsList>

            <TabsContent value="email" className="mt-4">
              <form onSubmit={handleEmailLogin} className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <Link href="/forgot-password" className="text-xs text-primary hover:underline">
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
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
                </div>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Sign in
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="phone" className="mt-4">
              {!otpSent ? (
                <form onSubmit={handleSendOtp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone number</Label>
                    <div className="flex gap-2">
                      <Input
                        value={countryCode}
                        onChange={(e) => setCountryCode(e.target.value)}
                        className="w-20 text-center"
                        placeholder="+91"
                      />
                      <div className="relative flex-1">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="phone"
                          type="tel"
                          placeholder="9876543210"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          className="pl-9"
                          required
                        />
                      </div>
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Send OTP
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="otp">Enter 6-digit OTP</Label>
                    <p className="text-xs text-muted-foreground">Sent to {countryCode} {phone}</p>
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
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Verify & Sign in
                  </Button>
                  <button
                    type="button"
                    onClick={() => setOtpSent(false)}
                    className="w-full text-sm text-muted-foreground hover:text-foreground text-center"
                  >
                    Change phone number
                  </button>
                </form>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}

      <div className="text-center text-sm text-muted-foreground">
        {"Don't have an account? "}
        <span className="text-foreground font-medium">Contact your admin</span>
      </div>
    </div>
  );
}
