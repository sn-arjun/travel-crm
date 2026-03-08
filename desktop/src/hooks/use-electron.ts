'use client';

import { useEffect, useState, useCallback } from 'react';

/**
 * Hook to detect if running inside Electron and access its APIs.
 */
export function useElectron() {
  const [isElectron, setIsElectron] = useState(false);

  useEffect(() => {
    setIsElectron(typeof window !== 'undefined' && !!window.electronAPI);
  }, []);

  const minimize = useCallback(() => window.electronAPI?.minimize(), []);
  const maximize = useCallback(() => window.electronAPI?.maximize(), []);
  const close = useCallback(() => window.electronAPI?.close(), []);

  return {
    isElectron,
    minimize,
    maximize,
    close,
  };
}

/**
 * Hook to listen for Electron keyboard shortcuts.
 */
export function useElectronShortcuts(
  onShortcut: (shortcut: string) => void,
) {
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI) return;
    const cleanup = window.electronAPI.onShortcut(onShortcut);
    return cleanup;
  }, [onShortcut]);
}

/**
 * Hook to listen for Electron quick actions (from tray menu).
 */
export function useElectronQuickActions(
  onAction: (action: string) => void,
) {
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI) return;
    const cleanup = window.electronAPI.onQuickAction(onAction);
    return cleanup;
  }, [onAction]);
}
