import { describe, expect, it } from 'vitest';
import type { GroupToursSettings, SeatsSummary } from '@/lib/api/departures';
import { CursorPager, toCursorPage } from '@/lib/api/cursor-pager';
import {
  acceptsSeatRequests,
  addDaysIso,
  ageOn,
  bandLabel,
  bookingStatusTone,
  customFieldKey,
  datesEvery,
  defaultBandKey,
  DEPARTURE_STATUSES,
  departureActionLabel,
  departureErrorText,
  departureStatusLabel,
  departureStatusTone,
  durationText,
  effectiveSettings,
  holdCountdownText,
  holdRemaining,
  nextStatuses,
  seatsBarParts,
  seatsBreakdown,
  seatsText,
  seatsTone,
  STATUS_TRANSITIONS,
} from './departures';

const seats = (capacity: number, held: number, confirmed: number, waitlisted = 0): SeatsSummary => ({
  capacity,
  held,
  confirmed,
  waitlisted,
  left: Math.max(0, capacity - held - confirmed),
});

const settings = (): GroupToursSettings => ({
  enabled: true,
  holdExpiryHours: 48,
  confirmMode: 'manual',
  markLeadWonOnConfirm: true,
  waitlist: { enabled: true, offerMode: 'suggest', offerHoldHours: 24 },
  defaultVehicleCapacity: 49,
  bookingCutoffDays: 3,
  extrasCutoffDays: 7,
  passengerFields: [{ key: 'name', label: 'Name', required: true, collectOn: 'booking' }],
  roomTypes: [{ key: 'double', label: 'Double', occupancy: 2 }],
  shareMatching: true,
  preferredSeat: { enabled: false },
  showSeatsLeft: 'below_threshold',
  seatsLeftThreshold: 10,
  deposit: { type: 'none', value: null },
  publicBooking: { requireTerms: true, termsText: '', marketingOptIn: true },
  driverSeesPassengers: false,
});

describe('seats text', () => {
  it('says how many are left of the capacity', () => {
    expect(seatsText(seats(40, 8, 20))).toBe('12 left of 40');
  });

  it('says Full when nothing is left, even if a party waits', () => {
    expect(seatsText(seats(10, 3, 7, 4))).toBe('Full');
    expect(seatsText(seats(0, 0, 0))).toBe('Full');
  });

  it('breaks the seats down and adds the waitlist only when somebody waits', () => {
    expect(seatsBreakdown(seats(40, 8, 20))).toBe('20 confirmed, 8 held');
    expect(seatsBreakdown(seats(40, 8, 20, 1))).toBe('20 confirmed, 8 held, 1 seat on the waitlist');
    expect(seatsBreakdown(seats(40, 8, 20, 5))).toBe('20 confirmed, 8 held, 5 seats on the waitlist');
  });

  it('turns amber when about a fifth is left and red when full', () => {
    expect(seatsTone(seats(40, 8, 20))).toBe('success');
    expect(seatsTone(seats(40, 10, 24))).toBe('warning'); // 6 left, a fifth of 40 is 8
    expect(seatsTone(seats(40, 10, 30))).toBe('danger');
    expect(seatsTone(seats(5, 0, 3))).toBe('warning'); // never fewer than 2 as the threshold
  });

  it('splits the bar into confirmed and held and never overflows', () => {
    expect(seatsBarParts(seats(40, 10, 20))).toEqual({ confirmed: 50, held: 25 });
    expect(seatsBarParts(seats(0, 0, 0))).toEqual({ confirmed: 0, held: 0 });
    const over = seatsBarParts(seats(10, 8, 8));
    expect(over.confirmed + over.held).toBeLessThanOrEqual(100);
  });
});

describe('departure statuses', () => {
  it('offers the legal moves per status, the same table the API enforces', () => {
    expect(nextStatuses('draft')).toEqual(['open', 'cancelled']);
    expect(nextStatuses('open')).toEqual(['closed', 'cancelled']);
    expect(nextStatuses('closed')).toEqual(['departed', 'cancelled']);
    expect(nextStatuses('departed')).toEqual(['completed']);
    expect(nextStatuses('completed')).toEqual([]);
    expect(nextStatuses('cancelled')).toEqual([]);
  });

  it('can cancel from any state before departed and from no state after', () => {
    for (const s of DEPARTURE_STATUSES) {
      const canCancel = STATUS_TRANSITIONS[s].includes('cancelled');
      expect(canCancel, s).toBe(['draft', 'open', 'closed'].includes(s));
    }
  });

  it('never offers a move to the status it is already in', () => {
    for (const s of DEPARTURE_STATUSES) expect(nextStatuses(s)).not.toContain(s);
  });

  it('labels and tones every status', () => {
    expect(departureStatusLabel('open')).toBe('Open');
    expect(departureActionLabel('open')).toBe('Open for booking');
    expect(departureActionLabel('cancelled')).toBe('Cancel departure');
    expect(departureStatusTone('open')).toBe('success');
    expect(departureStatusTone('cancelled')).toBe('danger');
    expect(bookingStatusTone('confirmed')).toBe('success');
    expect(bookingStatusTone('held')).toBe('warning');
    expect(bookingStatusTone('waitlisted')).toBe('info');
  });

  it('takes staff seat requests while open or closed only', () => {
    expect(['draft', 'open', 'closed', 'departed', 'completed', 'cancelled'].filter((s) => acceptsSeatRequests(s as never))).toEqual(['open', 'closed']);
  });
});

describe('effective settings', () => {
  it('uses the departure, then the tour, then the agency setting', () => {
    const s = settings();
    const eff = effectiveSettings({ holdExpiryHours: 12 }, { holdExpiryHours: 24, confirmMode: 'on_deposit' }, s);
    expect(eff.holdExpiryHours).toBe(12);
    expect(eff.confirmMode).toBe('on_deposit');
    expect(eff.bookingCutoffDays).toBe(3);
    expect(eff.deposit).toEqual({ type: 'none', value: null });
  });

  it('treats null as not set, but keeps a zero', () => {
    const s = settings();
    expect(effectiveSettings({ holdExpiryHours: null }, { holdExpiryHours: null }, s).holdExpiryHours).toBe(48);
    expect(effectiveSettings(null, { bookingCutoffDays: 0 }, s).bookingCutoffDays).toBe(0);
  });

  it('takes the tour deposit and lists over the agency ones', () => {
    const s = settings();
    const eff = effectiveSettings(null, { depositType: 'percent', depositValue: 25, roomTypes: [{ key: 'single', label: 'Single', occupancy: 1 }] }, s);
    expect(eff.deposit).toEqual({ type: 'percent', value: 25 });
    expect(eff.roomTypes.map((r) => r.key)).toEqual(['single']);
    expect(eff.passengerFields).toBe(s.passengerFields);
  });
});

describe('hold countdown', () => {
  const now = new Date('2026-10-20T10:00:00.000Z');

  it('counts whole minutes down and flags an expired hold', () => {
    expect(holdRemaining('2026-10-20T15:10:30.000Z', now)).toEqual({ expired: false, minutes: 310 });
    expect(holdRemaining('2026-10-20T09:00:00.000Z', now)).toEqual({ expired: true, minutes: 0 });
    expect(holdRemaining(null, now)).toBeNull();
    expect(holdRemaining('not a date', now)).toBeNull();
  });

  it('writes days and hours, hours and minutes, or minutes', () => {
    expect(durationText(2 * 1440 + 3 * 60)).toBe('2d 3h');
    expect(durationText(310)).toBe('5h 10m');
    expect(durationText(12)).toBe('12m');
    expect(holdCountdownText('2026-10-20T15:10:30.000Z', now)).toBe('Hold ends in 5h 10m');
    expect(holdCountdownText('2026-10-20T09:00:00.000Z', now)).toBe('Hold expired');
  });
});

describe('dates, ages and keys', () => {
  it('adds days to a calendar date across a month and a year', () => {
    expect(addDaysIso('2026-10-30', 3)).toBe('2026-11-02');
    expect(addDaysIso('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('lists weekly departures', () => {
    expect(datesEvery('2026-11-01', 7, 3)).toEqual(['2026-11-01', '2026-11-08', '2026-11-15']);
    expect(datesEvery('2026-11-01', 0, 2)).toEqual(['2026-11-01', '2026-11-02']);
    expect(datesEvery('2026-11-01', 7, 500)).toHaveLength(60);
  });

  it('works out the age on the first day and the built-in band', () => {
    expect(ageOn('2014-11-02', '2026-11-01')).toBe(11);
    expect(ageOn('2014-11-01', '2026-11-01')).toBe(12);
    expect(defaultBandKey(11)).toBe('child');
    expect(defaultBandKey(12)).toBe('adult');
    expect(defaultBandKey(1)).toBe('infant');
    expect(defaultBandKey(null)).toBeNull();
    expect(bandLabel('adult')).toBe('Adult');
    expect(bandLabel('child_6')).toBe('child_6');
  });

  it('derives a safe, unique key for an agency field', () => {
    expect(customFieldKey('Passport no.')).toBe('passport_no');
    expect(customFieldKey('1st language')).toBe('field_1st_language');
    expect(customFieldKey('Dietary', ['dietary'])).toBe('dietary_2');
    expect(customFieldKey('')).toBe('field');
    expect(customFieldKey('Gästebuch')).toMatch(/^[a-z][a-z0-9_]*$/);
  });
});

describe('error text', () => {
  it('translates a known code and keeps the API message otherwise', () => {
    expect(departureErrorText({ code: 'SEATS_UNAVAILABLE', message: 'Only 2 seats are left on this departure' })).toMatch(/Not enough seats/);
    expect(departureErrorText({ code: 'SOMETHING_NEW', message: 'The tour is on fire' })).toBe('The tour is on fire');
    expect(departureErrorText({ message: 'HTTP 500' })).toBe('Something went wrong. Please try again.');
    expect(departureErrorText(null, undefined, 'departures.hold.failed')).toBe('Could not hold the seats');
  });
});

describe('cursor paging', () => {
  it('reads a list envelope', () => {
    const page = toCursorPage<{ id: string }>({ success: true, data: [{ id: 'a' }], pagination: { total: 5, limit: 1, hasMore: true, nextCursor: 'c1' } });
    expect(page).toEqual({ items: [{ id: 'a' }], total: 5, hasMore: true, nextCursor: 'c1' });
    expect(toCursorPage(null)).toEqual({ items: [], total: 0, hasMore: false, nextCursor: null });
  });

  it('asks page N+1 with the cursor of page N and starts over on page 1', async () => {
    const calls: Array<string | undefined> = [];
    const pager = new CursorPager<{ id: number }>(async (cursor, params) => {
      calls.push(cursor);
      const n = cursor ? Number(cursor) : 0;
      const limit = Number(params.limit);
      const data = Array.from({ length: Math.min(limit, 5 - n) }, (_, i) => ({ id: n + i }));
      const next = n + limit < 5 ? String(n + limit) : null;
      return { data, pagination: { total: 5, limit, hasMore: next !== null, nextCursor: next } };
    });
    const p1 = await pager.fetch(1, 2);
    const p2 = await pager.fetch(2, 2);
    const p3 = await pager.fetch(3, 2);
    expect([p1.data.length, p2.data.length, p3.data.length]).toEqual([2, 2, 1]);
    expect(p3.pagination.total).toBe(5); // the last page ends the list
    expect(p1.pagination.total).toBeGreaterThan(p1.data.length);
    expect(calls).toEqual([undefined, '2', '4']);
    await pager.fetch(1, 2);
    expect(calls[3]).toBeUndefined();
    await expect(pager.fetch(7, 2)).rejects.toThrow();
  });
});
