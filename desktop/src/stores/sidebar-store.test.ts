import { describe, it, expect, beforeEach } from 'vitest';
import { useSidebarStore } from './sidebar-store';

describe('useSidebarStore', () => {
  beforeEach(() => {
    useSidebarStore.setState({
      isCollapsed: false,
      isHovered: false,
      activeGroup: null,
    });
  });

  it('should start expanded', () => {
    const state = useSidebarStore.getState();
    expect(state.isCollapsed).toBe(false);
    expect(state.isHovered).toBe(false);
    expect(state.activeGroup).toBeNull();
  });

  it('should toggle collapsed state', () => {
    const { toggle } = useSidebarStore.getState();

    toggle();
    expect(useSidebarStore.getState().isCollapsed).toBe(true);

    toggle();
    expect(useSidebarStore.getState().isCollapsed).toBe(false);
  });

  it('should set collapsed directly', () => {
    const { setCollapsed } = useSidebarStore.getState();

    setCollapsed(true);
    expect(useSidebarStore.getState().isCollapsed).toBe(true);

    setCollapsed(false);
    expect(useSidebarStore.getState().isCollapsed).toBe(false);
  });

  it('should set hovered state', () => {
    const { setHovered } = useSidebarStore.getState();

    setHovered(true);
    expect(useSidebarStore.getState().isHovered).toBe(true);

    setHovered(false);
    expect(useSidebarStore.getState().isHovered).toBe(false);
  });

  it('should set active group', () => {
    const { setActiveGroup } = useSidebarStore.getState();

    setActiveGroup('crm');
    expect(useSidebarStore.getState().activeGroup).toBe('crm');

    setActiveGroup('settings');
    expect(useSidebarStore.getState().activeGroup).toBe('settings');

    setActiveGroup(null);
    expect(useSidebarStore.getState().activeGroup).toBeNull();
  });
});
