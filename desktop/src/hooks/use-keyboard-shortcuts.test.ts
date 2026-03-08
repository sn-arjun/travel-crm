import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardShortcuts } from './use-keyboard-shortcuts';

function fireKeyDown(key: string, modifiers: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean } = {}) {
  const event = new KeyboardEvent('keydown', {
    key,
    ctrlKey: modifiers.ctrlKey || false,
    metaKey: modifiers.metaKey || false,
    shiftKey: modifiers.shiftKey || false,
    altKey: modifiers.altKey || false,
    bubbles: true,
  });
  document.dispatchEvent(event);
}

describe('useKeyboardShortcuts', () => {
  beforeEach(() => {
    // Mock navigator.platform to Windows
    Object.defineProperty(navigator, 'platform', {
      value: 'Win32',
      writable: true,
    });
  });

  it('should call action on matching key press', () => {
    const action = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([{ key: 'k', action }]),
    );

    fireKeyDown('k');
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('should call action with Ctrl modifier on Windows', () => {
    const action = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([{ key: 'k', ctrl: true, action }]),
    );

    // Without ctrl — should NOT trigger
    fireKeyDown('k');
    expect(action).not.toHaveBeenCalled();

    // With ctrl — should trigger
    fireKeyDown('k', { ctrlKey: true });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('should call action with Shift modifier', () => {
    const action = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([{ key: 'n', shift: true, action }]),
    );

    fireKeyDown('n');
    expect(action).not.toHaveBeenCalled();

    fireKeyDown('n', { shiftKey: true });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('should call action with Alt modifier', () => {
    const action = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([{ key: 's', alt: true, action }]),
    );

    fireKeyDown('s');
    expect(action).not.toHaveBeenCalled();

    fireKeyDown('s', { altKey: true });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('should support multiple shortcuts', () => {
    const action1 = vi.fn();
    const action2 = vi.fn();

    renderHook(() =>
      useKeyboardShortcuts([
        { key: 'a', action: action1 },
        { key: 'b', action: action2 },
      ]),
    );

    fireKeyDown('a');
    expect(action1).toHaveBeenCalledTimes(1);
    expect(action2).not.toHaveBeenCalled();

    fireKeyDown('b');
    expect(action2).toHaveBeenCalledTimes(1);
  });

  it('should be case-insensitive for key matching', () => {
    const action = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([{ key: 'k', action }]),
    );

    fireKeyDown('K');
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('should clean up event listener on unmount', () => {
    const action = vi.fn();
    const { unmount } = renderHook(() =>
      useKeyboardShortcuts([{ key: 'x', action }]),
    );

    unmount();

    fireKeyDown('x');
    expect(action).not.toHaveBeenCalled();
  });

  it('should only fire the first matching shortcut', () => {
    const action1 = vi.fn();
    const action2 = vi.fn();

    renderHook(() =>
      useKeyboardShortcuts([
        { key: 'k', action: action1 },
        { key: 'k', action: action2 },
      ]),
    );

    fireKeyDown('k');
    expect(action1).toHaveBeenCalledTimes(1);
    expect(action2).not.toHaveBeenCalled();
  });
});
