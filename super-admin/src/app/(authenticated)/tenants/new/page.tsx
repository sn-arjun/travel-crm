'use client';

import { useState } from 'react';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { CompanyDetailsStep, type CompanyData } from './steps/company-details';
import { PlanSelectionStep } from './steps/plan-selection';
import { ReviewStep } from './steps/review';
import { ProvisionResult, type ProvisionOutcome } from './steps/provision-result';
import { cn } from '@/lib/utils';

const STEPS = ['Company Details', 'Plan', 'Review'];

export interface WizardData {
  company: CompanyData;
  plan: string;
}

const INITIAL_DATA: WizardData = {
  company: {
    name: '',
    slug: '',
    ownerName: '',
    ownerEmail: '',
    country: 'India',
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    taxSystem: 'gst',
    region: 'in',
  },
  plan: 'trial',
};

export default function OnboardTenantPage() {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardData>(INITIAL_DATA);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisionStep, setProvisionStep] = useState('');
  const [outcome, setOutcome] = useState<ProvisionOutcome | null>(null);

  const handleProvision = async () => {
    setIsProvisioning(true);
    setProvisionStep('Creating the agency, its database and its admin...');

    try {
      const res = await fetch('/api/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: data.company.name.trim(),
          slug: data.company.slug,
          ownerName: data.company.ownerName.trim(),
          ownerEmail: data.company.ownerEmail.trim(),
          plan: data.plan,
          country: data.company.country,
          currency: data.company.currency,
          timezone: data.company.timezone,
          taxSystem: data.company.taxSystem,
          region: data.company.region,
        }),
      });
      const result = (await res.json()) as ProvisionOutcome & { error?: string };
      if (!res.ok) throw new Error(result.error || 'Provisioning failed');
      setOutcome(result);
    } catch (err) {
      setProvisionStep(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setIsProvisioning(false);
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumb items={[
        { label: 'Tenants', href: '/tenants' },
        { label: 'Onboard New Tenant' },
      ]} />

      <h1 className="text-3xl font-bold tracking-tight">Onboard New Tenant</h1>

      {outcome ? (
        <ProvisionResult outcome={outcome} />
      ) : (
        <>
          <div className="flex items-center gap-1 mb-4">
            {STEPS.map((label, i) => (
              <div key={label} className="flex items-center">
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                  i < step ? 'bg-green-600 text-white' :
                  i === step ? 'bg-primary text-primary-foreground' :
                  'bg-muted text-muted-foreground'
                )}>
                  {i < step ? '✓' : i + 1}
                </div>
                <span className={cn(
                  'ml-1.5 text-sm hidden md:block',
                  i === step ? 'font-medium' : 'text-muted-foreground'
                )}>{label}</span>
                {i < STEPS.length - 1 && <div className="w-6 h-px bg-border mx-2" />}
              </div>
            ))}
          </div>

          {step === 0 && (
            <CompanyDetailsStep
              data={data.company}
              onNext={(d) => { setData({ ...data, company: d }); setStep(1); }}
            />
          )}
          {step === 1 && (
            <PlanSelectionStep
              selected={data.plan}
              onNext={(plan) => { setData({ ...data, plan }); setStep(2); }}
              onBack={() => setStep(0)}
            />
          )}
          {step === 2 && (
            <ReviewStep
              data={data}
              onProvision={handleProvision}
              isProvisioning={isProvisioning}
              provisionStep={provisionStep}
              onBack={() => setStep(1)}
            />
          )}
        </>
      )}
    </div>
  );
}
