'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WordPressData {
  enabled: boolean;
  subdomain: string;
  template: string;
}

interface Props {
  data: WordPressData;
  onNext: (data: WordPressData) => void;
  onBack: () => void;
}

const TEMPLATES = [
  { id: 'default', name: 'Default Travel', description: 'Clean travel agency template' },
  { id: 'adventure', name: 'Adventure', description: 'Outdoor & adventure focused' },
  { id: 'luxury', name: 'Luxury', description: 'Premium luxury travel' },
];

export function WordPressOptionsStep({ data, onNext, onBack }: Props) {
  const [form, setForm] = useState<WordPressData>({
    enabled: data.enabled || false,
    subdomain: data.subdomain || '',
    template: data.template || 'default',
  });

  const handleNext = () => {
    onNext(form);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>WordPress Site (Optional)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Provision a branded WordPress website for this tenant. The site will be auto-configured with their branding.
        </p>

        <div className="flex gap-4">
          <div
            onClick={() => setForm({ ...form, enabled: false })}
            className={cn(
              'flex-1 cursor-pointer rounded-lg border-2 p-4 text-center transition-colors',
              !form.enabled ? 'border-primary bg-primary/5' : 'border-border'
            )}
          >
            <p className="font-medium">Skip</p>
            <p className="text-sm text-muted-foreground">No website needed</p>
          </div>
          <div
            onClick={() => setForm({ ...form, enabled: true })}
            className={cn(
              'flex-1 cursor-pointer rounded-lg border-2 p-4 text-center transition-colors',
              form.enabled ? 'border-primary bg-primary/5' : 'border-border'
            )}
          >
            <Globe className="h-5 w-5 mx-auto mb-1" />
            <p className="font-medium">Enable WordPress</p>
            <p className="text-sm text-muted-foreground">Auto-provisioned site</p>
          </div>
        </div>

        {form.enabled && (
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Website Subdomain</label>
              <div className="flex items-center gap-2">
                <Input
                  value={form.subdomain}
                  onChange={(e) => setForm({ ...form, subdomain: e.target.value.toLowerCase() })}
                  placeholder="acme-travel"
                />
                <span className="text-sm text-muted-foreground whitespace-nowrap">.travelcrmpro.com</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Template</label>
              <div className="grid grid-cols-3 gap-3">
                {TEMPLATES.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => setForm({ ...form, template: t.id })}
                    className={cn(
                      'cursor-pointer rounded-lg border-2 p-3 text-center transition-colors',
                      form.template === t.id ? 'border-primary bg-primary/5' : 'border-border'
                    )}
                  >
                    <p className="font-medium text-sm">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={onBack}>Back</Button>
          <Button onClick={handleNext}>Next: Review</Button>
        </div>
      </CardContent>
    </Card>
  );
}
