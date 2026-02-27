/**
 * Trip Cost Calculator Service (M20)
 *
 * Calculates estimated and actual trip costs based on vehicle rate cards.
 * Supports: one_way, round_trip, airport_pickup, airport_drop,
 *           local_8h80km, local_12h120km, outstation, and flat rates.
 */

export interface RateCard {
  flatRate: number | null;
  baseFare: number;
  perKmRate: number;
  perHourRate: number;
  minKm: number;
  minHours: number;
  nightCharge: number;
  driverAllowance: number;
  extraKmRate: number;
  extraHourRate: number;
  tollIncluded: number;
  parkingIncluded: number;
  tripType: string;
}

export interface TripCostInput {
  distanceKm: number;
  durationMinutes: number;
  numDays?: number;       // for outstation
  numNights?: number;     // for night charge
  isNightTrip?: boolean;  // for one-way/airport with night surcharge
}

export interface TripCostBreakdown {
  baseFare: number;
  kmCharges: number;
  timeCharges: number;
  nightCharge: number;
  driverAllowance: number;
  extraKmCharges: number;
  extraHourCharges: number;
  subtotal: number;
  isFlat: boolean;
  total: number;
  details: string; // human-readable breakdown
}

/**
 * Calculate trip cost from rate card and trip parameters.
 */
export function calculateTripCost(
  rateCard: RateCard,
  input: TripCostInput,
): TripCostBreakdown {
  // Flat rate overrides everything
  if (rateCard.flatRate != null && rateCard.flatRate > 0) {
    return {
      baseFare: 0,
      kmCharges: 0,
      timeCharges: 0,
      nightCharge: 0,
      driverAllowance: 0,
      extraKmCharges: 0,
      extraHourCharges: 0,
      subtotal: rateCard.flatRate,
      isFlat: true,
      total: rateCard.flatRate,
      details: `Flat rate: ${rateCard.flatRate}`,
    };
  }

  const tripType = rateCard.tripType;

  switch (tripType) {
    case 'local_8h80km':
      return calculateLocalPackage(rateCard, input, 80, 8);
    case 'local_12h120km':
      return calculateLocalPackage(rateCard, input, 120, 12);
    case 'outstation':
      return calculateOutstation(rateCard, input);
    case 'round_trip':
      return calculateRoundTrip(rateCard, input);
    default:
      // one_way, airport_pickup, airport_drop
      return calculateOneWay(rateCard, input);
  }
}

function calculateOneWay(rc: RateCard, input: TripCostInput): TripCostBreakdown {
  const effectiveKm = Math.max(input.distanceKm, rc.minKm);
  const kmCharges = effectiveKm * rc.perKmRate;
  const nightCharge = input.isNightTrip ? rc.nightCharge : 0;
  const total = rc.baseFare + kmCharges + nightCharge;

  const parts: string[] = [];
  if (rc.baseFare > 0) parts.push(`Base fare: ${rc.baseFare}`);
  if (kmCharges > 0) parts.push(`${effectiveKm} km × ${rc.perKmRate}/km = ${kmCharges}`);
  if (nightCharge > 0) parts.push(`Night charge: ${nightCharge}`);

  return {
    baseFare: rc.baseFare,
    kmCharges,
    timeCharges: 0,
    nightCharge,
    driverAllowance: 0,
    extraKmCharges: 0,
    extraHourCharges: 0,
    subtotal: total,
    isFlat: false,
    total,
    details: parts.join(' + '),
  };
}

function calculateRoundTrip(rc: RateCard, input: TripCostInput): TripCostBreakdown {
  const effectiveKm = Math.max(input.distanceKm, rc.minKm);
  const kmCharges = effectiveKm * rc.perKmRate;
  const nightCharge = (input.numNights ?? 0) * rc.nightCharge;
  const driverAllowance = (input.numDays ?? 1) * rc.driverAllowance;
  const total = rc.baseFare + kmCharges + nightCharge + driverAllowance;

  const parts: string[] = [];
  if (rc.baseFare > 0) parts.push(`Base fare: ${rc.baseFare}`);
  if (kmCharges > 0) parts.push(`${effectiveKm} km × ${rc.perKmRate}/km = ${kmCharges}`);
  if (nightCharge > 0) parts.push(`Night charge: ${(input.numNights ?? 0)} × ${rc.nightCharge} = ${nightCharge}`);
  if (driverAllowance > 0) parts.push(`Driver allowance: ${(input.numDays ?? 1)} × ${rc.driverAllowance} = ${driverAllowance}`);

  return {
    baseFare: rc.baseFare,
    kmCharges,
    timeCharges: 0,
    nightCharge,
    driverAllowance,
    extraKmCharges: 0,
    extraHourCharges: 0,
    subtotal: total,
    isFlat: false,
    total,
    details: parts.join(' + '),
  };
}

function calculateLocalPackage(
  rc: RateCard,
  input: TripCostInput,
  includedKm: number,
  includedHours: number,
): TripCostBreakdown {
  const durationHours = input.durationMinutes / 60;
  const extraKm = Math.max(0, input.distanceKm - includedKm);
  const extraHours = Math.max(0, durationHours - includedHours);
  const extraKmCharges = extraKm * rc.extraKmRate;
  const extraHourCharges = extraHours * rc.extraHourRate;
  const total = rc.baseFare + extraKmCharges + extraHourCharges;

  const parts: string[] = [`Package (${includedHours}h/${includedKm}km): ${rc.baseFare}`];
  if (extraKm > 0) parts.push(`Extra ${extraKm.toFixed(1)} km × ${rc.extraKmRate}/km = ${extraKmCharges.toFixed(2)}`);
  if (extraHours > 0) parts.push(`Extra ${extraHours.toFixed(1)} hr × ${rc.extraHourRate}/hr = ${extraHourCharges.toFixed(2)}`);

  return {
    baseFare: rc.baseFare,
    kmCharges: 0,
    timeCharges: 0,
    nightCharge: 0,
    driverAllowance: 0,
    extraKmCharges,
    extraHourCharges,
    subtotal: total,
    isFlat: false,
    total,
    details: parts.join(' + '),
  };
}

function calculateOutstation(rc: RateCard, input: TripCostInput): TripCostBreakdown {
  const effectiveKm = Math.max(input.distanceKm, rc.minKm);
  const kmCharges = effectiveKm * rc.perKmRate;
  const numDays = input.numDays ?? Math.max(1, Math.ceil(input.durationMinutes / (24 * 60)));
  const numNights = input.numNights ?? Math.max(0, numDays - 1);
  const nightCharge = numNights * rc.nightCharge;
  const driverAllowance = numDays * rc.driverAllowance;
  const total = rc.baseFare + kmCharges + nightCharge + driverAllowance;

  const parts: string[] = [];
  if (rc.baseFare > 0) parts.push(`Base fare: ${rc.baseFare}`);
  if (kmCharges > 0) parts.push(`${effectiveKm} km × ${rc.perKmRate}/km = ${kmCharges}`);
  if (nightCharge > 0) parts.push(`Night charge: ${numNights} × ${rc.nightCharge} = ${nightCharge}`);
  if (driverAllowance > 0) parts.push(`Driver allowance: ${numDays} × ${rc.driverAllowance} = ${driverAllowance}`);

  return {
    baseFare: rc.baseFare,
    kmCharges,
    timeCharges: 0,
    nightCharge,
    driverAllowance,
    extraKmCharges: 0,
    extraHourCharges: 0,
    subtotal: total,
    isFlat: false,
    total,
    details: parts.join(' + '),
  };
}

/**
 * Calculate distance between two lat/lng points using Haversine formula.
 * Returns distance in kilometers.
 */
export function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Calculate road distance using Google Distance Matrix API.
 * Falls back to Haversine × 1.3 factor if no API key or API failure.
 */
export async function calculateDistance(
  originLat: number, originLng: number,
  destLat: number, destLng: number,
  googleMapsApiKey?: string,
): Promise<{ distanceKm: number; durationMinutes: number; source: 'google' | 'haversine' }> {
  if (googleMapsApiKey) {
    try {
      const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${originLat},${originLng}&destinations=${destLat},${destLng}&key=${googleMapsApiKey}`;
      const response = await fetch(url);
      const data = await response.json() as any;

      if (data.status === 'OK' && data.rows?.[0]?.elements?.[0]?.status === 'OK') {
        const element = data.rows[0].elements[0];
        return {
          distanceKm: element.distance.value / 1000,
          durationMinutes: element.duration.value / 60,
          source: 'google',
        };
      }
    } catch {
      // Fall through to haversine
    }
  }

  const straightLine = haversineDistance(originLat, originLng, destLat, destLng);
  // Road distance is typically ~1.3x straight-line distance
  const roadDistance = straightLine * 1.3;
  // Estimate ~40 km/h average speed
  const durationMinutes = (roadDistance / 40) * 60;

  return {
    distanceKm: Math.round(roadDistance * 10) / 10,
    durationMinutes: Math.round(durationMinutes),
    source: 'haversine',
  };
}
