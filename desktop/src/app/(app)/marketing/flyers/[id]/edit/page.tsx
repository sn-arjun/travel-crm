'use client';

import * as React from 'react';
import { z } from 'zod';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { EntityForm, FormRow, RelationCombobox } from '@/components/domain';
import { SectionCard, Skeleton } from '@/components/ui';
import { marketingApi, type FlyerTemplate, type MarketingFlyer } from '@/lib/api/marketing';
import { FlyerContentFields } from '@/components/domain/marketing/flyer-content-fields';

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  templateId: z.string().min(1, 'Pick a template'),
  headline: z.string().min(1, 'Headline is required'),
  subheadline: z.string().optional(),
  offerText: z.string().optional(),
  contactInfo: z.string().optional(),
  colorScheme: z.string(),
  fontSize: z.enum(['small', 'medium', 'large']),
});
type FlyerForm = z.infer<typeof schema>;

export default function EditFlyerPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [flyer, setFlyer] = React.useState<MarketingFlyer | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await marketingApi.flyers.get(params.id);
        if (!cancelled) setFlyer(res.data);
      } catch {
        if (!cancelled) toast.error('Failed to load flyer');
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
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const content = (flyer?.content ?? {}) as Record<string, unknown>;

  return (
    <EntityForm<FlyerForm>
      title="Edit flyer"
      schema={schema}
      defaultValues={{
        title: flyer?.title ?? '',
        templateId: flyer?.templateId ?? '',
        headline: (content.headline as string) ?? '',
        subheadline: (content.subheadline as string) ?? '',
        offerText: (content.offerText as string) ?? '',
        contactInfo: (content.contactInfo as string) ?? '',
        colorScheme: (content.colorScheme as string) ?? 'ocean',
        fontSize: (content.fontSize as FlyerForm['fontSize']) ?? 'medium',
      }}
      onCancel={() => router.back()}
      onSubmit={async (values) => {
        try {
          await marketingApi.flyers.update(params.id, {
            title: values.title,
            content: {
              headline: values.headline,
              subheadline: values.subheadline,
              offerText: values.offerText,
              contactInfo: values.contactInfo,
              colorScheme: values.colorScheme,
              fontSize: values.fontSize,
            },
          });
          toast.success('Flyer updated');
          router.push(`/marketing/flyers/${params.id}`);
        } catch {
          toast.error('Failed to update flyer');
        }
      }}
      renderSections={(form) => (
        <>
          <SectionCard title="Template" required>
            <div className="grid gap-ds-4 sm:grid-cols-2">
              <FormRow name="templateId" label="Template" required wide>
                <RelationCombobox<FlyerTemplate>
                  value={form.watch('templateId') || null}
                  onChange={(id) => form.setValue('templateId', id ?? '', { shouldDirty: true })}
                  fetcher={async (query, page) => {
                    const r = await marketingApi.flyerTemplates.list({ search: query, page, limit: 20 });
                    const items = Array.isArray(r.data) ? r.data : r.data.data;
                    const total = (r as unknown as { pagination?: { total: number } }).pagination?.total ?? r.data.pagination?.total ?? items.length;
                    return { items, total };
                  }}
                  getOptionId={(t) => t.id}
                  getOptionLabel={(t) => t.name}
                  getOptionDescription={(t) => t.category}
                  resolveSelected={async (id) => (await marketingApi.flyerTemplates.get(id)).data}
                  placeholder="Select a template"
                  searchPlaceholder="Search templates..."
                  error={form.formState.errors.templateId?.message}
                  required
                />
              </FormRow>
            </div>
          </SectionCard>

          <SectionCard title="Content & design">
            <FlyerContentFields form={form} />
          </SectionCard>
        </>
      )}
    />
  );
}
