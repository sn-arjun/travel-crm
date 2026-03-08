'use client';

import * as React from 'react';
import { Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { mockVehicles, mockDrivers } from '@/lib/fleet-mock-data';
import { VEHICLE_TYPE_LABELS } from '@travelcrm/shared';

interface AvailabilityPickerProps {
  type: 'vehicle' | 'driver';
  startDate: string;
  endDate: string;
  selectedId?: string;
  onSelect: (id: string) => void;
}

export function AvailabilityPicker({
  type,
  startDate,
  endDate,
  selectedId,
  onSelect,
}: AvailabilityPickerProps) {
  const items = type === 'vehicle' ? mockVehicles : mockDrivers;

  const filteredItems = items.filter((item: any) => {
    if (type === 'vehicle') {
      const v = item as typeof mockVehicles[0];
      return v.status === 'available';
    } else {
      const d = item as typeof mockDrivers[0];
      return d.status === 'active';
    }
  });

  const renderVehicleItem = (vehicle: typeof mockVehicles[0]) => (
    <div className="space-y-1">
      <div className="font-medium">{vehicle.registrationNumber}</div>
      <div className="text-sm text-muted-foreground">
        {vehicle.make} {vehicle.model} • {VEHICLE_TYPE_LABELS[vehicle.type]}
      </div>
      <div className="text-sm text-muted-foreground">
        {vehicle.seatingCapacity} seats
      </div>
    </div>
  );

  const renderDriverItem = (driver: typeof mockDrivers[0]) => (
    <div className="space-y-1">
      <div className="font-medium">{driver.name}</div>
      <div className="text-sm text-muted-foreground">
        ★{driver.rating} • {driver.totalTrips} trips
      </div>
      <div className="text-sm text-muted-foreground">
        {driver.phone}
      </div>
    </div>
  );

  const dateRange = startDate && endDate ? `${startDate} to ${endDate}` : 'Select dates';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {type === 'vehicle' ? 'Available Vehicles' : 'Available Drivers'}
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-1">{dateRange}</p>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {filteredItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No {type === 'vehicle' ? 'vehicles' : 'drivers'} available for this date range
            </div>
          ) : (
            filteredItems.map((item: any) => {
              const itemId = type === 'vehicle' ? (item as typeof mockVehicles[0]).id : (item as typeof mockDrivers[0]).id;
              const isSelected = itemId === selectedId;

              return (
                <div
                  key={itemId}
                  onClick={() => onSelect(itemId)}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    isSelected
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50 hover:bg-accent'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      {type === 'vehicle'
                        ? renderVehicleItem(item as typeof mockVehicles[0])
                        : renderDriverItem(item as typeof mockDrivers[0])}
                    </div>
                    {isSelected && (
                      <div className="flex-shrink-0 mt-1">
                        <Check className="h-5 w-5 text-primary" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
