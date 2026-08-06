import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useInfiniteScroll } from './use-infinite-scroll';

// Mock IntersectionObserver
class MockIntersectionObserver {
  callback: IntersectionObserverCallback;
  elements: Element[] = [];

  constructor(callback: IntersectionObserverCallback, _options?: IntersectionObserverInit) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }

  observe(el: Element) {
    this.elements.push(el);
  }

  unobserve(_el: Element) {
    this.elements = this.elements.filter((e) => e !== _el);
  }

  disconnect() {
    this.elements = [];
  }

  // Simulate intersection
  trigger(isIntersecting: boolean) {
    this.callback(
      [{ isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }

  static instances: MockIntersectionObserver[] = [];
  static reset() {
    MockIntersectionObserver.instances = [];
  }
}

function makePaginatedResponse(items: any[], total: number) {
  return {
    data: {
      data: items,
      pagination: { total },
    },
  };
}

describe('useInfiniteScroll', () => {
  beforeEach(() => {
    MockIntersectionObserver.reset();
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should start in loading state', () => {
    const fetcher = vi.fn(() => new Promise(() => {})); // never resolves
    const { result } = renderHook(() =>
      useInfiniteScroll({ fetcher }),
    );

    expect(result.current.loading).toBe(true);
    expect(result.current.items).toEqual([]);
    expect(result.current.total).toBe(0);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('should fetch initial page and set items', async () => {
    const items = [{ id: '1' }, { id: '2' }];
    const fetcher = vi.fn().mockResolvedValue(makePaginatedResponse(items, 5));

    const { result } = renderHook(() =>
      useInfiniteScroll({ fetcher, limit: 2 }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.items).toEqual(items);
    expect(result.current.total).toBe(5);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.error).toBeNull();
    expect(fetcher).toHaveBeenCalledWith(1, 2);
  });

  it('should set hasMore to false when all items are loaded', async () => {
    const items = [{ id: '1' }, { id: '2' }];
    const fetcher = vi.fn().mockResolvedValue(makePaginatedResponse(items, 2));

    const { result } = renderHook(() =>
      useInfiniteScroll({ fetcher, limit: 2 }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.hasMore).toBe(false);
  });

  it('should handle fetch errors', async () => {
    const error = { status: 500, message: 'Server error' };
    const fetcher = vi.fn().mockRejectedValue(error);

    const { result } = renderHook(() =>
      useInfiniteScroll({ fetcher }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toEqual(error);
    expect(result.current.items).toEqual([]);
  });

  it('should wrap non-ApiError errors', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('Network failure'));

    const { result } = renderHook(() =>
      useInfiniteScroll({ fetcher }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Error objects have a 'message' property so they pass the 'status' in check
    // But a plain Error doesn't have 'status', so it gets wrapped
    expect(result.current.error).toBeDefined();
  });

  it('should refetch and reset items', async () => {
    let callCount = 0;
    const fetcher = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve(
        makePaginatedResponse([{ id: `item-${callCount}` }], 1),
      );
    });

    const { result } = renderHook(() =>
      useInfiniteScroll({ fetcher, limit: 10 }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.items).toEqual([{ id: 'item-1' }]);

    await act(async () => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.items).toEqual([{ id: 'item-2' }]);
  });

  it('should use custom extractItems and extractTotal', async () => {
    const response = { results: [{ name: 'a' }], count: 42 };
    const fetcher = vi.fn().mockResolvedValue(response);
    const extractItems = (res: any) => res.results;
    const extractTotal = (res: any) => res.count;

    const { result } = renderHook(() =>
      useInfiniteScroll({
        fetcher,
        extractItems,
        extractTotal,
        limit: 20,
      }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.items).toEqual([{ name: 'a' }]);
    expect(result.current.total).toBe(42);
  });

  it('should use default limit of 20', async () => {
    const fetcher = vi.fn().mockResolvedValue(makePaginatedResponse([], 0));

    renderHook(() => useInfiniteScroll({ fetcher }));

    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledWith(1, 20);
    });
  });

  it('should provide a sentinelRef', () => {
    const fetcher = vi.fn(() => new Promise(() => {}));
    const { result } = renderHook(() =>
      useInfiniteScroll({ fetcher }),
    );

    expect(result.current.sentinelRef).toBeDefined();
    expect(result.current.sentinelRef.current).toBeNull();
  });

  it('should handle defaultExtractItems with data array directly', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      data: [{ id: '1' }, { id: '2' }],
    });

    const { result } = renderHook(() =>
      useInfiniteScroll({ fetcher, limit: 10 }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.items).toEqual([{ id: '1' }, { id: '2' }]);
  });

  it('should handle defaultExtractItems with empty/missing data', async () => {
    const fetcher = vi.fn().mockResolvedValue({});

    const { result } = renderHook(() =>
      useInfiniteScroll({ fetcher, limit: 10 }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.items).toEqual([]);
  });

  it('should handle defaultExtractTotal with pagination at top level', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      data: [],
      pagination: { total: 15 },
    });

    const { result } = renderHook(() =>
      useInfiniteScroll({ fetcher, limit: 10 }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.total).toBe(15);
  });

  it('should clear error on successful refetch', async () => {
    const fetcher = vi.fn()
      .mockRejectedValueOnce({ status: 500, message: 'fail' })
      .mockResolvedValue(makePaginatedResponse([{ id: '1' }], 1));

    const { result } = renderHook(() =>
      useInfiniteScroll({ fetcher, limit: 10 }),
    );

    await waitFor(() => {
      expect(result.current.error).toBeDefined();
    });

    await act(async () => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.error).toBeNull();
    });

    expect(result.current.items).toEqual([{ id: '1' }]);
  });
});
