'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiError } from '@/lib/api';

interface UseInfiniteScrollOptions<T> {
  fetcher: (page: number, limit: number) => Promise<any>;
  limit?: number;
  /** Extract items array from the API response */
  extractItems?: (response: any) => T[];
  /** Extract total count from the API response */
  extractTotal?: (response: any) => number;
}

export function useInfiniteScroll<T>({
  fetcher,
  limit = 20,
  extractItems,
  extractTotal,
}: UseInfiniteScrollOptions<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<ApiError | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const defaultExtractItems = useCallback((res: any): T[] => {
    const data = res?.data;
    if (Array.isArray(data)) return data;
    if (data?.data && Array.isArray(data.data)) return data.data;
    return [];
  }, []);

  const defaultExtractTotal = useCallback((res: any): number => {
    return res?.data?.pagination?.total ?? res?.pagination?.total ?? 0;
  }, []);

  const getItems = extractItems || defaultExtractItems;
  const getTotal = extractTotal || defaultExtractTotal;

  const loadPage = useCallback(async (pageNum: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
      const response = await fetcher(pageNum, limit);
      const newItems = getItems(response);
      const totalCount = getTotal(response);

      setTotal(totalCount);
      setItems(prev => append ? [...prev, ...newItems] : newItems);
      setHasMore(pageNum * limit < totalCount);
      setError(null);
    } catch (err) {
      const apiError = err instanceof Object && 'status' in err
        ? (err as ApiError)
        : { status: 0, message: 'Unknown error' };
      setError(apiError);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [fetcher, limit, getItems, getTotal]);

  // Initial load
  useEffect(() => {
    setPage(1);
    loadPage(1, false);
  }, [loadPage]);

  // IntersectionObserver for auto-loading
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loading && !loadingMore) {
          const nextPage = page + 1;
          setPage(nextPage);
          loadPage(nextPage, true);
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, page, loadPage]);

  const refetch = useCallback(() => {
    setPage(1);
    setItems([]);
    loadPage(1, false);
  }, [loadPage]);

  return {
    items,
    loading,
    loadingMore,
    hasMore,
    total,
    error,
    sentinelRef,
    refetch,
  };
}
