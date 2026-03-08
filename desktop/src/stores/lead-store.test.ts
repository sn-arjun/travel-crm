import { describe, it, expect, beforeEach } from 'vitest';
import { useLeadStore } from './lead-store';

describe('useLeadStore', () => {
  beforeEach(() => {
    useLeadStore.setState({
      viewMode: 'table',
      filters: {
        search: '',
        status: [],
        priority: [],
        assignedTo: '',
        source: '',
        dateRange: null,
      },
      selectedLeads: [],
      isDetailOpen: false,
      detailLeadId: null,
      page: 1,
      pageSize: 25,
    });
  });

  it('should start with default state', () => {
    const state = useLeadStore.getState();
    expect(state.viewMode).toBe('table');
    expect(state.filters.search).toBe('');
    expect(state.filters.status).toEqual([]);
    expect(state.selectedLeads).toEqual([]);
    expect(state.isDetailOpen).toBe(false);
    expect(state.page).toBe(1);
    expect(state.pageSize).toBe(25);
  });

  describe('viewMode', () => {
    it('should switch to kanban view', () => {
      useLeadStore.getState().setViewMode('kanban');
      expect(useLeadStore.getState().viewMode).toBe('kanban');
    });

    it('should switch back to table view', () => {
      useLeadStore.getState().setViewMode('kanban');
      useLeadStore.getState().setViewMode('table');
      expect(useLeadStore.getState().viewMode).toBe('table');
    });
  });

  describe('filters', () => {
    it('should set search filter', () => {
      useLeadStore.getState().setFilter('search', 'goa trip');
      expect(useLeadStore.getState().filters.search).toBe('goa trip');
    });

    it('should set status filter', () => {
      useLeadStore.getState().setFilter('status', ['new', 'contacted']);
      expect(useLeadStore.getState().filters.status).toEqual(['new', 'contacted']);
    });

    it('should set priority filter', () => {
      useLeadStore.getState().setFilter('priority', ['hot']);
      expect(useLeadStore.getState().filters.priority).toEqual(['hot']);
    });

    it('should set assignedTo filter', () => {
      useLeadStore.getState().setFilter('assignedTo', 'user-123');
      expect(useLeadStore.getState().filters.assignedTo).toBe('user-123');
    });

    it('should set dateRange filter', () => {
      const range = { start: '2025-01-01', end: '2025-12-31' };
      useLeadStore.getState().setFilter('dateRange', range);
      expect(useLeadStore.getState().filters.dateRange).toEqual(range);
    });

    it('should reset page to 1 when filter changes', () => {
      useLeadStore.getState().setPage(5);
      expect(useLeadStore.getState().page).toBe(5);

      useLeadStore.getState().setFilter('search', 'test');
      expect(useLeadStore.getState().page).toBe(1);
    });

    it('should reset all filters', () => {
      useLeadStore.getState().setFilter('search', 'test');
      useLeadStore.getState().setFilter('status', ['new']);
      useLeadStore.getState().setPage(3);

      useLeadStore.getState().resetFilters();

      const state = useLeadStore.getState();
      expect(state.filters.search).toBe('');
      expect(state.filters.status).toEqual([]);
      expect(state.page).toBe(1);
    });
  });

  describe('lead selection', () => {
    it('should toggle individual lead selection on', () => {
      useLeadStore.getState().toggleLeadSelection('lead-1');
      expect(useLeadStore.getState().selectedLeads).toEqual(['lead-1']);
    });

    it('should toggle individual lead selection off', () => {
      useLeadStore.getState().toggleLeadSelection('lead-1');
      useLeadStore.getState().toggleLeadSelection('lead-1');
      expect(useLeadStore.getState().selectedLeads).toEqual([]);
    });

    it('should accumulate multiple selections', () => {
      useLeadStore.getState().toggleLeadSelection('lead-1');
      useLeadStore.getState().toggleLeadSelection('lead-2');
      useLeadStore.getState().toggleLeadSelection('lead-3');
      expect(useLeadStore.getState().selectedLeads).toEqual(['lead-1', 'lead-2', 'lead-3']);
    });

    it('should select all leads', () => {
      useLeadStore.getState().selectAllLeads(['a', 'b', 'c', 'd']);
      expect(useLeadStore.getState().selectedLeads).toEqual(['a', 'b', 'c', 'd']);
    });

    it('should clear selection', () => {
      useLeadStore.getState().selectAllLeads(['a', 'b']);
      useLeadStore.getState().clearSelection();
      expect(useLeadStore.getState().selectedLeads).toEqual([]);
    });
  });

  describe('detail panel', () => {
    it('should open detail panel with lead ID', () => {
      useLeadStore.getState().openDetail('lead-42');
      const state = useLeadStore.getState();
      expect(state.isDetailOpen).toBe(true);
      expect(state.detailLeadId).toBe('lead-42');
    });

    it('should close detail panel', () => {
      useLeadStore.getState().openDetail('lead-42');
      useLeadStore.getState().closeDetail();
      const state = useLeadStore.getState();
      expect(state.isDetailOpen).toBe(false);
      expect(state.detailLeadId).toBeNull();
    });
  });

  describe('pagination', () => {
    it('should set page', () => {
      useLeadStore.getState().setPage(3);
      expect(useLeadStore.getState().page).toBe(3);
    });
  });
});
