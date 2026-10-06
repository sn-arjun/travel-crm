'use client';

import { Check } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useApiQuery } from '@/hooks/use-api';
import { client } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/config';
import { PageContainer } from '@/components/layout/page-container';

interface Plan {
  id: string;
  name: string;
  description: string;
  price: number;
  billingCycle: 'monthly' | 'yearly';
  features: string[];
  maxUsers?: number;
  maxContacts?: number;
  maxTeam?: number;
  isActive: boolean;
}

function PlansPageContent() {
  const { data: plans, loading } = useApiQuery<Plan[]>(async () => {
    const response = await client.get<{ data: Plan[] }>(API_ENDPOINTS.admin.plans);
    return response.data;
  }, []);

  return (
    <div className="flex flex-col gap-ds-6">
      <PageHeader title="Subscription plans" description="The pricing tiers available across the platform." count={plans?.length} />

      {loading ? (
        <div className="grid grid-cols-1 gap-ds-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-80 w-full" />
          ))}
        </div>
      ) : plans && plans.length > 0 ? (
        <div className="grid grid-cols-1 gap-ds-4 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.id} className={!plan.isActive ? 'opacity-60' : ''}>
              <CardHeader>
                <CardTitle>{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-ds-4">
                <div>
                  <p className="text-3xl font-bold">
                    {plan.price.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-sm text-ds-foreground-muted">per {plan.billingCycle === 'yearly' ? 'year' : 'month'}</p>
                </div>

                <div className="space-y-ds-2">
                  {plan.maxUsers && (
                    <div className="flex items-center gap-ds-2 text-sm">
                      <Check className="size-4 text-ds-success" aria-hidden="true" />
                      Up to {plan.maxUsers} users
                    </div>
                  )}
                  {plan.maxContacts && (
                    <div className="flex items-center gap-ds-2 text-sm">
                      <Check className="size-4 text-ds-success" aria-hidden="true" />
                      Up to {plan.maxContacts.toLocaleString()} contacts
                    </div>
                  )}
                  {plan.maxTeam && (
                    <div className="flex items-center gap-ds-2 text-sm">
                      <Check className="size-4 text-ds-success" aria-hidden="true" />
                      Up to {plan.maxTeam} team members
                    </div>
                  )}
                </div>

                {plan.features?.length > 0 && (
                  <div className="space-y-ds-1">
                    <p className="text-xs font-semibold text-ds-foreground-muted">Features</p>
                    <ul className="space-y-1 text-xs">
                      {plan.features.slice(0, 5).map((feature) => (
                        <li key={feature} className="flex items-center gap-ds-2">
                          <Check className="size-3 shrink-0 text-ds-success" aria-hidden="true" />
                          {feature}
                        </li>
                      ))}
                      {plan.features.length > 5 && (
                        <li className="text-ds-foreground-muted">+{plan.features.length - 5} more</li>
                      )}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="No plans found" description="Subscription plans will appear here once configured." />
      )}
    </div>
  );
}

export default function PlansPage() {
  return (
    <PageContainer>
      <PlansPageContent />
    </PageContainer>
  );
}
