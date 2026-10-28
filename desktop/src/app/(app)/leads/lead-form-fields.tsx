'use client';

import * as React from 'react';
import { RelationCombobox } from '@/components/domain';
import { Checkbox } from '@/components/ui';
import { contactsApi } from '@/lib/api/contacts';
import { usersApi } from '@/lib/api/users';
import { unwrapEntity, unwrapList } from '@/lib/api/envelope';
import type { Contact, User } from '@travelcrm/shared';

/** Searchable contact picker shared by the new and edit lead forms. */
export function LeadContactField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (id: string) => void;
  error?: string;
}) {
  return (
    <RelationCombobox<Contact>
      value={value || null}
      onChange={(id) => onChange(id ?? '')}
      fetcher={async (q, page) => {
        const list = unwrapList<Contact>(await contactsApi.list({ search: q, page, limit: 20 }), { page, limit: 20 });
        return { items: list.data, total: list.pagination.total };
      }}
      getOptionId={(c) => c.id}
      getOptionLabel={(c) => c.name}
      getOptionDescription={(c) => c.email ?? undefined}
      resolveSelected={async (id) => unwrapEntity<Contact>(await contactsApi.getById(id))}
      placeholder="Select a contact"
      searchPlaceholder="Search contacts..."
      required
      error={error}
    />
  );
}

/**
 * "Assigned to" picker with an explicit Unassigned choice.
 * Unassigned submits `assignedTo: null`; leaving the picker empty keeps auto-assignment.
 */
export function LeadAssigneeField({
  assignedTo,
  unassigned,
  onAssignedToChange,
  onUnassignedChange,
}: {
  assignedTo: string;
  unassigned: boolean;
  onAssignedToChange: (id: string) => void;
  onUnassignedChange: (value: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-ds-2">
      <RelationCombobox<User>
        value={unassigned ? null : assignedTo || null}
        onChange={(id) => onAssignedToChange(id ?? '')}
        fetcher={async (q, page) => {
          const r = await usersApi.list({ search: q, page, limit: 20 });
          return { items: r.data, total: r.pagination.total };
        }}
        getOptionId={(u) => u.id}
        getOptionLabel={(u) => u.name || u.email}
        getOptionDescription={(u) => u.email}
        resolveSelected={async (id) => unwrapEntity<User>(await usersApi.getById(id))}
        placeholder="Select agent"
        searchPlaceholder="Search team..."
        disabled={unassigned}
      />
      <label className="flex items-center gap-ds-2 text-sm text-ds-foreground">
        <Checkbox
          checked={unassigned}
          onCheckedChange={(v) => onUnassignedChange(v === true)}
          aria-label="Leave unassigned"
        />
        Unassigned
        <span className="text-xs text-ds-foreground-muted">
          {unassigned ? 'Nobody owns this lead yet' : 'Leave the agent empty to auto-assign'}
        </span>
      </label>
    </div>
  );
}
