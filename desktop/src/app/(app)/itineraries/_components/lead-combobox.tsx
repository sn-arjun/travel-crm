'use client';

import * as React from 'react';
import { RelationCombobox } from '@/components/domain';
import { leadsApi } from '@/lib/api/leads';
import { unwrapEntity, unwrapList } from '@/lib/api/envelope';

interface LeadOption {
  id: string;
  title?: string;
  contactName?: string | null;
}

function leadLabel(l: LeadOption): string {
  const title = l.title ?? l.id;
  return l.contactName ? `${title} - ${l.contactName}` : title;
}

interface LeadComboboxProps {
  value: string | null;
  onChange: (id: string | null) => void;
  required?: boolean;
  error?: string;
  'aria-label'?: string;
}

/** Searchable lead picker (never a raw id input). Resolves the label for a pre-filled id. */
export function LeadCombobox({ value, onChange, required, error, ...aria }: LeadComboboxProps) {
  return (
    <RelationCombobox<LeadOption>
      value={value}
      onChange={(id) => onChange(id)}
      fetcher={async (query, page) => {
        const res = unwrapList<LeadOption>(await leadsApi.list({ search: query || undefined, page, limit: 20 }));
        return { items: res.data, total: res.pagination?.total ?? res.data.length };
      }}
      getOptionId={(l) => l.id}
      getOptionLabel={leadLabel}
      resolveSelected={async (id) => unwrapEntity<LeadOption>(await leadsApi.getById(id))}
      placeholder="Search leads by name…"
      searchPlaceholder="Search leads by name…"
      emptyText="No leads found"
      required={required}
      error={error}
      {...aria}
    />
  );
}
