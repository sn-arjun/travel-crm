'use client';

import * as React from 'react';
import { Variable } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { useGroupTours } from '@/hooks/use-group-tours';
import { useT } from '@/lib/i18n';

/** The variables a departure fills in (R154). Pickup, seats and crew only mean something for a message sent for a departure. */
const DEPARTURE_VARIABLES = [
  'tour_name', 'departure_date', 'departure_code', 'return_date', 'pickup_point', 'pickup_time', 'pickup_address', 'seat_count',
  'passenger_names', 'room_type', 'balance_due', 'extras_link', 'details_link', 'tour_leader_name', 'tour_leader_phone',
] as const;

/** A second group in the template variable picker. Shown only when the plan has group departures and the agency switched them on. */
export function DepartureVariables({ onInsert }: { onInsert: (variable: string) => void }) {
  const t = useT();
  const { enabled } = useGroupTours();
  if (!enabled) return null;
  return (
    <Card data-testid="departure-variables">
      <CardHeader>
        <CardTitle className="text-ds-sm flex items-center gap-ds-2">
          <Variable className="h-4 w-4" /> {t('departureMessages.variables.title')}
        </CardTitle>
        <p className="text-ds-xs text-ds-foreground-muted">{t('departureMessages.variables.hint')}</p>
      </CardHeader>
      <CardContent className="space-y-ds-2">
        {DEPARTURE_VARIABLES.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onInsert(`{${key}}`)}
            className="w-full flex items-center justify-between gap-ds-2 px-ds-3 py-ds-2 rounded-ds-md text-start text-ds-sm hover:bg-ds-surface-sunken transition-colors"
          >
            <span className="text-ds-foreground-muted">{t(`departureMessages.variables.${key}`)}</span>
            <code className="text-ds-xs font-mono text-ds-primary">{`{${key}}`}</code>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
