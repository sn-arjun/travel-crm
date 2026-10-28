'use client';

import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { EntityForm, FormRow } from '@/components/domain';
import { Input, SectionCard } from '@/components/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { marketingApi } from '@/lib/api/marketing';

const templateCategories = ['festival', 'seasonal', 'promotional', 'general'];

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  category: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  previewUrl: z.string().optional(),
});
type TemplateForm = z.infer<typeof schema>;

export default function NewFlyerTemplatePage() {
  const router = useRouter();

  return (
    <EntityForm<TemplateForm>
      title="New flyer template"
      description="Add a reusable template for flyer campaigns."
      schema={schema}
      defaultValues={{ name: '', category: '', thumbnailUrl: '', previewUrl: '' }}
      onCancel={() => router.back()}
      onSubmit={async (values) => {
        try {
          await marketingApi.flyerTemplates.create({
            name: values.name,
            category: values.category || undefined,
            thumbnailUrl: values.thumbnailUrl || undefined,
            previewUrl: values.previewUrl || undefined,
          });
          toast.success('Template created');
          router.push('/marketing/flyers/templates');
        } catch {
          toast.error('Failed to create template');
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
