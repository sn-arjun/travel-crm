'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

import { EntityForm } from '@/components/domain';
import { PageContainer } from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useApiQuery } from '@/hooks/use-api';
import { contactsApi } from '@/lib/api/contacts';

import {
  ContactFormFields, contactSchema, contactToFormValues, formValuesToUpdate, type ContactFormValues,
} from '../../_lib/contact-form';

export default function EditContactPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const contactId = params.id;

  const { data, loading, error, refetch } = useApiQuery(() => contactsApi.getById(contactId), [contactId]);
  const contact = data?.data;

  const defaults = React.useMemo(() => (contact ? contactToFormValues(contact) : null), [contact]);

  if (loading) {
    return (
      <PageContainer width="narrow">
        <div className="flex flex-col gap-ds-4" aria-busy="true">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      </PageContainer>
    );
  }

  if (error || !contact || !defaults) {
    return (
      <PageContainer width="narrow">
        <EmptyState
          icon={<AlertCircle aria-hidden="true" />}
          title="Could not load this contact"
          description="It may have been deleted, or the connection dropped."
          action={
            <div className="flex gap-ds-2">
              <Button variant="outline" onClick={() => void refetch()}>Try again</Button>
              <Button onClick={() => router.push('/contacts')}>Back to contacts</Button>
            </div>
          }
        />
      </PageContainer>
    );
  }

  return (
    <EntityForm<ContactFormValues>
      title="Edit Contact"
      description={contact.name}
      schema={contactSchema}
      defaultValues={defaults}
      submitLabel="Save Changes"
      onCancel={() => router.back()}
      onSubmit={async (values) => {
        await contactsApi.update(contactId, formValuesToUpdate(values));
        toast.success('Contact updated successfully');
        router.push(`/contacts/${contactId}`);
      }}
      renderSections={(form) => <ContactFormFields form={form} currentId={contactId} />}
    />
  );
}
