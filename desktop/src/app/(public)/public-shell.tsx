'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The frame around the public pages: the product header and footer. The booking page (/book/...) and the traveller self-service page (/trip/...)
 * are the agency's pages, shown in its own branding (the booking page often inside an iframe on the agency's website), so they get no
 * product chrome at all.
 */
export function PublicShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith('/book/') || pathname?.startsWith('/trip/')) {
    return <div className="min-h-screen bg-ds-background">{children}</div>;
  }
  return (
    <div className="min-h-screen bg-ds-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/login" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ds-primary text-sm font-bold text-ds-primary-foreground">T</span>
            <span className="text-lg font-semibold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              TravelCRM Pro
            </span>
          </Link>
          <nav className="flex gap-4 text-sm text-muted-foreground">
            <Link href="/quick-start" className="hover:text-foreground">Quick start</Link>
            <Link href="/download" className="hover:text-foreground">Download</Link>
            <Link href="/login" className="hover:text-foreground">Sign in</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
      <footer className="mx-auto max-w-3xl px-4 pb-8 text-xs text-muted-foreground">TravelCRM Pro</footer>
    </div>
  );
}
