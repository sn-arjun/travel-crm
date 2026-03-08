'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface RateCard {
  baseFare: number;
  perKmRate: number;
  perHourRate: number;
  nightCharge: number;
  driverAllowance: number;
}

interface TripCostEstimateProps {
  rateCard: RateCard;
  distance: number;
  duration: number;
  includeNight: boolean;
}

export function TripCostEstimateCard({
  rateCard,
  distance,
  duration,
  includeNight,
}: TripCostEstimateProps) {
  const baseFare = rateCard.baseFare;
  const distanceCost = distance * rateCard.perKmRate;
  const durationCost = duration * rateCard.perHourRate;
  const nightCharge = includeNight ? rateCard.nightCharge : 0;
  const driverAllowance = rateCard.driverAllowance;

  const subtotal = baseFare + distanceCost + durationCost + nightCharge + driverAllowance;
  const total = subtotal;

  const lineItems = [
    { label: 'Base Fare', amount: baseFare, show: true },
    { label: `Distance (${distance} km @ ₹${rateCard.perKmRate}/km)`, amount: distanceCost, show: distance > 0 },
    { label: `Duration (${duration} hrs @ ₹${rateCard.perHourRate}/hr)`, amount: durationCost, show: duration > 0 && rateCard.perHourRate > 0 },
    { label: 'Night Charge', amount: nightCharge, show: includeNight },
    { label: 'Driver Allowance', amount: driverAllowance, show: true },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cost Estimate</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Line items */}
          {lineItems.map(
            (item) =>
              item.show && (
                <div key={item.label} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="font-medium">₹{item.amount.toFixed(0)}</span>
                </div>
              ),
          )}

          {/* Divider */}
          <div className="border-t pt-3" />

          {/* Total */}
          <div className="flex justify-between text-base font-semibold">
            <span>Total Estimated Cost</span>
            <span className="text-primary">₹{total.toFixed(0)}</span>
          </div>

          {/* Note */}
          <p className="text-xs text-muted-foreground pt-2">
            This is an estimate based on the provided rate card. Actual charges may vary based on traffic, route changes, or additional services.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
