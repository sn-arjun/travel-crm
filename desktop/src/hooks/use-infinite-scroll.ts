'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { unwrapList } from '@/lib/api/envelope';
import type { ApiError } from '@/lib/api';

interface UseInfiniteScrollOptions<T> {
  fetcher: (page: number, limit: number) => Promise<unknown>;
  limit?: number;
  /** Extract items array from the API response. Defaults to the envelope helper. */
  extractItems?: (response: unknown) => T[];
  /** Extract total count from the API response. Defaults to the envelope helper. */
  extractTotal?: (response: unknown) => number;
  /**
   * When provided, page 1 is (re)loaded only when this key changes or `refetch()`
   * is called - a new `fetcher` function identity does NOT refetch. When omitted,
   * the legacy behaviour applies: page 1 reloads whenever `fetcher` changes.
   */
  queryKey?: string;
}

function toApiError(err: unknown): ApiError {
  return err instanceof Object && 'status' in err
    ? (err as ApiError)
    : {
        status: 0,
        message: err instanceof Error && err.message ? err.message : 'Unknown error',
      };
}

export function useInfiniteScroll<T>({
  fetcher,
  limit = 20,
  extractItems,
  extractTotal,
  queryKey,
}: UseInfiniteScrollOptions<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<ApiError | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<ApiError | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const requestIdRef = useRef(0);
  const pageRef = useRef(1);

  // Always-latest inputs, so callbacks stay stable across parent re-renders.
  const fetcherRef = useRef(fetcher);
  const extractItemsRef = useRef(extractItems);
  const extractTotalRef = useRef(extractTotal);
  const limitRef = useRef(limit);
  fetcherRef.current = fetcher;
  extractItemsRef.current = extractItems;
  extractTotalRef.current = extractTotal;
  limitRef.current = limit;

  const stateRef = useRef({ hasMore: true, loading: true, loadingMore: false, hasLoadMoreError: false });
  stateRef.current = {
    hasMore,
    loading,
    loadingMore,
    hasLoadMoreError: loadMoreError !== null,
  };

  const loadPage = useCallback(async (pageNum: number, append: boolean) => {
    const requestId = ++requestIdRef.current;
    setLoadMoreError(null);
    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
      const pageLimit = limitRef.current;
      const response = await fetcherRef.current(pageNum, pageLimit);
      // A newer request has since superseded this one - drop this stale response.
      if (requestId !== requestIdRef.current) return;

      const normalised = unwrapList<T>(response);
      const newItems = extractItemsRef.current ? extractItemsRef.current(response) : normalised.data;
      const totalCount = extractTotalRef.current
        ? extractTotalRef.current(response)
        : normalised.pagination.total;

      pageRef.current = pageNum;
      setTotal(totalCount);
      setItems((prev) => (append ? [...prev, ...newItems] : newItems));
      setHasMore(pageNum * pageLimit < totalCount);
      setError(null);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      const apiError = toApiError(err);
      if (append) {
        setLoadMoreError(apiError);
      } else {
        setError(apiError);
        setItems([]);
        setHasMore(false);
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  // Initial load. With a queryKey only the key triggers a reload; without one a
  // new fetcher identity does (legacy behaviour for direct users).
  const trigger = queryKey !== undefined ? queryKey : fetcher;
  useEffect(() => {
    pageRef.current = 1;
    void loadPage(1, false);
  }, [loadPage, trigger]);

  const loadNext = useCallback(() => {
    const s = stateRef.current;
    if (!s.hasMore || s.loading || s.loadingMore) return;
    void loadPage(pageRef.current + 1, true);
  }, [loadPage]);

  // IntersectionObserver for auto-loading. After a load-more error it waits for
  // an explicit retry rather than hammering the API.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !stateRef.current.hasLoadMoreError) loadNext();
      },
      { threshold: 0.1 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, loadMoreError, loadNext]);

  const refetch = useCallback(() => {
    pageRef.current = 1;
    setItems([]);
    void loadPage(1, false);
  }, [loadPage]);

  const retryLoadMore = useCallback(() => {
    if (stateRef.current.loadingMore) return;
    void loadPage(pageRef.current + 1, true);
  }, [loadPage]);

  return {
    items,
    loading,
    loadingMore,
    hasMore,
    total,
    error,
    loadMoreError,
    sentinelRef,
    refetch,
    retryLoadMore,
  };
}
