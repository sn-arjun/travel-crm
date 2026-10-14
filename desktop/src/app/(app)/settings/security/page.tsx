'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Smartphone } from 'lucide-react';
import { PageHeader, SectionCard, Badge, Button } from '@/components/ui';
import { PageContainer } from '@/components/layout/page-container';
import { ChangePasswordForm } from '@/components/auth/change-password-form';

export default function SecuritySettingsPage() {
  const router = useRouter();
  const [formKey, setFormKey] = React.useState(0);

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

      <SectionCard
        title="Change password"
        description="Other devices are signed out when you change it. You will get a confirmation email."
      >
        {/* Remounting clears the fields after a successful change. */}
        <ChangePasswordForm key={formKey} onDone={() => setFormKey((k) => k + 1)} className="max-w-md" />
      </SectionCard>

      <SectionCard
        title="Two-factor authentication"
        description="Ask for a second step when signing in."
        actions={<Badge variant="secondary">Coming soon</Badge>}
      >
        <div className="flex items-center gap-ds-3 text-sm text-ds-foreground-muted">
          <Smartphone className="size-5" aria-hidden="true" />
          Authenticator app support will be available here.
        </div>
      </SectionCard>
    </PageContainer>
  );
}
