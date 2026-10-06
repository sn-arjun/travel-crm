'use client';

import { create } from 'zustand';

export type NotificationType = 'info' | 'warning' | 'success' | 'error';

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  read: boolean;
  createdAt: number;
  link?: string;
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (notification: Omit<Notification, 'id' | 'createdAt' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
}

const mockNotifications: Notification[] = [
  {
    id: '1',
    title: 'Invoice Paid',
    message: 'Invoice #INV-001 has been paid by Acme Corp',
    type: 'success',
    read: false,
    createdAt: Date.now() - 300000,
    link: '/invoices/INV-001',
  },
  {
    id: '2',
    title: 'Payment Due Soon',
    message: 'Invoice #INV-003 payment is due in 3 days',
    type: 'warning',
    read: false,
    createdAt: Date.now() - 600000,
    link: '/invoices/INV-003',
  },
  {
    id: '3',
    title: 'New Lead Assigned',
    message: 'Rajesh Patel has been assigned to you',
    type: 'info',
    read: false,
    createdAt: Date.now() - 900000,
    link: '/leads/rajesh-patel',
  },
  {
    id: '4',
    title: 'Trip Updated',
    message: 'Guest itinerary for Goa trip has been updated',
    type: 'info',
    read: true,
    createdAt: Date.now() - 1200000,
    link: '/trips/goa-001',
  },
  {
    id: '5',
    title: 'Document Expiry Alert',
    message: 'Passport of John Doe expires in 30 days',
    type: 'warning',
    read: true,
    createdAt: Date.now() - 1500000,
  },
  {
    id: '6',
    title: 'Payment Received',
    message: '₹45,000 received for Bali trip booking',
    type: 'success',
    read: true,
    createdAt: Date.now() - 1800000,
  },
  {
    id: '7',
    title: 'Task Completed',
    message: 'Follow-up call with Travel Lovers Ltd completed',
    type: 'success',
    read: true,
    createdAt: Date.now() - 2100000,
  },
  {
    id: '8',
    title: 'Invoice Overdue',
    message: 'Invoice #INV-002 is 7 days overdue',
    type: 'error',
    read: false,
    createdAt: Date.now() - 2400000,
    link: '/invoices/INV-002',
  },
  {
    id: '9',
    title: 'Booking Confirmation',
    message: 'Flight booking confirmed for Flight AI-101 on 15 Mar',
    type: 'success',
    read: true,
    createdAt: Date.now() - 2700000,
  },
  {
    id: '10',
    title: 'System Update',
    message: 'TravelCRM has been updated to version 2.5.0',
    type: 'info',
    read: true,
    createdAt: Date.now() - 3000000,
  },
];

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: mockNotifications,
  unreadCount: mockNotifications.filter((n) => !n.read).length,

  addNotification: (notification) => {
    const newNotification: Notification = {
      ...notification,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: Date.now(),
      read: false,
    };

    set((state) => ({
      notifications: [newNotification, ...state.notifications],
      unreadCount: state.unreadCount + 1,
    }));
  },

  markAsRead: (id) => {
    set((state) => {
      const notification = state.notifications.find((n) => n.id === id);
      if (!notification || notification.read) {
        return state;
      }

      return {
        notifications: state.notifications.map((n) =>
          n.id === id ? { ...n, read: true } : n,
        ),
        unreadCount: state.unreadCount - 1,
      };
    });
  },

  markAllAsRead: () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({
        ...n,
        read: true,
      })),
      unreadCount: 0,
    }));
  },

  removeNotification: (id) => {
    set((state) => {
      const notification = state.notifications.find((n) => n.id === id);
      const wasUnread = notification && !notification.read;

      return {
        notifications: state.notifications.filter((n) => n.id !== id),
        unreadCount: wasUnread ? state.unreadCount - 1 : state.unreadCount,
      };
    });
  },

  clearAll: () => {
    set({
      notifications: [],
      unreadCount: 0,
    });
  },
}));
