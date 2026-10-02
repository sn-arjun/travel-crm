'use client';

import { toast } from 'sonner';
import { useNotificationStore, type NotificationType } from '@/stores/notification-store';

/**
 * Hook to access notifications from the store and trigger toast notifications.
 */
export function useNotifications() {
  const store = useNotificationStore();

  /**
   * Send a toast notification with optional store persistence.
   */
  const sendToast = (
    title: string,
    message: string,
    type: NotificationType = 'info',
    persist: boolean = false,
  ) => {
    // Show toast UI
    switch (type) {
      case 'success':
        toast.success(message, { description: title });
        break;
      case 'error':
        toast.error(message, { description: title });
        break;
      case 'warning':
        toast.warning(message, { description: title });
        break;
      case 'info':
      default:
        toast(message, { description: title });
        break;
    }

    // Optionally add to notification store
    if (persist) {
      store.addNotification({
        title,
        message,
        type,
      });
    }
  };

  return {
    notifications: store.notifications,
    unreadCount: store.unreadCount,
    addNotification: store.addNotification,
    markAsRead: store.markAsRead,
    markAllAsRead: store.markAllAsRead,
    removeNotification: store.removeNotification,
    clearAll: store.clearAll,
    sendToast,
  };
}
