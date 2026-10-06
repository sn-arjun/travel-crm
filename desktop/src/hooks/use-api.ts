'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiError } from '@/lib/api';

// ============================================================================
// Types
// ============================================================================

interface UseApiQueryState<T> {
  data: T | null;
  loading: boolean;
  error: ApiError | null;
}

interface UseApiMutationState<TOutput> {
  data: TOutput | null;
  loading: boolean;
  error: ApiError | null;
}

interface UsePaginationState {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ============================================================================
// useApiQuery
// ============================================================================

export interface RefetchOptions {
  /**
   * Keep the current data (and `loading: false`) while the request is in flight.
   * Use it for polling and manual refresh so content never swaps for a skeleton.
   * A failed silent refetch keeps the last good data and does not raise an error.
   */
  silent?: boolean;
}

function depsChanged(a: unknown[], b: unknown[]): boolean {
  return a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
}

/**
 * Hook for fetching data from the API with automatic error handling and refetch.
 */
export function useApiQuery<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
): UseApiQueryState<T> & { refetch: (options?: RefetchOptions) => Promise<void> } {
  const [state, setState] = useState<UseApiQueryState<T>>({
    data: null,
    loading: true,
    error: null,
  });
  const fetcherRef = useRef(fetcher);
  const requestId = useRef(0);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  // When the dependencies change, show the loading state in the same render (no stale data flash).
  const [prevDeps, setPrevDeps] = useState(deps);
  if (depsChanged(prevDeps, deps)) {
    setPrevDeps(deps);
    setState({ data: null, loading: true, error: null });
  }

  const run = useCallback(async (silent: boolean) => {
    const id = ++requestId.current;
    try {
      const result = await fetcherRef.current();
      if (id === requestId.current) setState({ data: result, loading: false, error: null });
    } catch (error) {
      if (id !== requestId.current) return;
      if (silent) {
        setState((prev) => (prev.loading ? { ...prev, loading: false } : prev));
      } else {
        const apiError = error instanceof Object && 'status' in error ? (error as ApiError) : { status: 0, message: 'Unknown error' };
        setState({ data: null, loading: false, error: apiError });
      }
    }
  }, []);

  const refetch = useCallback(
    async (options?: RefetchOptions) => {
      // Handlers such as onClick={refetch} pass an event object; only an explicit flag counts.
      const silent = options?.silent === true;
      if (!silent) setState({ data: null, loading: true, error: null });
      await run(silent);
    },
    [run],
  );

  useEffect(() => {
    void run(false);
    return () => {
      requestId.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ...state, refetch };
}

// ============================================================================
// useApiMutation
// ============================================================================

/**
 * Hook for executing API mutations (POST, PUT, PATCH, DELETE) with loading and error handling.
 */
export function useApiMutation<TInput, TOutput>(
  mutationFn: (input: TInput) => Promise<TOutput>,
): UseApiMutationState<TOutput> & {
  mutate: (input: TInput) => Promise<TOutput | null>;
  reset: () => void;
} {
  const [state, setState] = useState<UseApiMutationState<TOutput>>({
    data: null,
    loading: false,
    error: null,
  });

  const mutate = useCallback(
    async (input: TInput): Promise<TOutput | null> => {
      setState({ data: null, loading: true, error: null });
      try {
        const result = await mutationFn(input);
        setState({ data: result, loading: false, error: null });
        return result;
      } catch (error) {
        const apiError = error instanceof Object && 'status' in error ? (error as ApiError) : { status: 0, message: 'Unknown error' };
        setState({ data: null, loading: false, error: apiError });
        return null;
      }
    },
    [mutationFn],
  );

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null });
  }, []);

  return { ...state, mutate, reset };
}

// ============================================================================
// usePaginatedQuery
// ============================================================================

/**
 * Hook for paginated API queries with automatic page management.
 */
export function usePaginatedQuery<T>(
  fetcher: (page: number, limit: number) => Promise<{ data: T[]; pagination: UsePaginationState }>,
  initialPage: number = 1,
  initialLimit: number = 10,
): {
  data: T[];
  pagination: UsePaginationState;
  loading: boolean;
  error: ApiError | null;
  setPage: (page: number) => void;
  setLimit: (limit: number) => void;
  refetch: () => Promise<void>;
} {
  const [page, setPage] = useState(initialPage);
  const [limit, setLimit] = useState(initialLimit);
  const [state, setState] = useState<{
    data: T[];
    pagination: UsePaginationState;
    loading: boolean;
    error: ApiError | null;
  }>({
    data: [],
    pagination: { page: 1, limit: initialLimit, total: 0, totalPages: 0 },
    loading: true,
    error: null,
  });

  const refetch = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const result = await fetcher(page, limit);
      setState({ ...result, loading: false, error: null });
    } catch (error) {
      const apiError = error instanceof Object && 'status' in error ? (error as ApiError) : { status: 0, message: 'Unknown error' };
      setState((prev) => ({ ...prev, loading: false, error: apiError }));
    }
  }, [page, limit, fetcher]);

  useEffect(() => {
    // Deferred so the loading state is not set synchronously inside the effect.
    queueMicrotask(() => void refetch());
  }, [page, limit, refetch]);

  return {
    ...state,
    setPage,
    setLimit,
    refetch,
  };
}

// ============================================================================
// useApiInfiniteQuery
// ============================================================================

/**
 * Hook for infinite scroll/pagination API queries.
 */
export function useApiInfiniteQuery<T>(
  fetcher: (page: number, limit: number) => Promise<{ data: T[]; pagination: UsePaginationState }>,
  initialLimit: number = 10,
): {
  data: T[];
  pagination: UsePaginationState;
  loading: boolean;
  hasMore: boolean;
  error: ApiError | null;
  loadMore: () => Promise<void>;
  refetch: () => Promise<void>;
} {
  const [page, setPage] = useState(1);
  const [limit] = useState(initialLimit);
  const [state, setState] = useState<{
    data: T[];
    pagination: UsePaginationState;
    loading: boolean;
    error: ApiError | null;
  }>({
    data: [],
    pagination: { page: 1, limit: initialLimit, total: 0, totalPages: 0 },
    loading: true,
    error: null,
  });

  const loadMore = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const nextPage = page + 1;
      const result = await fetcher(nextPage, limit);
      setState((prev) => ({
        data: [...prev.data, ...result.data],
        pagination: result.pagination,
        loading: false,
        error: null,
      }));
      setPage(nextPage);
    } catch (error) {
      const apiError = error instanceof Object && 'status' in error ? (error as ApiError) : { status: 0, message: 'Unknown error' };
      setState((prev) => ({ ...prev, loading: false, error: apiError }));
    }
  }, [page, limit, fetcher]);

  const refetch = useCallback(async () => {
    setPage(1);
    setState({ data: [], pagination: { page: 1, limit: initialLimit, total: 0, totalPages: 0 }, loading: true, error: null });
    try {
      const result = await fetcher(1, limit);
      setState({ ...result, loading: false, error: null });
    } catch (error) {
      const apiError = error instanceof Object && 'status' in error ? (error as ApiError) : { status: 0, message: 'Unknown error' };
      setState((prev) => ({ ...prev, loading: false, error: apiError }));
    }
  }, [limit, initialLimit, fetcher]);

  useEffect(() => {
    // Deferred so the loading state is not set synchronously inside the effect.
    queueMicrotask(() => void refetch());
  }, [refetch]);

  const hasMore = state.pagination.page < state.pagination.totalPages;

  return {
    ...state,
    hasMore,
    loadMore,
    refetch,
  };
}
