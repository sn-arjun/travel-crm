'use client';

import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tag } from '@/components/ui/tag';
import { useApiQuery } from '@/hooks/use-api';
import { client } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/config';

interface GlobalConfig {
  id: string;
  appName: string;
  appUrl: string;
  supportEmail: string;
  supportPhone?: string;
  maxTenantsPerPlan?: Record<string, number>;
  features?: Record<string, boolean>;
  security?: {
    passwordMinLength: number;
    passwordRequireSpecialChar: boolean;
    passwordRequireNumbers: boolean;
    maxLoginAttempts: number;
    sessionTimeoutMinutes: number;
    requireEmailVerification: boolean;
  };
  email?: { smtpHost: string; smtpPort: number; smtpUser: string; fromEmail: string; fromName: string };
}

export default function ConfigPage() {
  const { data: config, loading } = useApiQuery<GlobalConfig>(async () => {
    const response = await client.get<{ data: GlobalConfig }>(API_ENDPOINTS.admin.globalConfig);
    return response.data;
  }, []);

  if (loading || !config) {
    return (
      <div className="flex flex-col gap-ds-4 p-ds-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-ds-6 p-ds-6">
      <PageHeader title="Global configuration" description="Platform-wide settings, read from the deployment environment." />

      <SectionCard title="Application">
        <div className="grid grid-cols-2 gap-ds-4">
          <div>
            <p className="text-xs text-ds-foreground-muted">Application name</p>
            <p className="font-medium">{config.appName}</p>
          </div>
          <div>
            <p className="text-xs text-ds-foreground-muted">Application URL</p>
            <p className="font-medium">{config.appUrl}</p>
          </div>
          <div>
            <p className="text-xs text-ds-foreground-muted">Support email</p>
            <p className="font-medium">{config.supportEmail}</p>
          </div>
          <div>
            <p className="text-xs text-ds-foreground-muted">Support phone</p>
            <p className="font-medium">{config.supportPhone || '—'}</p>
          </div>
        </div>
      </SectionCard>

      {config.features && (
        <SectionCard title="Feature flags" description="Derived from configured integrations; not editable here.">
          <div className="grid grid-cols-2 gap-ds-3 md:grid-cols-3">
            {Object.entries(config.features).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between rounded-ds-md border border-ds-border p-ds-3">
                <span className="text-sm capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                <Tag tone={value ? 'success' : 'info'}>{value ? 'On' : 'Off'}</Tag>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {config.security && (
        <SectionCard title="Security settings">
          <div className="grid grid-cols-2 gap-ds-4">
            <div>
              <p className="text-xs text-ds-foreground-muted">Password min length</p>
              <p className="font-medium">{config.security.passwordMinLength}</p>
            </div>
            <div>
              <p className="text-xs text-ds-foreground-muted">Max login attempts</p>
              <p className="font-medium">{config.security.maxLoginAttempts}</p>
            </div>
            <div>
              <p className="text-xs text-ds-foreground-muted">Session timeout</p>
              <p className="font-medium">{config.security.sessionTimeoutMinutes} minutes</p>
            </div>
            <div>
              <p className="text-xs text-ds-foreground-muted">Requires email verification</p>
              <p className="font-medium">{config.security.requireEmailVerification ? 'Yes' : 'No'}</p>
            </div>
          </div>
        </SectionCard>
      )}

      {config.email && (
        <SectionCard title="Email configuration">
          <div className="grid grid-cols-2 gap-ds-4">
            <div>
              <p className="text-xs text-ds-foreground-muted">SMTP host</p>
              <p className="font-medium">{config.email.smtpHost}</p>
            </div>
            <div>
              <p className="text-xs text-ds-foreground-muted">SMTP port</p>
              <p className="font-medium">{config.email.smtpPort}</p>
            </div>
            <div>
              <p className="text-xs text-ds-foreground-muted">From email</p>
              <p className="font-medium">{config.email.fromEmail}</p>
            </div>
            <div>
              <p className="text-xs text-ds-foreground-muted">From name</p>
              <p className="font-medium">{config.email.fromName}</p>
            </div>
          </div>
        </SectionCard>
      )}

      {config.maxTenantsPerPlan && (
        <SectionCard title="Tenants per plan">
          <div className="grid grid-cols-3 gap-ds-3">
            {Object.entries(config.maxTenantsPerPlan).map(([plan, count]) => (
              <div key={plan} className="rounded-ds-md border border-ds-border p-ds-3 text-center">
                <p className="text-2xl font-bold">{count}</p>
                <p className="text-xs capitalize text-ds-foreground-muted">{plan}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
