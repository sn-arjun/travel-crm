import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebouncedValue } from './use-debounced-value';

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('hello', 300));
    expect(result.current).toBe('hello');
  });

  it('should not update value before delay', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebouncedValue(value, delay),
      { initialProps: { value: 'hello', delay: 300 } },
    );

    rerender({ value: 'world', delay: 300 });

    // Before delay elapses
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe('hello');
  });

  it('should update value after delay', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebouncedValue(value, delay),
      { initialProps: { value: 'hello', delay: 300 } },
    );

    rerender({ value: 'world', delay: 300 });

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBe('world');
  });

  it('should reset timer on rapid changes', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebouncedValue(value, delay),
      { initialProps: { value: 'a', delay: 300 } },
    );

    // Rapid changes
    rerender({ value: 'ab', delay: 300 });
    act(() => vi.advanceTimersByTime(100));

    rerender({ value: 'abc', delay: 300 });
    act(() => vi.advanceTimersByTime(100));

    rerender({ value: 'abcd', delay: 300 });
    act(() => vi.advanceTimersByTime(100));

    // Still showing original because timer keeps resetting
    expect(result.current).toBe('a');

    // After full delay from last change
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe('abcd');
  });

  it('should use default delay of 300ms', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value),
      { initialProps: { value: 'initial' } },
    );

    rerender({ value: 'updated' });

    act(() => vi.advanceTimersByTime(299));
    expect(result.current).toBe('initial');

    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe('updated');
  });

  it('should work with numeric values', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 200),
      { initialProps: { value: 0 } },
    );

    rerender({ value: 42 });
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe(42);
  });

  it('should work with object values', () => {
    const obj1 = { name: 'Alice' };
    const obj2 = { name: 'Bob' };

    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 200),
      { initialProps: { value: obj1 } },
    );

    rerender({ value: obj2 });
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toEqual({ name: 'Bob' });
  });
});
