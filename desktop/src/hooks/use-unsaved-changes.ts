'use client';

import { useEffect } from 'react';

/**
 * Hook that warns users when they try to navigate away from a page with unsaved changes.
 * Triggers the browser's native "beforeunload" confirmation dialog when isDirty is true.
 *
 * @param isDirty - Whether the form has unsaved changes
 */
export function useUnsavedChanges(isDirty: boolean) {
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);
}
