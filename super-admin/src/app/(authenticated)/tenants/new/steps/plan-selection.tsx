'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { CatalogueData } from '@/lib/catalogue';
import { formatMoney, priceInForce } from '@/lib/catalogue';

interface Props {
  selected: string;
  onNext: (plan: string) => void;
  onBack: () => void;
}

// A new agency can start on these plans (the backend's POST /admin/tenants accepts exactly these keys).
const CREATABLE = ['trial', 'basic', 'pro', 'enterprise'];

export function PlanSelectionStep({ selected: initial, onNext, onBack }: Props) {
  const [catalogue, setCatalogue] = useState<CatalogueData | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(initial || 'trial');

  useEffect(() => {
    fetch('/api/catalogue')
      .then(async (res) => {
        const json = (await res.json()) as CatalogueData & { error?: string };
        if (!res.ok) throw new Error(json.error || 'Could not load the plans');
        setCatalogue(json);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load the plans'));
  }, []);

  const plans = (catalogue?.plans ?? []).filter((p) => p.isActive && CREATABLE.includes(p.key));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Select Plan</CardTitle>
      </CardHeader>
      <CardContent>
        {error && <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        {!catalogue && !error ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {plans.map((plan) => {
              const price = priceInForce(plan.prices, 'IN') ?? plan.prices.find((p) => p.isActive);
              return (
                <div
                  key={plan.key}
                  onClick={() => setSelected(plan.key)}
                  className={cn(
                    'cursor-pointer rounded-lg border-2 p-4 transition-colors',
                    selected === plan.key ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
                  )}
                >
                  <div className="text-center mb-3">
                    <h3 className="font-semibold">{plan.name}</h3>
                    <div className="mt-2">
                      <span className="text-2xl font-bold">
                        {plan.key === 'trial' ? 'Free' : price ? formatMoney(price.yearlyPrice, price.currency) : '-'}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {plan.key === 'trial' ? ` ${plan.trialDays} days` : ' /year'}
                      </span>
                    </div>
                  </div>
                  <ul className="space-y-1 text-sm text-muted-foreground text-center">
                    {price && <li>{price.includedUsers} users included</li>}
                    <li>{plan.features.length} features</li>
                    {plan.description && <li className="text-xs">{plan.description}</li>}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={onBack}>Back</Button>
          <Button onClick={() => onNext(selected)} disabled={!catalogue || !plans.some((p) => p.key === selected)}>
            Next: Review
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
