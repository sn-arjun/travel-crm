'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2 } from 'lucide-react';

interface Props {
  data: {
    company: { name: string; slug: string; ownerName: string; ownerEmail: string; ownerPhone: string; country: string; timezone: string };
    plan: { name: string; monthlyAmount: number };
    admin: { password: string };
    wordpress: { enabled: boolean; subdomain?: string; template?: string };
  };
  onProvision: () => void;
  isProvisioning: boolean;
  provisionStep: string;
  onBack: () => void;
}

const planLabels: Record<string, string> = {
  free: 'Free Trial (14 days)',
  starter: 'Starter — ₹999/mo',
  pro: 'Professional — ₹2,499/mo',
  enterprise: 'Enterprise — ₹4,999/mo',
};

export function ReviewStep({ data, onProvision, isProvisioning, provisionStep, onBack }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Review & Provision</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <Section title="Company Details">
          <Row label="Company Name" value={data.company.name} />
          <Row label="Subdomain" value={`${data.company.slug}.travelcrmpro.com`} />
          <Row label="Owner" value={`${data.company.ownerName} (${data.company.ownerEmail})`} />
          {data.company.ownerPhone && <Row label="Phone" value={data.company.ownerPhone} />}
          <Row label="Location" value={`${data.company.country} (${data.company.timezone})`} />
        </Section>

        <Section title="Plan">
          <Row label="Selected Plan" value={planLabels[data.plan.name] || data.plan.name} />
        </Section>

        <Section title="Admin User">
          <Row label="Admin Email" value={data.company.ownerEmail} />
          <Row label="Password" value="••••••••" />
        </Section>

        <Section title="WordPress">
          <Row
            label="Website"
            value={
              data.wordpress.enabled
                ? `${data.wordpress.subdomain}.travelcrmpro.com (${data.wordpress.template} template)`
                : 'Not enabled'
            }
          />
        </Section>

        {isProvisioning && (
          <div className="flex items-center gap-3 rounded-lg bg-primary/5 border p-4">
            {provisionStep.startsWith('Error') ? (
              <span className="text-sm text-destructive">{provisionStep}</span>
            ) : (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm">{provisionStep || 'Provisioning...'}</span>
              </>
            )}
          </div>
        )}

        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={onBack} disabled={isProvisioning}>Back</Button>
          <Button onClick={onProvision} disabled={isProvisioning}>
            {isProvisioning ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Provisioning...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Provision Tenant
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
      <div className="space-y-1 text-sm">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1 border-b last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
