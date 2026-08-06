import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNotifications } from './useNotifications';
import { useNotificationStore } from '@/stores/notification-store';

// Mock sonner toast
vi.mock('sonner', () => {
  const toast = vi.fn();
  toast.success = vi.fn();
  toast.error = vi.fn();
  toast.warning = vi.fn();
  return { toast };
});

import { toast } from 'sonner';

describe('useNotifications', () => {
  beforeEach(() => {
    // Reset the notification store to a clean state before each test
    useNotificationStore.setState({
      notifications: [],
      unreadCount: 0,
    });
    vi.clearAllMocks();
  });

  it('should return empty notifications initially (after reset)', () => {
    const { result } = renderHook(() => useNotifications());

    expect(result.current.notifications).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
  });

  it('should add a notification', () => {
    const { result } = renderHook(() => useNotifications());

    act(() => {
      result.current.addNotification({
        title: 'Test',
        message: 'Test message',
        type: 'info',
      });
    });

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0].title).toBe('Test');
    expect(result.current.notifications[0].message).toBe('Test message');
    expect(result.current.notifications[0].type).toBe('info');
    expect(result.current.notifications[0].read).toBe(false);
    expect(result.current.unreadCount).toBe(1);
  });

  it('should mark a notification as read', () => {
    const { result } = renderHook(() => useNotifications());

    act(() => {
      result.current.addNotification({
        title: 'Test',
        message: 'msg',
        type: 'success',
      });
    });

    const id = result.current.notifications[0].id;

    act(() => {
      result.current.markAsRead(id);
    });

    expect(result.current.notifications[0].read).toBe(true);
    expect(result.current.unreadCount).toBe(0);
  });

  it('should not decrement unreadCount when marking already-read notification', () => {
    const { result } = renderHook(() => useNotifications());

    act(() => {
      result.current.addNotification({
        title: 'Test',
        message: 'msg',
        type: 'info',
      });
    });

    const id = result.current.notifications[0].id;

    act(() => {
      result.current.markAsRead(id);
    });

    expect(result.current.unreadCount).toBe(0);

    // Mark same one again
    act(() => {
      result.current.markAsRead(id);
    });

    expect(result.current.unreadCount).toBe(0);
  });

  it('should mark all notifications as read', () => {
    const { result } = renderHook(() => useNotifications());

    act(() => {
      result.current.addNotification({ title: 'A', message: 'a', type: 'info' });
      result.current.addNotification({ title: 'B', message: 'b', type: 'warning' });
      result.current.addNotification({ title: 'C', message: 'c', type: 'error' });
    });

    expect(result.current.unreadCount).toBe(3);

    act(() => {
      result.current.markAllAsRead();
    });

    expect(result.current.unreadCount).toBe(0);
    result.current.notifications.forEach((n) => {
      expect(n.read).toBe(true);
    });
  });

  it('should remove a notification', () => {
    const { result } = renderHook(() => useNotifications());

    act(() => {
      result.current.addNotification({ title: 'A', message: 'a', type: 'info' });
      result.current.addNotification({ title: 'B', message: 'b', type: 'info' });
    });

    const idToRemove = result.current.notifications[0].id;

    act(() => {
      result.current.removeNotification(idToRemove);
    });

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications.find((n) => n.id === idToRemove)).toBeUndefined();
  });

  it('should decrement unreadCount when removing an unread notification', () => {
    const { result } = renderHook(() => useNotifications());

    act(() => {
      result.current.addNotification({ title: 'A', message: 'a', type: 'info' });
    });

    expect(result.current.unreadCount).toBe(1);
    const id = result.current.notifications[0].id;

    act(() => {
      result.current.removeNotification(id);
    });

    expect(result.current.unreadCount).toBe(0);
  });

  it('should not decrement unreadCount when removing a read notification', () => {
    const { result } = renderHook(() => useNotifications());

    act(() => {
      result.current.addNotification({ title: 'A', message: 'a', type: 'info' });
    });

    const id = result.current.notifications[0].id;

    act(() => {
      result.current.markAsRead(id);
    });

    expect(result.current.unreadCount).toBe(0);

    act(() => {
      result.current.removeNotification(id);
    });

    expect(result.current.unreadCount).toBe(0);
  });

  it('should clear all notifications', () => {
    const { result } = renderHook(() => useNotifications());

    act(() => {
      result.current.addNotification({ title: 'A', message: 'a', type: 'info' });
      result.current.addNotification({ title: 'B', message: 'b', type: 'info' });
    });

    act(() => {
      result.current.clearAll();
    });

    expect(result.current.notifications).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
  });

  describe('sendToast', () => {
    it('should call toast.success for success type', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.sendToast('Title', 'Message', 'success');
      });

      expect(toast.success).toHaveBeenCalledWith('Message', { description: 'Title' });
    });

    it('should call toast.error for error type', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.sendToast('Title', 'Message', 'error');
      });

      expect(toast.error).toHaveBeenCalledWith('Message', { description: 'Title' });
    });

    it('should call toast.warning for warning type', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.sendToast('Title', 'Message', 'warning');
      });

      expect(toast.warning).toHaveBeenCalledWith('Message', { description: 'Title' });
    });

    it('should call default toast for info type', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.sendToast('Title', 'Message', 'info');
      });

      expect(toast).toHaveBeenCalledWith('Message', { description: 'Title' });
    });

    it('should default to info type when type is not specified', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.sendToast('Title', 'Message');
      });

      expect(toast).toHaveBeenCalledWith('Message', { description: 'Title' });
    });

    it('should NOT persist notification to store when persist is false', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.sendToast('Title', 'Message', 'info', false);
      });

      expect(result.current.notifications).toHaveLength(0);
    });

    it('should persist notification to store when persist is true', () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.sendToast('Title', 'Message', 'success', true);
      });

      expect(result.current.notifications).toHaveLength(1);
      expect(result.current.notifications[0].title).toBe('Title');
      expect(result.current.notifications[0].message).toBe('Message');
      expect(result.current.notifications[0].type).toBe('success');
      expect(result.current.unreadCount).toBe(1);
    });
  });
});
