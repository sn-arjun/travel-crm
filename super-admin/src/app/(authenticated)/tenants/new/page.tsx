'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { CompanyDetailsStep } from './steps/company-details';
import { PlanSelectionStep } from './steps/plan-selection';
import { AdminUserStep } from './steps/admin-user';
import { WordPressOptionsStep } from './steps/wordpress-options';
import { ReviewStep } from './steps/review';
import { cn } from '@/lib/utils';

const STEPS = ['Company Details', 'Plan', 'Admin User', 'WordPress', 'Review'];

interface WizardData {
  company: {
    name: string;
    slug: string;
    ownerName: string;
    ownerEmail: string;
    ownerPhone: string;
    country: string;
    timezone: string;
  };
  plan: { name: string; monthlyAmount: number };
  admin: { password: string; confirmPassword: string };
  wordpress: { enabled: boolean; subdomain: string; template: string };
}

const INITIAL_DATA: WizardData = {
  company: { name: '', slug: '', ownerName: '', ownerEmail: '', ownerPhone: '', country: 'India', timezone: 'Asia/Kolkata' },
  plan: { name: 'pro', monthlyAmount: 2499 },
  admin: { password: '', confirmPassword: '' },
  wordpress: { enabled: false, subdomain: '', template: 'default' },
};

export default function OnboardTenantPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardData>(INITIAL_DATA);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisionStep, setProvisionStep] = useState('');

  const handleProvision = async () => {
    setIsProvisioning(true);
    setProvisionStep('Creating tenant record...');

    try {
      const res = await fetch('/api/tenants/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = (await res.json()) as { success?: boolean; tenant?: { id: string }; error?: string };

      if (result.success && result.tenant) {
        setProvisionStep('Tenant provisioned successfully!');
        setTimeout(() => {
          router.push(`/tenants/${result.tenant!.id}`);
        }, 1000);
      } else {
        throw new Error(result.error || 'Provisioning failed');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setProvisionStep(`Error: ${msg}`);
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

      {/* Stepper */}
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

      {/* Step Content */}
      {step === 0 && (
        <CompanyDetailsStep
          data={data.company}
          onNext={(d) => { setData({ ...data, company: d }); setStep(1); }}
        />
      )}
      {step === 1 && (
        <PlanSelectionStep
          data={data.plan}
          onNext={(d) => { setData({ ...data, plan: d }); setStep(2); }}
          onBack={() => setStep(0)}
        />
      )}
      {step === 2 && (
        <AdminUserStep
          data={data.admin}
          onNext={(d) => { setData({ ...data, admin: d }); setStep(3); }}
          onBack={() => setStep(1)}
        />
      )}
      {step === 3 && (
        <WordPressOptionsStep
          data={data.wordpress}
          onNext={(d) => { setData({ ...data, wordpress: d }); setStep(4); }}
          onBack={() => setStep(2)}
        />
      )}
      {step === 4 && (
        <ReviewStep
          data={data}
          onProvision={handleProvision}
          isProvisioning={isProvisioning}
          provisionStep={provisionStep}
          onBack={() => setStep(3)}
        />
      )}
    </div>
  );
}
