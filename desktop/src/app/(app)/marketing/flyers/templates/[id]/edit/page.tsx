'use client';

import * as React from 'react';
import { z } from 'zod';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { EntityForm, FormRow } from '@/components/domain';
import { Input, SectionCard, Skeleton } from '@/components/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { marketingApi, type FlyerTemplate } from '@/lib/api/marketing';

const templateCategories = ['festival', 'seasonal', 'promotional', 'general'];

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  category: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  previewUrl: z.string().optional(),
});
type TemplateForm = z.infer<typeof schema>;

export default function EditFlyerTemplatePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [template, setTemplate] = React.useState<FlyerTemplate | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await marketingApi.flyerTemplates.get(params.id);
        if (!cancelled) setTemplate(res.data);
      } catch {
        if (!cancelled) toast.error('Failed to load template');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex flex-col gap-ds-4 p-ds-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <EntityForm<TemplateForm>
      title="Edit flyer template"
      schema={schema}
      defaultValues={{
        name: template?.name ?? '',
        category: template?.category ?? '',
        thumbnailUrl: template?.thumbnailUrl ?? '',
        previewUrl: template?.previewUrl ?? '',
      }}
      onCancel={() => router.back()}
      onSubmit={async (values) => {
        try {
          await marketingApi.flyerTemplates.update(params.id, {
            name: values.name,
            category: values.category || undefined,
            thumbnailUrl: values.thumbnailUrl || undefined,
            previewUrl: values.previewUrl || undefined,
          });
          toast.success('Template updated');
          router.push('/marketing/flyers/templates');
        } catch {
          toast.error('Failed to update template');
        }
      }}
      renderSections={(form) => (
        <SectionCard title="Details" required>
          <div className="grid gap-ds-4 sm:grid-cols-2">
            <FormRow name="name" label="Name" required wide>
              <Input {...form.register('name')} id="name" />
            </FormRow>
            <FormRow name="category" label="Category">
              <Select
                value={form.watch('category') || undefined}
                onValueChange={(v) => form.setValue('category', v, { shouldDirty: true })}
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {templateCategories.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormRow>
            <FormRow name="thumbnailUrl" label="Thumbnail URL" hint="Shown in the template gallery">
              <Input {...form.register('thumbnailUrl')} id="thumbnailUrl" placeholder="https://..." />
            </FormRow>
            <FormRow name="previewUrl" label="Preview URL" hint="Full-size preview image">
              <Input {...form.register('previewUrl')} id="previewUrl" placeholder="https://..." />
            </FormRow>
          </div>
        </SectionCard>
      )}
    />
  );
}
