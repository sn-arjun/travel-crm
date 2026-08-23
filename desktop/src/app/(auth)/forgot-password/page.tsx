'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Mail, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { authApi, type ForgotPasswordRequest } from '@/lib/api/auth';

export default function ForgotPasswordPage() {
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
        setError('Please enter your email address');
        setIsLoading(false);
        return;
      }

      const request: ForgotPasswordRequest = { email };
      await authApi.forgotPassword(request);

      setSent(true);
      toast.success('Reset link sent to your email');
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to send reset link. Please try again.';
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
          <h2 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Check your email</h2>
          <p className="text-muted-foreground text-sm mt-2">
            We sent a password reset link to<br />
            <span className="font-medium text-foreground">{email}</span>
          </p>
        </div>
        <div className="space-y-3">
          <Button variant="outline" className="w-full" onClick={() => setSent(false)}>
            Try a different email
          </Button>
          <Link href="/login" className="block text-sm text-primary hover:underline">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/login" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to sign in
      </Link>

      <div>
        <h2 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Forgot password?</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Enter your email and we'll send you a reset link
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
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
          Send reset link
        </Button>
      </form>
    </div>
  );
}
