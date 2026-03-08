'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PlanData {
  name: string;
  monthlyAmount: number;
}

interface Props {
  data: PlanData;
  onNext: (data: PlanData) => void;
  onBack: () => void;
}

const PLANS = [
  {
    name: 'free',
    label: 'Free Trial',
    price: 0,
    period: '14 days',
    features: ['2 users', '50 leads', '10 invoices', 'Basic reports'],
    popular: false,
  },
  {
    name: 'starter',
    label: 'Starter',
    price: 999,
    period: '/month',
    features: ['5 users', '500 leads', '100 invoices', 'Standard reports', 'Email support'],
    popular: false,
  },
  {
    name: 'pro',
    label: 'Professional',
    price: 2499,
    period: '/month',
    features: ['15 users', 'Unlimited leads', 'Unlimited invoices', 'Advanced reports', 'Priority support', 'API access'],
    popular: true,
  },
  {
    name: 'enterprise',
    label: 'Enterprise',
    price: 4999,
    period: '/month',
    features: ['50 users', 'Unlimited everything', 'Custom reports', 'Dedicated support', 'API access', 'White-label', 'SLA guarantee'],
    popular: false,
  },
];

export function PlanSelectionStep({ data, onNext, onBack }: Props) {
  const [selected, setSelected] = useState(data.name || 'pro');

  const handleNext = () => {
    const plan = PLANS.find((p) => p.name === selected);
    if (plan) {
      onNext({ name: plan.name, monthlyAmount: plan.price });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Select Plan</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              onClick={() => setSelected(plan.name)}
              className={cn(
                'relative cursor-pointer rounded-lg border-2 p-4 transition-colors',
                selected === plan.name
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              )}
            >
              {plan.popular && (
                <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2">Popular</Badge>
              )}
              <div className="text-center mb-3">
                <h3 className="font-semibold">{plan.label}</h3>
                <div className="mt-2">
                  <span className="text-2xl font-bold">
                    {plan.price === 0 ? 'Free' : `₹${plan.price.toLocaleString('en-IN')}`}
                  </span>
                  <span className="text-sm text-muted-foreground">{plan.period}</span>
                </div>
              </div>
              <ul className="space-y-1.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <Check className="h-3.5 w-3.5 text-green-600 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={onBack}>Back</Button>
          <Button onClick={handleNext}>Next: Admin User</Button>
        </div>
      </CardContent>
    </Card>
  );
}
