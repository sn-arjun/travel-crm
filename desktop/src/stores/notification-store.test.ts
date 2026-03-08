import { describe, it, expect, beforeEach } from 'vitest';
import { useNotificationStore } from './notification-store';

describe('useNotificationStore', () => {
  beforeEach(() => {
    // Reset to clean state with no mock notifications
    useNotificationStore.setState({
      notifications: [],
      unreadCount: 0,
    });
  });

  it('should start empty after reset', () => {
    const state = useNotificationStore.getState();
    expect(state.notifications).toEqual([]);
    expect(state.unreadCount).toBe(0);
  });

  describe('addNotification', () => {
    it('should add a notification with auto-generated id and timestamp', () => {
      useNotificationStore.getState().addNotification({
        title: 'Test Alert',
        message: 'Something happened',
        type: 'info',
      });

      const state = useNotificationStore.getState();
      expect(state.notifications).toHaveLength(1);
      expect(state.notifications[0].title).toBe('Test Alert');
      expect(state.notifications[0].message).toBe('Something happened');
      expect(state.notifications[0].type).toBe('info');
      expect(state.notifications[0].read).toBe(false);
      expect(state.notifications[0].id).toBeDefined();
      expect(state.notifications[0].createdAt).toBeDefined();
      expect(state.unreadCount).toBe(1);
    });

    it('should prepend new notifications (most recent first)', () => {
      const { addNotification } = useNotificationStore.getState();

      addNotification({ title: 'First', message: 'msg1', type: 'info' });
      addNotification({ title: 'Second', message: 'msg2', type: 'success' });

      const state = useNotificationStore.getState();
      expect(state.notifications[0].title).toBe('Second');
      expect(state.notifications[1].title).toBe('First');
    });

    it('should increment unread count', () => {
      const { addNotification } = useNotificationStore.getState();

      addNotification({ title: 'A', message: 'm', type: 'info' });
      addNotification({ title: 'B', message: 'm', type: 'warning' });
      addNotification({ title: 'C', message: 'm', type: 'error' });

      expect(useNotificationStore.getState().unreadCount).toBe(3);
    });

    it('should support notification with link', () => {
      useNotificationStore.getState().addNotification({
        title: 'Invoice Paid',
        message: 'Invoice #001 paid',
        type: 'success',
        link: '/invoices/001',
      });

      expect(useNotificationStore.getState().notifications[0].link).toBe('/invoices/001');
    });
  });

  describe('markAsRead', () => {
    it('should mark a specific notification as read', () => {
      useNotificationStore.getState().addNotification({
        title: 'Test',
        message: 'msg',
        type: 'info',
      });

      const id = useNotificationStore.getState().notifications[0].id;
      useNotificationStore.getState().markAsRead(id);

      const state = useNotificationStore.getState();
      expect(state.notifications[0].read).toBe(true);
      expect(state.unreadCount).toBe(0);
    });

    it('should not double-decrement if already read', () => {
      useNotificationStore.getState().addNotification({
        title: 'Test',
        message: 'msg',
        type: 'info',
      });

      const id = useNotificationStore.getState().notifications[0].id;
      useNotificationStore.getState().markAsRead(id);
      useNotificationStore.getState().markAsRead(id); // marking again

      expect(useNotificationStore.getState().unreadCount).toBe(0);
    });

    it('should handle non-existent notification ID gracefully', () => {
      useNotificationStore.getState().markAsRead('non-existent-id');
      expect(useNotificationStore.getState().unreadCount).toBe(0);
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all notifications as read', () => {
      const { addNotification } = useNotificationStore.getState();

      addNotification({ title: 'A', message: 'm', type: 'info' });
      addNotification({ title: 'B', message: 'm', type: 'warning' });
      addNotification({ title: 'C', message: 'm', type: 'error' });

      expect(useNotificationStore.getState().unreadCount).toBe(3);

      useNotificationStore.getState().markAllAsRead();

      const state = useNotificationStore.getState();
      expect(state.unreadCount).toBe(0);
      state.notifications.forEach((n) => {
        expect(n.read).toBe(true);
      });
    });
  });

  describe('removeNotification', () => {
    it('should remove a notification by ID', () => {
      useNotificationStore.getState().addNotification({
        title: 'Test',
        message: 'msg',
        type: 'info',
      });

      const id = useNotificationStore.getState().notifications[0].id;
      useNotificationStore.getState().removeNotification(id);

      expect(useNotificationStore.getState().notifications).toHaveLength(0);
    });

    it('should decrement unread count when removing unread notification', () => {
      useNotificationStore.getState().addNotification({
        title: 'Unread',
        message: 'msg',
        type: 'info',
      });

      const id = useNotificationStore.getState().notifications[0].id;
      expect(useNotificationStore.getState().unreadCount).toBe(1);

      useNotificationStore.getState().removeNotification(id);
      expect(useNotificationStore.getState().unreadCount).toBe(0);
    });

    it('should NOT decrement unread count when removing read notification', () => {
      useNotificationStore.getState().addNotification({
        title: 'Read One',
        message: 'msg',
        type: 'info',
      });

      const id = useNotificationStore.getState().notifications[0].id;
      useNotificationStore.getState().markAsRead(id);

      // Add another unread
      useNotificationStore.getState().addNotification({
        title: 'Unread',
        message: 'msg',
        type: 'warning',
      });

      expect(useNotificationStore.getState().unreadCount).toBe(1);

      // Remove the read one
      useNotificationStore.getState().removeNotification(id);
      expect(useNotificationStore.getState().unreadCount).toBe(1);
      expect(useNotificationStore.getState().notifications).toHaveLength(1);
    });
  });

  describe('clearAll', () => {
    it('should clear all notifications and reset unread count', () => {
      const { addNotification } = useNotificationStore.getState();
      addNotification({ title: 'A', message: 'm', type: 'info' });
      addNotification({ title: 'B', message: 'm', type: 'info' });

      useNotificationStore.getState().clearAll();

      const state = useNotificationStore.getState();
      expect(state.notifications).toEqual([]);
      expect(state.unreadCount).toBe(0);
    });
  });
});
