'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { PageHeader, SectionCard, Button } from '@/components/ui';
import { PageContainer } from '@/components/layout/page-container';
import { ChangePasswordForm } from '@/components/auth/change-password-form';
import { TwoFactorCard } from '@/components/auth/two-factor-card';
import { useAuthStore } from '@/stores/auth-store';
import { authApi } from '@/lib/api/auth';

export default function SecuritySettingsPage() {
  const router = useRouter();
  const [formKey, setFormKey] = React.useState(0);
  const setupRequired = useAuthStore((s) => s.twoFactorSetupRequired);

  async function signOut() {
    try {
      await authApi.logout();
    } catch {
      // The session is dropped locally either way.
    }
    useAuthStore.getState().logout();
    router.replace('/login');
  }

  return (
    <PageContainer width="narrow">
      <PageHeader
        title="Security"
        description="Your password and sign-in protection."
        back={
          <Button variant="ghost" size="icon-sm" aria-label="Back" onClick={() => router.push('/settings')}>
            <ShieldCheck className="size-4" />
          </Button>
        }
      />

      {setupRequired && (
        <div
          role="alert"
          data-testid="two-factor-required-banner"
          className="flex flex-wrap items-center justify-between gap-ds-3 rounded-ds-md border border-ds-warning bg-ds-warning-subtle px-ds-4 py-ds-3 text-sm"
        >
          <span>Your agency requires two-factor sign-in. Set it up below to continue.</span>
          <Button variant="outline" size="sm" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      )}

      <SectionCard
        title="Change password"
        description="Other devices are signed out when you change it. You will get a confirmation email."
      >
        {/* Remounting clears the fields after a successful change. */}
        <ChangePasswordForm key={formKey} onDone={() => setFormKey((k) => k + 1)} className="max-w-md" />
      </SectionCard>

      <TwoFactorCard />
    </PageContainer>
  );
}
