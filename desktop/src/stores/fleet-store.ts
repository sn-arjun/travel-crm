'use client';

import { create } from 'zustand';

type FleetTab = 'dashboard' | 'vehicles' | 'drivers' | 'trips' | 'rate-cards' | 'alerts';

interface FleetState {
  activeTab: FleetTab;
  vehicleView: 'grid' | 'table';
  driverView: 'grid' | 'table';
  tripView: 'kanban' | 'table';
  setActiveTab: (tab: FleetTab) => void;
  setVehicleView: (view: 'grid' | 'table') => void;
  setDriverView: (view: 'grid' | 'table') => void;
  setTripView: (view: 'kanban' | 'table') => void;
}

export const useFleetStore = create<FleetState>()((set) => ({
  activeTab: 'dashboard',
  vehicleView: 'grid',
  driverView: 'grid',
  tripView: 'kanban',
  setActiveTab: (tab) => set({ activeTab: tab }),
  setVehicleView: (view) => set({ vehicleView: view }),
  setDriverView: (view) => set({ driverView: view }),
  setTripView: (view) => set({ tripView: view }),
}));
