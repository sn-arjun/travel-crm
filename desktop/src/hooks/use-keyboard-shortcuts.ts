'use client';

import { useEffect, useCallback } from 'react';

interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  action: () => void;
  description?: string;
}

/**
 * Hook to register keyboard shortcuts across the app.
 * Automatically handles platform differences (Cmd on macOS, Ctrl on Windows/Linux).
 */
export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        const isMac = navigator.platform.toUpperCase().includes('MAC');
        const modifierKey = shortcut.meta || shortcut.ctrl;
        const modifierPressed = isMac ? event.metaKey : event.ctrlKey;

        if (
          event.key.toLowerCase() === shortcut.key.toLowerCase() &&
          (!modifierKey || modifierPressed) &&
          (!shortcut.shift || event.shiftKey) &&
          (!shortcut.alt || event.altKey)
        ) {
          event.preventDefault();
          shortcut.action();
          break;
        }
      }
    },
    [shortcuts],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
