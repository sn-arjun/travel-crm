'use client';

import { create } from 'zustand';

const REF_DATE = Date.now();

export type EntityType = 'contact' | 'lead' | 'invoice' | 'itinerary';

export interface Bookmark {
  id: string;
  entityType: EntityType;
  entityId: string;
  entityName: string;
  createdAt: string;
}

interface BookmarksState {
  bookmarks: Bookmark[];
  addBookmark: (entityType: EntityType, entityId: string, entityName: string) => void;
  removeBookmark: (id: string) => void;
  isBookmarked: (entityType: EntityType, entityId: string) => boolean;
  clearBookmarks: () => void;
}

// Mock data: 8-10 bookmarked items
const mockBookmarks: Bookmark[] = [
  {
    id: 'bm-1',
    entityType: 'contact',
    entityId: 'contact-1',
    entityName: 'Rahul Sharma',
    createdAt: new Date(REF_DATE - 86400000).toISOString(),
  },
  {
    id: 'bm-2',
    entityType: 'lead',
    entityId: 'lead-5',
    entityName: 'Maldives Honeymoon Trip',
    createdAt: new Date(REF_DATE - 172800000).toISOString(),
  },
  {
    id: 'bm-3',
    entityType: 'invoice',
    entityId: 'invoice-12',
    entityName: 'INV-2026-001 - Dubai Trip',
    createdAt: new Date(REF_DATE - 259200000).toISOString(),
  },
  {
    id: 'bm-4',
    entityType: 'itinerary',
    entityId: 'itinerary-8',
    entityName: 'Bali 7-Day Adventure Itinerary',
    createdAt: new Date(REF_DATE - 345600000).toISOString(),
  },
  {
    id: 'bm-5',
    entityType: 'contact',
    entityId: 'contact-7',
    entityName: 'Priya Patel',
    createdAt: new Date(REF_DATE - 432000000).toISOString(),
  },
  {
    id: 'bm-6',
    entityType: 'lead',
    entityId: 'lead-12',
    entityName: 'Thailand Family Vacation',
    createdAt: new Date(REF_DATE - 518400000).toISOString(),
  },
  {
    id: 'bm-7',
    entityType: 'invoice',
    entityId: 'invoice-25',
    entityName: 'INV-2026-003 - European Tour',
    createdAt: new Date(REF_DATE - 604800000).toISOString(),
  },
  {
    id: 'bm-8',
    entityType: 'itinerary',
    entityId: 'itinerary-15',
    entityName: 'Kerala Backwater Cruise Itinerary',
    createdAt: new Date(REF_DATE - 691200000).toISOString(),
  },
  {
    id: 'bm-9',
    entityType: 'contact',
    entityId: 'contact-14',
    entityName: 'Amit Kumar',
    createdAt: new Date(REF_DATE - 777600000).toISOString(),
  },
  {
    id: 'bm-10',
    entityType: 'lead',
    entityId: 'lead-22',
    entityName: 'Singapore Business Tour',
    createdAt: new Date(REF_DATE - 864000000).toISOString(),
  },
];

export const useBookmarksStore = create<BookmarksState>()((set, get) => ({
  bookmarks: mockBookmarks,

  addBookmark: (entityType, entityId, entityName) => {
    const state = get();
    const exists = state.bookmarks.some(
      (b) => b.entityType === entityType && b.entityId === entityId,
    );

    if (!exists) {
      const newBookmark: Bookmark = {
        id: `bm-${Date.now()}`,
        entityType,
        entityId,
        entityName,
        createdAt: new Date(REF_DATE).toISOString(),
      };

      set({
        bookmarks: [newBookmark, ...state.bookmarks],
      });
    }
  },

  removeBookmark: (id) => {
    set((state) => ({
      bookmarks: state.bookmarks.filter((b) => b.id !== id),
    }));
  },

  isBookmarked: (entityType, entityId) => {
    const state = get();
    return state.bookmarks.some(
      (b) => b.entityType === entityType && b.entityId === entityId,
    );
  },

  clearBookmarks: () => {
    set({ bookmarks: [] });
  },
}));
