'use client';

import * as React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';

/**
 * Section-to-"new" page mapping for Ctrl+N navigation.
 * Maps a path prefix to its corresponding "new" creation route.
 */
const NEW_PAGE_MAP: Record<string, string> = {
  '/invoices': '/invoices/new',
  '/contacts': '/contacts/new',
  '/leads': '/leads/new',
  '/itineraries': '/itineraries/new',
  '/suppliers': '/suppliers/new',
  '/travellers': '/travellers/new',
  '/visa': '/visa/new',
  '/vouchers': '/vouchers/new',
  '/payments': '/payments/new',
  '/campaigns': '/campaigns/new',
  '/fleet/vehicles': '/fleet/vehicles/new',
  '/fleet/drivers': '/fleet/drivers/new',
  '/fleet/trips': '/fleet/trips/new',
  '/fleet/rate-cards': '/fleet/rate-cards/new',
  '/rate-cards': '/rate-cards/new',
  '/tasks': '/tasks', // tasks uses a dialog, not a route
};

/**
 * Global keyboard shortcuts provider that wraps the app layout.
 *
 * Shortcuts:
 * - Ctrl/Cmd+K: Already handled by CommandPalette (focus search / open palette)
 * - Ctrl/Cmd+N: Navigate to "new" page for the current section
 * - Escape: Close any open dialog/sheet (by dispatching Escape key to the document)
 */
export function KeyboardShortcutsProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const shortcuts = React.useMemo(() => [
    {
      key: 'n',
      ctrl: true,
      description: 'Create new item for current section',
      action: () => {
        // Find the best matching "new" route for the current pathname.
        // Try longest prefix first for specificity (e.g., /fleet/vehicles before /fleet).
        const sortedPrefixes = Object.keys(NEW_PAGE_MAP).sort((a, b) => b.length - a.length);
        for (const prefix of sortedPrefixes) {
          if (pathname.startsWith(prefix)) {
            const target = NEW_PAGE_MAP[prefix];
            if (target && target !== pathname) {
              router.push(target);
            }
            return;
          }
        }
      },
    },
    {
      key: 'Escape',
      description: 'Close open dialog or sheet',
      action: () => {
        // Dispatch an Escape keydown event so Radix UI dialogs/sheets respond.
        // We only do this if no input/textarea is focused (to avoid interfering with form editing).
        const active = document.activeElement;
        const isInput = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
        if (!isInput) {
          document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape',
            code: 'Escape',
            bubbles: true,
          }));
        }
      },
    },
  ], [pathname, router]);

  useKeyboardShortcuts(shortcuts);

  return <>{children}</>;
}
