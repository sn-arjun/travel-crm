import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useElectron, useElectronShortcuts, useElectronQuickActions } from './use-electron';

describe('useElectron', () => {
  afterEach(() => {
    // Remove electronAPI after each test
    delete (window as any).electronAPI;
  });

  it('should detect non-electron environment', () => {
    delete (window as any).electronAPI;

    const { result } = renderHook(() => useElectron());

    expect(result.current.isElectron).toBe(false);
  });

  it('should detect electron environment', () => {
    (window as any).electronAPI = {
      minimize: vi.fn(),
      maximize: vi.fn(),
      close: vi.fn(),
      onShortcut: vi.fn(),
      onQuickAction: vi.fn(),
    };

    const { result } = renderHook(() => useElectron());

    // isElectron is set in useEffect, so it should be true after render
    expect(result.current.isElectron).toBe(true);
  });

  it('should call electronAPI.minimize', () => {
    const minimizeMock = vi.fn();
    (window as any).electronAPI = {
      minimize: minimizeMock,
      maximize: vi.fn(),
      close: vi.fn(),
      onShortcut: vi.fn(),
      onQuickAction: vi.fn(),
    };

    const { result } = renderHook(() => useElectron());

    act(() => {
      result.current.minimize();
    });

    expect(minimizeMock).toHaveBeenCalledTimes(1);
  });

  it('should call electronAPI.maximize', () => {
    const maximizeMock = vi.fn();
    (window as any).electronAPI = {
      minimize: vi.fn(),
      maximize: maximizeMock,
      close: vi.fn(),
      onShortcut: vi.fn(),
      onQuickAction: vi.fn(),
    };

    const { result } = renderHook(() => useElectron());

    act(() => {
      result.current.maximize();
    });

    expect(maximizeMock).toHaveBeenCalledTimes(1);
  });

  it('should call electronAPI.close', () => {
    const closeMock = vi.fn();
    (window as any).electronAPI = {
      minimize: vi.fn(),
      maximize: vi.fn(),
      close: closeMock,
      onShortcut: vi.fn(),
      onQuickAction: vi.fn(),
    };

    const { result } = renderHook(() => useElectron());

    act(() => {
      result.current.close();
    });

    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it('should not throw when calling minimize without electronAPI', () => {
    delete (window as any).electronAPI;

    const { result } = renderHook(() => useElectron());

    expect(() => {
      act(() => {
        result.current.minimize();
      });
    }).not.toThrow();
  });

  it('should not throw when calling maximize without electronAPI', () => {
    delete (window as any).electronAPI;

    const { result } = renderHook(() => useElectron());

    expect(() => {
      act(() => {
        result.current.maximize();
      });
    }).not.toThrow();
  });

  it('should not throw when calling close without electronAPI', () => {
    delete (window as any).electronAPI;

    const { result } = renderHook(() => useElectron());

    expect(() => {
      act(() => {
        result.current.close();
      });
    }).not.toThrow();
  });
});

describe('useElectronShortcuts', () => {
  afterEach(() => {
    delete (window as any).electronAPI;
  });

  it('should register shortcut listener when electronAPI is available', () => {
    const cleanup = vi.fn();
    const onShortcut = vi.fn().mockReturnValue(cleanup);
    (window as any).electronAPI = {
      minimize: vi.fn(),
      maximize: vi.fn(),
      close: vi.fn(),
      onShortcut,
      onQuickAction: vi.fn(),
    };

    const handler = vi.fn();
    renderHook(() => useElectronShortcuts(handler));

    expect(onShortcut).toHaveBeenCalledWith(handler);
  });

  it('should call cleanup on unmount', () => {
    const cleanup = vi.fn();
    const onShortcut = vi.fn().mockReturnValue(cleanup);
    (window as any).electronAPI = {
      minimize: vi.fn(),
      maximize: vi.fn(),
      close: vi.fn(),
      onShortcut,
      onQuickAction: vi.fn(),
    };

    const handler = vi.fn();
    const { unmount } = renderHook(() => useElectronShortcuts(handler));

    unmount();

    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('should not register listener when electronAPI is not available', () => {
    delete (window as any).electronAPI;

    const handler = vi.fn();
    // Should not throw
    expect(() => {
      renderHook(() => useElectronShortcuts(handler));
    }).not.toThrow();
  });

  it('should re-register when handler changes', () => {
    const cleanup1 = vi.fn();
    const cleanup2 = vi.fn();
    const onShortcut = vi.fn()
      .mockReturnValueOnce(cleanup1)
      .mockReturnValueOnce(cleanup2);
    (window as any).electronAPI = {
      minimize: vi.fn(),
      maximize: vi.fn(),
      close: vi.fn(),
      onShortcut,
      onQuickAction: vi.fn(),
    };

    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const { rerender } = renderHook(
      ({ handler }) => useElectronShortcuts(handler),
      { initialProps: { handler: handler1 } },
    );

    expect(onShortcut).toHaveBeenCalledTimes(1);
    expect(onShortcut).toHaveBeenCalledWith(handler1);

    rerender({ handler: handler2 });

    // Old cleanup called, new listener registered
    expect(cleanup1).toHaveBeenCalledTimes(1);
    expect(onShortcut).toHaveBeenCalledTimes(2);
    expect(onShortcut).toHaveBeenCalledWith(handler2);
  });
});

describe('useElectronQuickActions', () => {
  afterEach(() => {
    delete (window as any).electronAPI;
  });

  it('should register quick action listener when electronAPI is available', () => {
    const cleanup = vi.fn();
    const onQuickAction = vi.fn().mockReturnValue(cleanup);
    (window as any).electronAPI = {
      minimize: vi.fn(),
      maximize: vi.fn(),
      close: vi.fn(),
      onShortcut: vi.fn(),
      onQuickAction,
    };

    const handler = vi.fn();
    renderHook(() => useElectronQuickActions(handler));

    expect(onQuickAction).toHaveBeenCalledWith(handler);
  });

  it('should call cleanup on unmount', () => {
    const cleanup = vi.fn();
    const onQuickAction = vi.fn().mockReturnValue(cleanup);
    (window as any).electronAPI = {
      minimize: vi.fn(),
      maximize: vi.fn(),
      close: vi.fn(),
      onShortcut: vi.fn(),
      onQuickAction,
    };

    const handler = vi.fn();
    const { unmount } = renderHook(() => useElectronQuickActions(handler));

    unmount();

    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('should not register listener when electronAPI is not available', () => {
    delete (window as any).electronAPI;

    const handler = vi.fn();
    expect(() => {
      renderHook(() => useElectronQuickActions(handler));
    }).not.toThrow();
  });

  it('should re-register when handler changes', () => {
    const cleanup1 = vi.fn();
    const cleanup2 = vi.fn();
    const onQuickAction = vi.fn()
      .mockReturnValueOnce(cleanup1)
      .mockReturnValueOnce(cleanup2);
    (window as any).electronAPI = {
      minimize: vi.fn(),
      maximize: vi.fn(),
      close: vi.fn(),
      onShortcut: vi.fn(),
      onQuickAction,
    };

    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const { rerender } = renderHook(
      ({ handler }) => useElectronQuickActions(handler),
      { initialProps: { handler: handler1 } },
    );

    expect(onQuickAction).toHaveBeenCalledTimes(1);

    rerender({ handler: handler2 });

    expect(cleanup1).toHaveBeenCalledTimes(1);
    expect(onQuickAction).toHaveBeenCalledTimes(2);
    expect(onQuickAction).toHaveBeenCalledWith(handler2);
  });
});
