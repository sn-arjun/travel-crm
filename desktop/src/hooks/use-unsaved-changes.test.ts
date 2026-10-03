import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useUnsavedChanges } from './use-unsaved-changes';

describe('useUnsavedChanges', () => {
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>;
  let removeEventListenerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
  });

  afterEach(() => {
    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
  });

  it('should add beforeunload event listener on mount', () => {
    renderHook(() => useUnsavedChanges(false));

    expect(addEventListenerSpy).toHaveBeenCalledWith(
      'beforeunload',
      expect.any(Function),
    );
  });

  it('should remove beforeunload event listener on unmount', () => {
    const { unmount } = renderHook(() => useUnsavedChanges(false));

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'beforeunload',
      expect.any(Function),
    );
  });

  it('should prevent default and set returnValue when isDirty is true', () => {
    renderHook(() => useUnsavedChanges(true));

    // Get the handler that was registered
    const handler = addEventListenerSpy.mock.calls.find(
      (call) => call[0] === 'beforeunload',
    )![1] as EventListener;

    const event = new Event('beforeunload') as BeforeUnloadEvent;
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

    // returnValue needs to be set via defineProperty since it's readonly on Event
    Object.defineProperty(event, 'returnValue', {
      writable: true,
      value: undefined,
    });

    handler(event);

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(event.returnValue).toBe('');
  });

  it('should NOT prevent default when isDirty is false', () => {
    renderHook(() => useUnsavedChanges(false));

    const handler = addEventListenerSpy.mock.calls.find(
      (call) => call[0] === 'beforeunload',
    )![1] as EventListener;

    const event = new Event('beforeunload') as BeforeUnloadEvent;
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

    handler(event);

    expect(preventDefaultSpy).not.toHaveBeenCalled();
  });

  it('should update behavior when isDirty changes from false to true', () => {
    const { rerender } = renderHook(
      ({ isDirty }) => useUnsavedChanges(isDirty),
      { initialProps: { isDirty: false } },
    );

    // Re-render with dirty = true
    rerender({ isDirty: true });

    // Get the latest registered handler (the old one is removed, new one added)
    const allBeforeUnloadCalls = addEventListenerSpy.mock.calls.filter(
      (call) => call[0] === 'beforeunload',
    );
    const latestHandler = allBeforeUnloadCalls[allBeforeUnloadCalls.length - 1]![1] as EventListener;

    const event = new Event('beforeunload') as BeforeUnloadEvent;
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
    Object.defineProperty(event, 'returnValue', {
      writable: true,
      value: undefined,
    });

    latestHandler(event);

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(event.returnValue).toBe('');
  });

  it('should update behavior when isDirty changes from true to false', () => {
    const { rerender } = renderHook(
      ({ isDirty }) => useUnsavedChanges(isDirty),
      { initialProps: { isDirty: true } },
    );

    // Re-render with dirty = false
    rerender({ isDirty: false });

    const allBeforeUnloadCalls = addEventListenerSpy.mock.calls.filter(
      (call) => call[0] === 'beforeunload',
    );
    const latestHandler = allBeforeUnloadCalls[allBeforeUnloadCalls.length - 1]![1] as EventListener;

    const event = new Event('beforeunload') as BeforeUnloadEvent;
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

    latestHandler(event);

    expect(preventDefaultSpy).not.toHaveBeenCalled();
  });

  it('should clean up old listener and add new one when isDirty changes', () => {
    const { rerender } = renderHook(
      ({ isDirty }) => useUnsavedChanges(isDirty),
      { initialProps: { isDirty: false } },
    );

    const addCalls1 = addEventListenerSpy.mock.calls.filter(
      (c) => c[0] === 'beforeunload',
    ).length;

    rerender({ isDirty: true });

    const addCalls2 = addEventListenerSpy.mock.calls.filter(
      (c) => c[0] === 'beforeunload',
    ).length;

    // A new listener should have been added
    expect(addCalls2).toBe(addCalls1 + 1);

    // Old listener should have been removed
    const removeCalls = removeEventListenerSpy.mock.calls.filter(
      (c) => c[0] === 'beforeunload',
    ).length;
    expect(removeCalls).toBeGreaterThanOrEqual(1);
  });
});
