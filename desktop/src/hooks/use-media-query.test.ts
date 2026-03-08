import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMediaQuery } from './use-media-query';

describe('useMediaQuery', () => {
  let listeners: Map<string, ((event: MediaQueryListEvent) => void)[]>;
  let matchesMap: Map<string, boolean>;

  beforeEach(() => {
    listeners = new Map();
    matchesMap = new Map();

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => {
        if (!listeners.has(query)) {
          listeners.set(query, []);
        }
        return {
          matches: matchesMap.get(query) || false,
          media: query,
          addEventListener: (type: string, listener: (event: MediaQueryListEvent) => void) => {
            if (type === 'change') {
              listeners.get(query)!.push(listener);
            }
          },
          removeEventListener: (type: string, listener: (event: MediaQueryListEvent) => void) => {
            if (type === 'change') {
              const arr = listeners.get(query)!;
              const idx = arr.indexOf(listener);
              if (idx >= 0) arr.splice(idx, 1);
            }
          },
        };
      }),
    });
  });

  it('should return false when query does not match', () => {
    matchesMap.set('(min-width: 1024px)', false);
    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'));
    expect(result.current).toBe(false);
  });

  it('should return true when query matches', () => {
    matchesMap.set('(min-width: 1024px)', true);
    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'));
    expect(result.current).toBe(true);
  });

  it('should update when media query changes', () => {
    matchesMap.set('(max-width: 767px)', false);
    const { result } = renderHook(() => useMediaQuery('(max-width: 767px)'));

    expect(result.current).toBe(false);

    act(() => {
      const queryListeners = listeners.get('(max-width: 767px)');
      queryListeners?.forEach((listener) => {
        listener({ matches: true } as MediaQueryListEvent);
      });
    });

    expect(result.current).toBe(true);
  });

  it('should clean up event listener on unmount', () => {
    matchesMap.set('(min-width: 768px)', false);
    const { unmount } = renderHook(() => useMediaQuery('(min-width: 768px)'));

    expect(listeners.get('(min-width: 768px)')!.length).toBe(1);

    unmount();

    expect(listeners.get('(min-width: 768px)')!.length).toBe(0);
  });
});
