import { describe, it, expect } from 'vitest';
import {
  calculateTripCost,
  haversineDistance,
  type RateCard,
  type TripCostInput,
} from '../../src/services/trip-cost-calculator';

// Helper to make a base rate card
function makeRateCard(overrides: Partial<RateCard> = {}): RateCard {
  return {
    flatRate: null,
    baseFare: 500,
    perKmRate: 15,
    perHourRate: 100,
    minKm: 10,
    minHours: 1,
    nightCharge: 200,
    driverAllowance: 300,
    extraKmRate: 12,
    extraHourRate: 80,
    tollIncluded: 0,
    parkingIncluded: 0,
    tripType: 'one_way',
    ...overrides,
  };
}

describe('calculateTripCost - flat rate', () => {
  it('should use flat rate when provided', () => {
    const rc = makeRateCard({ flatRate: 2500 });
    const input: TripCostInput = { distanceKm: 50, durationMinutes: 60 };

    const result = calculateTripCost(rc, input);

    expect(result.isFlat).toBe(true);
    expect(result.total).toBe(2500);
    expect(result.baseFare).toBe(0);
    expect(result.kmCharges).toBe(0);
    expect(result.details).toContain('Flat rate');
  });

  it('should ignore all other charges when flat rate is set', () => {
    const rc = makeRateCard({
      flatRate: 1000,
      baseFare: 500,
      perKmRate: 20,
      nightCharge: 300,
    });
    const input: TripCostInput = { distanceKm: 100, durationMinutes: 120, isNightTrip: true };

    const result = calculateTripCost(rc, input);
    expect(result.total).toBe(1000);
    expect(result.nightCharge).toBe(0);
  });
});

describe('calculateTripCost - one_way', () => {
  it('should calculate basic one-way trip', () => {
    const rc = makeRateCard({ tripType: 'one_way' });
    const input: TripCostInput = { distanceKm: 30, durationMinutes: 45 };

    const result = calculateTripCost(rc, input);

    expect(result.baseFare).toBe(500);
    expect(result.kmCharges).toBe(30 * 15); // 450
    expect(result.total).toBe(500 + 450);
    expect(result.isFlat).toBe(false);
    expect(result.nightCharge).toBe(0);
  });

  it('should enforce minimum km', () => {
    const rc = makeRateCard({ tripType: 'one_way', minKm: 20 });
    const input: TripCostInput = { distanceKm: 5, durationMinutes: 10 };

    const result = calculateTripCost(rc, input);

    // Should charge for 20 km (minimum), not 5 km
    expect(result.kmCharges).toBe(20 * 15);
  });

  it('should add night charge for night trips', () => {
    const rc = makeRateCard({ tripType: 'one_way', nightCharge: 200 });
    const input: TripCostInput = { distanceKm: 30, durationMinutes: 45, isNightTrip: true };

    const result = calculateTripCost(rc, input);
    expect(result.nightCharge).toBe(200);
    expect(result.total).toBe(500 + 30 * 15 + 200);
  });

  it('should not add night charge for day trips', () => {
    const rc = makeRateCard({ tripType: 'one_way' });
    const input: TripCostInput = { distanceKm: 30, durationMinutes: 45, isNightTrip: false };

    const result = calculateTripCost(rc, input);
    expect(result.nightCharge).toBe(0);
  });
});

describe('calculateTripCost - airport_pickup', () => {
  it('should use one-way calculation for airport trips', () => {
    const rc = makeRateCard({ tripType: 'airport_pickup' });
    const input: TripCostInput = { distanceKm: 25, durationMinutes: 40 };

    const result = calculateTripCost(rc, input);
    expect(result.baseFare).toBe(500);
    expect(result.kmCharges).toBe(25 * 15);
  });
});

describe('calculateTripCost - round_trip', () => {
  it('should calculate round trip with night charge and driver allowance', () => {
    const rc = makeRateCard({
      tripType: 'round_trip',
      nightCharge: 200,
      driverAllowance: 300,
    });
    const input: TripCostInput = { distanceKm: 200, durationMinutes: 600, numDays: 2, numNights: 1 };

    const result = calculateTripCost(rc, input);

    expect(result.baseFare).toBe(500);
    expect(result.kmCharges).toBe(200 * 15); // 3000
    expect(result.nightCharge).toBe(1 * 200); // 200
    expect(result.driverAllowance).toBe(2 * 300); // 600
    expect(result.total).toBe(500 + 3000 + 200 + 600);
  });

  it('should default numDays to 1 if not provided', () => {
    const rc = makeRateCard({ tripType: 'round_trip', driverAllowance: 300 });
    const input: TripCostInput = { distanceKm: 100, durationMinutes: 120 };

    const result = calculateTripCost(rc, input);
    expect(result.driverAllowance).toBe(300); // 1 day * 300
  });

  it('should default numNights to 0 if not provided', () => {
    const rc = makeRateCard({ tripType: 'round_trip', nightCharge: 200 });
    const input: TripCostInput = { distanceKm: 100, durationMinutes: 120 };

    const result = calculateTripCost(rc, input);
    expect(result.nightCharge).toBe(0); // 0 nights * 200
  });
});

describe('calculateTripCost - local_8h80km', () => {
  it('should charge base fare only within package limits', () => {
    const rc = makeRateCard({ tripType: 'local_8h80km', baseFare: 1500 });
    const input: TripCostInput = { distanceKm: 60, durationMinutes: 360 }; // 60km, 6h

    const result = calculateTripCost(rc, input);

    expect(result.baseFare).toBe(1500);
    expect(result.extraKmCharges).toBe(0);
    expect(result.extraHourCharges).toBe(0);
    expect(result.total).toBe(1500);
  });

  it('should charge extra km beyond 80km', () => {
    const rc = makeRateCard({ tripType: 'local_8h80km', baseFare: 1500, extraKmRate: 12 });
    const input: TripCostInput = { distanceKm: 100, durationMinutes: 360 }; // 100km, 6h

    const result = calculateTripCost(rc, input);

    expect(result.extraKmCharges).toBe(20 * 12); // 240
    expect(result.total).toBe(1500 + 240);
  });

  it('should charge extra hours beyond 8h', () => {
    const rc = makeRateCard({ tripType: 'local_8h80km', baseFare: 1500, extraHourRate: 80 });
    const input: TripCostInput = { distanceKm: 60, durationMinutes: 600 }; // 60km, 10h

    const result = calculateTripCost(rc, input);

    expect(result.extraHourCharges).toBe(2 * 80); // 160
    expect(result.total).toBe(1500 + 160);
  });

  it('should charge both extra km and extra hours', () => {
    const rc = makeRateCard({
      tripType: 'local_8h80km',
      baseFare: 1500,
      extraKmRate: 12,
      extraHourRate: 80,
    });
    const input: TripCostInput = { distanceKm: 100, durationMinutes: 600 }; // 100km, 10h

    const result = calculateTripCost(rc, input);

    expect(result.extraKmCharges).toBe(20 * 12); // 240
    expect(result.extraHourCharges).toBe(2 * 80); // 160
    expect(result.total).toBe(1500 + 240 + 160);
  });
});

describe('calculateTripCost - local_12h120km', () => {
  it('should use 12h/120km package limits', () => {
    const rc = makeRateCard({ tripType: 'local_12h120km', baseFare: 2000, extraKmRate: 12 });
    const input: TripCostInput = { distanceKm: 150, durationMinutes: 600 }; // 150km, 10h

    const result = calculateTripCost(rc, input);

    expect(result.extraKmCharges).toBe(30 * 12); // 30km extra
    expect(result.extraHourCharges).toBe(0); // 10h < 12h
    expect(result.total).toBe(2000 + 360);
  });
});

describe('calculateTripCost - outstation', () => {
  it('should calculate outstation trip with multi-day costs', () => {
    const rc = makeRateCard({
      tripType: 'outstation',
      baseFare: 0,
      perKmRate: 12,
      nightCharge: 300,
      driverAllowance: 250,
    });
    const input: TripCostInput = { distanceKm: 500, durationMinutes: 2880, numDays: 3, numNights: 2 };

    const result = calculateTripCost(rc, input);

    expect(result.kmCharges).toBe(500 * 12); // 6000
    expect(result.nightCharge).toBe(2 * 300); // 600
    expect(result.driverAllowance).toBe(3 * 250); // 750
    expect(result.total).toBe(6000 + 600 + 750);
  });

  it('should auto-calculate numDays from duration if not provided', () => {
    const rc = makeRateCard({ tripType: 'outstation', driverAllowance: 250 });
    const input: TripCostInput = { distanceKm: 200, durationMinutes: 2880 }; // 2880min = 48h = 2 days

    const result = calculateTripCost(rc, input);
    expect(result.driverAllowance).toBe(2 * 250); // 2 days
  });
});

describe('haversineDistance', () => {
  it('should return 0 for same coordinates', () => {
    const result = haversineDistance(0, 0, 0, 0);
    expect(result).toBe(0);
  });

  it('should calculate correct distance between Mumbai and Delhi', () => {
    // Mumbai: 19.076, 72.878 | Delhi: 28.614, 77.209
    const result = haversineDistance(19.076, 72.878, 28.614, 77.209);
    // Approximately 1153 km straight-line distance
    expect(result).toBeGreaterThan(1050);
    expect(result).toBeLessThan(1200);
  });

  it('should calculate correct distance between London and New York', () => {
    // London: 51.507, -0.128 | New York: 40.714, -74.006
    const result = haversineDistance(51.507, -0.128, 40.714, -74.006);
    // Approximately 5570 km
    expect(result).toBeGreaterThan(5400);
    expect(result).toBeLessThan(5700);
  });

  it('should be symmetric (a to b equals b to a)', () => {
    const d1 = haversineDistance(19.076, 72.878, 28.614, 77.209);
    const d2 = haversineDistance(28.614, 77.209, 19.076, 72.878);
    expect(d1).toBeCloseTo(d2, 5);
  });

  it('should handle antipodal points (maximum distance)', () => {
    // North pole to south pole
    const result = haversineDistance(90, 0, -90, 0);
    // Half circumference of earth ~20000 km
    expect(result).toBeGreaterThan(19900);
    expect(result).toBeLessThan(20100);
  });

  it('should handle nearby points accurately', () => {
    // Two points ~1 km apart in Mumbai
    const result = haversineDistance(19.076, 72.878, 19.085, 72.878);
    expect(result).toBeGreaterThan(0.5);
    expect(result).toBeLessThan(2);
  });

  it('should handle crossing the international date line', () => {
    // Points near the dateline
    const result = haversineDistance(0, 179, 0, -179);
    // Should be about 222 km
    expect(result).toBeGreaterThan(200);
    expect(result).toBeLessThan(250);
  });
});
