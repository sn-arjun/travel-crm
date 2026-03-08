import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useApiQuery, useApiMutation, usePaginatedQuery, useApiInfiniteQuery } from './use-api';

describe('useApiQuery', () => {
  it('should start in loading state', () => {
    const fetcher = vi.fn().mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useApiQuery(fetcher));

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('should return data on successful fetch', async () => {
    const mockData = [{ id: '1', name: 'Contact A' }];
    const fetcher = vi.fn().mockResolvedValue(mockData);

    const { result } = renderHook(() => useApiQuery(fetcher));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual(mockData);
    expect(result.current.error).toBeNull();
  });

  it('should return ApiError on failure', async () => {
    const apiError = { status: 500, message: 'Internal Server Error' };
    const fetcher = vi.fn().mockRejectedValue(apiError);

    const { result } = renderHook(() => useApiQuery(fetcher));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toEqual(apiError);
  });

  it('should handle non-ApiError exceptions', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('Network failed'));

    const { result } = renderHook(() => useApiQuery(fetcher));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toEqual({ status: 0, message: 'Unknown error' });
  });

  it('should refetch data', async () => {
    let callCount = 0;
    const fetcher = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({ count: callCount });
    });

    const { result } = renderHook(() => useApiQuery(fetcher));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ count: 1 });

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.data).toEqual({ count: 2 });
  });
});

describe('useApiMutation', () => {
  it('should start in idle state', () => {
    const mutationFn = vi.fn();
    const { result } = renderHook(() => useApiMutation(mutationFn));

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('should execute mutation and return data', async () => {
    const response = { id: '1', name: 'Created Contact' };
    const mutationFn = vi.fn().mockResolvedValue(response);

    const { result } = renderHook(() => useApiMutation(mutationFn));

    let mutateResult: unknown;
    await act(async () => {
      mutateResult = await result.current.mutate({ name: 'Test' });
    });

    expect(mutateResult).toEqual(response);
    expect(result.current.data).toEqual(response);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should handle mutation error', async () => {
    const apiError = { status: 400, message: 'Validation failed' };
    const mutationFn = vi.fn().mockRejectedValue(apiError);

    const { result } = renderHook(() => useApiMutation(mutationFn));

    let mutateResult: unknown;
    await act(async () => {
      mutateResult = await result.current.mutate({ bad: 'data' });
    });

    expect(mutateResult).toBeNull();
    expect(result.current.error).toEqual(apiError);
    expect(result.current.data).toBeNull();
  });

  it('should reset state', async () => {
    const mutationFn = vi.fn().mockResolvedValue({ id: '1' });
    const { result } = renderHook(() => useApiMutation(mutationFn));

    await act(async () => {
      await result.current.mutate({});
    });

    expect(result.current.data).not.toBeNull();

    act(() => {
      result.current.reset();
    });

    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });
});

describe('usePaginatedQuery', () => {
  it('should fetch first page automatically', async () => {
    const mockResponse = {
      data: [{ id: '1' }],
      pagination: { page: 1, limit: 10, total: 50, totalPages: 5 },
    };
    const fetcher = vi.fn().mockResolvedValue(mockResponse);

    const { result } = renderHook(() => usePaginatedQuery(fetcher));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual([{ id: '1' }]);
    expect(result.current.pagination.page).toBe(1);
    expect(result.current.pagination.total).toBe(50);
    expect(result.current.pagination.totalPages).toBe(5);
  });

  it('should fetch specific page when setPage is called', async () => {
    const fetcher = vi.fn().mockImplementation((page: number, limit: number) =>
      Promise.resolve({
        data: [{ id: `item-p${page}` }],
        pagination: { page, limit, total: 100, totalPages: 10 },
      }),
    );

    const { result } = renderHook(() => usePaginatedQuery(fetcher));

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      result.current.setPage(3);
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetcher).toHaveBeenCalledWith(3, 10);
  });
});

describe('useApiInfiniteQuery', () => {
  it('should load initial page', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      data: [{ id: '1' }, { id: '2' }],
      pagination: { page: 1, limit: 10, total: 25, totalPages: 3 },
    });

    const { result } = renderHook(() => useApiInfiniteQuery(fetcher, 10));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toHaveLength(2);
    expect(result.current.hasMore).toBe(true);
  });

  it('should append data on loadMore', async () => {
    let callCount = 0;
    const fetcher = vi.fn().mockImplementation((page: number) => {
      callCount++;
      return Promise.resolve({
        data: [{ id: `item-${callCount}` }],
        pagination: { page, limit: 10, total: 20, totalPages: 2 },
      });
    });

    const { result } = renderHook(() => useApiInfiniteQuery(fetcher, 10));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toHaveLength(1);

    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.data).toHaveLength(2);
  });
});
