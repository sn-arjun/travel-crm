'use client';

import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { EntityForm, FormRow, RelationCombobox } from '@/components/domain';
import { SectionCard } from '@/components/ui';
import { marketingApi, type FlyerTemplate } from '@/lib/api/marketing';
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

export default function NewFlyerPage() {
  const router = useRouter();

  return (
    <EntityForm<FlyerForm>
      title="New flyer"
      description="Pick a template and customize your flyer."
      schema={schema}
      defaultValues={{
        title: '',
        templateId: '',
        headline: 'Discover Paradise',
        subheadline: 'Experience the best beach destinations',
        offerText: 'Special Summer Offer: 30% Off',
        contactInfo: '',
        colorScheme: 'ocean',
        fontSize: 'medium',
      }}
      prefillFromParams={{ templateId: 'templateId' }}
      onCancel={() => router.back()}
      onSubmit={async (values) => {
        try {
          const res = await marketingApi.flyers.create({
            templateId: values.templateId,
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
          toast.success('Flyer created');
          router.push(`/marketing/flyers/${res.data.id}`);
        } catch {
          toast.error('Failed to create flyer');
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
                  onCreateNew={() => router.push('/marketing/flyers/templates/new')}
                  createNewLabel="Create new template"
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
