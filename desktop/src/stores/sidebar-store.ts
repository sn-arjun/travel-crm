import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SidebarState {
  isCollapsed: boolean;
  isHovered: boolean;
  activeGroup: string | null;
  toggle: () => void;
  setCollapsed: (collapsed: boolean) => void;
  setHovered: (hovered: boolean) => void;
  setActiveGroup: (group: string | null) => void;
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      isCollapsed: false,
      isHovered: false,
      activeGroup: null,
      toggle: () => set((state) => ({ isCollapsed: !state.isCollapsed })),
      setCollapsed: (isCollapsed) => set({ isCollapsed }),
      setHovered: (isHovered) => set({ isHovered }),
      setActiveGroup: (activeGroup) => set({ activeGroup }),
    }),
    {
      name: 'travelcrm-sidebar',
      partialize: (state) => ({ isCollapsed: state.isCollapsed }),
    },
  ),
);
