'use client';

import * as React from 'react';

import { FormRow, RelationCombobox } from '@/components/domain';
import { SectionCard, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import type { CrewRole } from '@/lib/api/fleet';
import { usersApi } from '@/lib/api/users';
import { useT } from '@/lib/i18n';

interface StaffOption {
  id: string;
  name: string;
  email?: string;
}

interface CrewSectionProps {
  crewRole: CrewRole;
  userId: string;
  onCrewRole: (role: CrewRole) => void;
  onUserId: (id: string) => void;
}

export const CREW_ROLES: readonly CrewRole[] = ['driver', 'tour_leader', 'both'];

/** The label of a crew role, for the form, the list and the detail. */
export function crewRoleLabel(role: CrewRole | undefined, t: (key: string) => string): string {
  return t(`fleet.crew.role.${role ?? 'driver'}`);
}

/**
 * The crew fields of a driver form (R145): whether this person drives, leads tours, or both, and the staff user they are, if any.
 * A tour leader linked to a staff user can run check-in from the desktop as well as from the driver app.
 */
export function CrewSection({ crewRole, userId, onCrewRole, onUserId }: CrewSectionProps) {
  const t = useT();
  return (
    <SectionCard title={t('fleet.crew.title')} description={t('fleet.crew.description')}>
      <div className="grid gap-ds-4 sm:grid-cols-2">
        <FormRow name="crewRole" label={t('fleet.crew.roleLabel')}>
          <Select value={crewRole} onValueChange={(v) => onCrewRole(v as CrewRole)}>
            <SelectTrigger id="crewRole" className="w-full" data-testid="crew-role-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CREW_ROLES.map((r) => <SelectItem key={r} value={r}>{crewRoleLabel(r, t)}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormRow>
        <FormRow name="userId" label={t('fleet.crew.userLabel')} hint={t('fleet.crew.userHint')}>
          <RelationCombobox<StaffOption>
            value={userId || null}
            onChange={(id) => onUserId(id ?? '')}
            fetcher={async (q, page) => {
              const r = await usersApi.list({ search: q || undefined, page, limit: 20 });
              const items = (r.data ?? []) as unknown as StaffOption[];
              return { items, total: r.pagination?.total ?? items.length };
            }}
            getOptionId={(u) => u.id}
            getOptionLabel={(u) => u.name || u.email || u.id}
            getOptionDescription={(u) => u.email}
            resolveSelected={async (id) => {
              const res = await usersApi.getById(id);
              return (res.data as unknown as StaffOption) ?? null;
            }}
            placeholder={t('fleet.crew.userPlaceholder')}
            searchPlaceholder={t('fleet.crew.userSearch')}
          />
        </FormRow>
      </div>
    </SectionCard>
  );
}
