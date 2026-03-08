import { describe, it, expect, beforeEach } from 'vitest';
import { useFleetStore } from './fleet-store';

describe('useFleetStore', () => {
  beforeEach(() => {
    useFleetStore.setState({
      activeTab: 'dashboard',
      vehicleView: 'grid',
      driverView: 'grid',
      tripView: 'kanban',
    });
  });

  it('should start with default state', () => {
    const state = useFleetStore.getState();
    expect(state.activeTab).toBe('dashboard');
    expect(state.vehicleView).toBe('grid');
    expect(state.driverView).toBe('grid');
    expect(state.tripView).toBe('kanban');
  });

  it('should set active tab', () => {
    useFleetStore.getState().setActiveTab('vehicles');
    expect(useFleetStore.getState().activeTab).toBe('vehicles');

    useFleetStore.getState().setActiveTab('drivers');
    expect(useFleetStore.getState().activeTab).toBe('drivers');

    useFleetStore.getState().setActiveTab('trips');
    expect(useFleetStore.getState().activeTab).toBe('trips');

    useFleetStore.getState().setActiveTab('rate-cards');
    expect(useFleetStore.getState().activeTab).toBe('rate-cards');

    useFleetStore.getState().setActiveTab('alerts');
    expect(useFleetStore.getState().activeTab).toBe('alerts');
  });

  it('should toggle vehicle view between grid and table', () => {
    useFleetStore.getState().setVehicleView('table');
    expect(useFleetStore.getState().vehicleView).toBe('table');

    useFleetStore.getState().setVehicleView('grid');
    expect(useFleetStore.getState().vehicleView).toBe('grid');
  });

  it('should toggle driver view between grid and table', () => {
    useFleetStore.getState().setDriverView('table');
    expect(useFleetStore.getState().driverView).toBe('table');

    useFleetStore.getState().setDriverView('grid');
    expect(useFleetStore.getState().driverView).toBe('grid');
  });

  it('should toggle trip view between kanban and table', () => {
    useFleetStore.getState().setTripView('table');
    expect(useFleetStore.getState().tripView).toBe('table');

    useFleetStore.getState().setTripView('kanban');
    expect(useFleetStore.getState().tripView).toBe('kanban');
  });
});
