'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { assistantApi, type Suggestion, type SuggestionFilter } from '@/lib/api/assistant';
import { useRealtimeConnected, useRealtimeEvent } from '@/hooks/use-realtime-event';

export interface UseSuggestionsResult {
  suggestions: Suggestion[];
  loading: boolean;
  /** Fetch again without showing a loading state. */
  refresh: () => Promise<void>;
}

/**
 * Suggestions about one record (or the whole workspace when the filter is empty).
 * Stays current: the backend announces every new, applied or dismissed suggestion,
 * and a slow poll covers a dropped live connection.
 */
export function useSuggestions(filter: SuggestionFilter, enabled = true): UseSuggestionsResult {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(enabled);
  const key = JSON.stringify(filter);
  const request = useRef(0);

  const load = useCallback(async () => {
    if (!enabled) return;
    const id = ++request.current;
    try {
      const res = await assistantApi.listSuggestions(JSON.parse(key) as SuggestionFilter);
      if (id === request.current) setSuggestions(Array.isArray(res.data) ? res.data : []);
    } catch {
      // The assistant is an addition to the screen; a failed fetch must never break it.
      if (id === request.current) setSuggestions([]);
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [key, enabled]);

  useEffect(() => {
    setLoading(enabled);
    void load();
    return () => {
      request.current++;
    };
  }, [load, enabled]);

  useRealtimeEvent('assistant:suggestion', () => {
    void load();
  });

  const connected = useRealtimeConnected();
  useEffect(() => {
    if (connected || !enabled) return;
    const timer = setInterval(() => void load(), 15_000);
    return () => clearInterval(timer);
  }, [connected, enabled, load]);

  return { suggestions, loading, refresh: load };
}
