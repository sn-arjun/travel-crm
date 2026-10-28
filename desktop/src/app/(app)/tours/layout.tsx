'use client';

import * as React from 'react';

import { GroupToursGate } from '../departures/_components/group-tours-gate';

/** Everything under /tours needs group departures on the plan and switched on by the agency. */
export default function ToursLayout({ children }: { children: React.ReactNode }) {
  return <GroupToursGate>{children}</GroupToursGate>;
}
