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
 *
 * Escape is deliberately not handled here: Radix dialogs, sheets and popovers
 * close themselves, and re-dispatching the key from a document listener
 * re-enters this same listener forever.
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
  ], [pathname, router]);

  useKeyboardShortcuts(shortcuts);

  return <>{children}</>;
}
