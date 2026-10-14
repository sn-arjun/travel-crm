'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { WizardData } from '../page';
import { Loader2, CheckCircle2 } from 'lucide-react';

interface Props {
  data: WizardData;
  onProvision: () => void;
  isProvisioning: boolean;
  provisionStep: string;
  onBack: () => void;
}

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
          <Row label="Location" value={`${data.company.country} (${data.company.timezone}), data region ${data.company.region.toUpperCase()}`} />
          <Row label="Currency / tax" value={`${data.company.currency} / ${data.company.taxSystem}`} />
        </Section>

        <Section title="Plan">
          <Row label="Selected Plan" value={data.plan} />
        </Section>

        <Section title="Admin User">
          <Row label="Admin Email" value={data.company.ownerEmail} />
          <Row label="Password" value="Generated for you and shown once after provisioning" />
        </Section>

        {provisionStep && (
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
