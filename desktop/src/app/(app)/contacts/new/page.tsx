'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { EntityForm } from '@/components/domain';
import { contactsApi } from '@/lib/api/contacts';

import {
  ContactFormFields, contactSchema, EMPTY_CONTACT, formValuesToPayload, type ContactFormValues,
} from '../_lib/contact-form';

export default function NewContactPage() {
  const router = useRouter();

  return (
    <EntityForm<ContactFormValues>
      title="New Contact"
      description="Add a new contact to your CRM"
      schema={contactSchema}
      defaultValues={EMPTY_CONTACT}
      submitLabel="Save Contact"
      onCancel={() => router.back()}
      onSubmit={async (values) => {
        await contactsApi.create(formValuesToPayload(values));
        toast.success('Contact created successfully');
        router.push('/contacts');
      }}
      renderSections={(form) => <ContactFormFields form={form} />}
    />
  );
}
