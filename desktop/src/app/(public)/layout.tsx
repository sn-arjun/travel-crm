import * as React from 'react';
import { PublicShell } from './public-shell';

/** Pages that open without signing in: shared quotations, booking pages, the download page and the quick-start guide. */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <PublicShell>{children}</PublicShell>;
}
