'use client';

import { useCallback, useEffect, useState } from 'react';
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

/**
 * Hook for fetching data from the API with automatic error handling and refetch.
 */
export function useApiQuery<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
): UseApiQueryState<T> & { refetch: () => Promise<void> } {
  const [state, setState] = useState<UseApiQueryState<T>>({
    data: null,
    loading: true,
    error: null,
  });

  const refetch = useCallback(async () => {
    setState({ data: null, loading: true, error: null });
    try {
      const result = await fetcher();
      setState({ data: result, loading: false, error: null });
    } catch (error) {
      const apiError = error instanceof Object && 'status' in error ? (error as ApiError) : { status: 0, message: 'Unknown error' };
      setState({ data: null, loading: false, error: apiError });
    }
  }, [fetcher]);

  useEffect(() => {
    refetch();
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
    refetch();
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
    refetch();
  }, [refetch]);

  const hasMore = state.pagination.page < state.pagination.totalPages;

  return {
    ...state,
    hasMore,
    loadMore,
    refetch,
  };
}
