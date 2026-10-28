'use client';

import * as React from 'react';

import { GroupToursGate } from './_components/group-tours-gate';

/** Everything under /departures needs group departures on the plan and switched on by the agency. */
export default function DeparturesLayout({ children }: { children: React.ReactNode }) {
  return <GroupToursGate>{children}</GroupToursGate>;
}
