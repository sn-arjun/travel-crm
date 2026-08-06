import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useBookmarksStore } from './bookmarks-store';

describe('useBookmarksStore', () => {
  let nowCounter = 1000;

  beforeEach(() => {
    // Reset to empty state before each test
    useBookmarksStore.setState({ bookmarks: [] });
    // Mock Date.now to produce unique values on each call
    nowCounter = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => ++nowCounter);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should start with empty bookmarks after reset', () => {
    const state = useBookmarksStore.getState();
    expect(state.bookmarks).toEqual([]);
  });

  describe('addBookmark', () => {
    it('should add a new bookmark', () => {
      const { addBookmark } = useBookmarksStore.getState();

      addBookmark('contact', 'contact-1', 'John Doe');

      const { bookmarks } = useBookmarksStore.getState();
      expect(bookmarks).toHaveLength(1);
      expect(bookmarks[0].entityType).toBe('contact');
      expect(bookmarks[0].entityId).toBe('contact-1');
      expect(bookmarks[0].entityName).toBe('John Doe');
      expect(bookmarks[0].id).toBeDefined();
      expect(bookmarks[0].createdAt).toBeDefined();
    });

    it('should prepend new bookmark to the list', () => {
      const { addBookmark } = useBookmarksStore.getState();

      addBookmark('contact', 'c-1', 'First');
      addBookmark('lead', 'l-1', 'Second');

      const { bookmarks } = useBookmarksStore.getState();
      expect(bookmarks).toHaveLength(2);
      expect(bookmarks[0].entityName).toBe('Second');
      expect(bookmarks[1].entityName).toBe('First');
    });

    it('should not add duplicate bookmark for same entity', () => {
      const { addBookmark } = useBookmarksStore.getState();

      addBookmark('contact', 'contact-1', 'John Doe');
      addBookmark('contact', 'contact-1', 'John Doe');

      const { bookmarks } = useBookmarksStore.getState();
      expect(bookmarks).toHaveLength(1);
    });

    it('should allow bookmarks with same entityId but different entityType', () => {
      const { addBookmark } = useBookmarksStore.getState();

      addBookmark('contact', 'id-1', 'Contact One');
      addBookmark('lead', 'id-1', 'Lead One');

      const { bookmarks } = useBookmarksStore.getState();
      expect(bookmarks).toHaveLength(2);
    });

    it('should set unique id for each bookmark', () => {
      const { addBookmark } = useBookmarksStore.getState();

      addBookmark('contact', 'c-1', 'A');
      addBookmark('lead', 'l-1', 'B');
      addBookmark('invoice', 'i-1', 'C');

      const { bookmarks } = useBookmarksStore.getState();
      const ids = bookmarks.map((b) => b.id);
      expect(new Set(ids).size).toBe(3);
    });

    it('should support all entity types', () => {
      const { addBookmark } = useBookmarksStore.getState();

      addBookmark('contact', 'c-1', 'Contact');
      addBookmark('lead', 'l-1', 'Lead');
      addBookmark('invoice', 'i-1', 'Invoice');
      addBookmark('itinerary', 'it-1', 'Itinerary');

      const { bookmarks } = useBookmarksStore.getState();
      expect(bookmarks).toHaveLength(4);
      const types = bookmarks.map((b) => b.entityType);
      expect(types).toContain('contact');
      expect(types).toContain('lead');
      expect(types).toContain('invoice');
      expect(types).toContain('itinerary');
    });
  });

  describe('removeBookmark', () => {
    it('should remove a bookmark by id', () => {
      const { addBookmark } = useBookmarksStore.getState();

      addBookmark('contact', 'c-1', 'John');
      addBookmark('lead', 'l-1', 'Trip');

      const { bookmarks } = useBookmarksStore.getState();
      const idToRemove = bookmarks[0].id;

      useBookmarksStore.getState().removeBookmark(idToRemove);

      const updated = useBookmarksStore.getState().bookmarks;
      expect(updated).toHaveLength(1);
      expect(updated.find((b) => b.id === idToRemove)).toBeUndefined();
    });

    it('should not affect other bookmarks when removing one', () => {
      const { addBookmark } = useBookmarksStore.getState();

      addBookmark('contact', 'c-1', 'A');
      addBookmark('lead', 'l-1', 'B');
      addBookmark('invoice', 'i-1', 'C');

      const { bookmarks } = useBookmarksStore.getState();
      useBookmarksStore.getState().removeBookmark(bookmarks[1].id);

      const updated = useBookmarksStore.getState().bookmarks;
      expect(updated).toHaveLength(2);
    });

    it('should handle removing non-existent id gracefully', () => {
      const { addBookmark } = useBookmarksStore.getState();
      addBookmark('contact', 'c-1', 'A');

      useBookmarksStore.getState().removeBookmark('non-existent-id');

      const { bookmarks } = useBookmarksStore.getState();
      expect(bookmarks).toHaveLength(1);
    });
  });

  describe('isBookmarked', () => {
    it('should return true for a bookmarked entity', () => {
      const { addBookmark } = useBookmarksStore.getState();
      addBookmark('contact', 'c-1', 'John');

      const { isBookmarked } = useBookmarksStore.getState();
      expect(isBookmarked('contact', 'c-1')).toBe(true);
    });

    it('should return false for a non-bookmarked entity', () => {
      const { isBookmarked } = useBookmarksStore.getState();
      expect(isBookmarked('contact', 'c-999')).toBe(false);
    });

    it('should return false for same entityId but different entityType', () => {
      const { addBookmark } = useBookmarksStore.getState();
      addBookmark('contact', 'id-1', 'Contact');

      const { isBookmarked } = useBookmarksStore.getState();
      expect(isBookmarked('lead', 'id-1')).toBe(false);
    });

    it('should return false after bookmark is removed', () => {
      const { addBookmark } = useBookmarksStore.getState();
      addBookmark('contact', 'c-1', 'John');

      const { bookmarks } = useBookmarksStore.getState();
      useBookmarksStore.getState().removeBookmark(bookmarks[0].id);

      const { isBookmarked } = useBookmarksStore.getState();
      expect(isBookmarked('contact', 'c-1')).toBe(false);
    });
  });

  describe('clearBookmarks', () => {
    it('should clear all bookmarks', () => {
      const { addBookmark } = useBookmarksStore.getState();
      addBookmark('contact', 'c-1', 'A');
      addBookmark('lead', 'l-1', 'B');
      addBookmark('invoice', 'i-1', 'C');

      useBookmarksStore.getState().clearBookmarks();

      const { bookmarks } = useBookmarksStore.getState();
      expect(bookmarks).toEqual([]);
    });

    it('should be safe to call on empty store', () => {
      useBookmarksStore.getState().clearBookmarks();

      const { bookmarks } = useBookmarksStore.getState();
      expect(bookmarks).toEqual([]);
    });

    it('should make isBookmarked return false for previously bookmarked items', () => {
      const { addBookmark } = useBookmarksStore.getState();
      addBookmark('contact', 'c-1', 'John');

      useBookmarksStore.getState().clearBookmarks();

      const { isBookmarked } = useBookmarksStore.getState();
      expect(isBookmarked('contact', 'c-1')).toBe(false);
    });
  });
});
