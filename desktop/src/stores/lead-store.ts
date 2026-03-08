'use client';

import { create } from 'zustand';

export type LeadViewMode = 'table' | 'kanban';

interface LeadFilters {
  search: string;
  status: string[];
  priority: string[];
  assignedTo: string;
  source: string;
  dateRange: { start: string; end: string } | null;
}

interface LeadState {
  viewMode: LeadViewMode;
  filters: LeadFilters;
  selectedLeads: string[];
  isDetailOpen: boolean;
  detailLeadId: string | null;
  page: number;
  pageSize: number;

  setViewMode: (mode: LeadViewMode) => void;
  setFilter: <K extends keyof LeadFilters>(key: K, value: LeadFilters[K]) => void;
  resetFilters: () => void;
  toggleLeadSelection: (id: string) => void;
  selectAllLeads: (ids: string[]) => void;
  clearSelection: () => void;
  openDetail: (id: string) => void;
  closeDetail: () => void;
  setPage: (page: number) => void;
}

const defaultFilters: LeadFilters = {
  search: '',
  status: [],
  priority: [],
  assignedTo: '',
  source: '',
  dateRange: null,
};

export const useLeadStore = create<LeadState>()((set) => ({
  viewMode: 'table',
  filters: defaultFilters,
  selectedLeads: [],
  isDetailOpen: false,
  detailLeadId: null,
  page: 1,
  pageSize: 25,

  setViewMode: (mode) => set({ viewMode: mode }),
  setFilter: (key, value) =>
    set((state) => ({ filters: { ...state.filters, [key]: value }, page: 1 })),
  resetFilters: () => set({ filters: defaultFilters, page: 1 }),
  toggleLeadSelection: (id) =>
    set((state) => ({
      selectedLeads: state.selectedLeads.includes(id)
        ? state.selectedLeads.filter((s) => s !== id)
        : [...state.selectedLeads, id],
    })),
  selectAllLeads: (ids) => set({ selectedLeads: ids }),
  clearSelection: () => set({ selectedLeads: [] }),
  openDetail: (id) => set({ isDetailOpen: true, detailLeadId: id }),
  closeDetail: () => set({ isDetailOpen: false, detailLeadId: null }),
  setPage: (page) => set({ page }),
}));
