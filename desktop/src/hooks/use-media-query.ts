'use client';

import { useEffect, useState } from 'react';

/**
 * Hook to track a CSS media query match.
 */
export function useMediaQuery(query: string): boolean {
  // Starts false so server and first client render agree; the real value is read after mount.
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMatches(media.matches);

    const listener = (event: MediaQueryListEvent) => setMatches(event.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [query]);

  return matches;
}

/* Breakpoints matching the design system (media-query widths, not layout values). */
/* eslint-disable no-restricted-syntax */
export const useIsMobile = () => useMediaQuery('(max-width: 767px)');
export const useIsTablet = () => useMediaQuery('(min-width: 768px) and (max-width: 1023px)');
export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)');
export const useIsDarkMode = () => useMediaQuery('(prefers-color-scheme: dark)');
export const useReducedMotion = () => useMediaQuery('(prefers-reduced-motion: reduce)');
/* eslint-enable no-restricted-syntax */
