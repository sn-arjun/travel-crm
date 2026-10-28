import { describe, expect, it } from 'vitest';
import { computeHeadcount, headcountShares, isCountComplete, newOpId, nextBoarding, withTick } from './headcount';

const stops = [
  { id: 's2', name: 'Second', sortOrder: 1 },
  { id: 's1', name: 'First', sortOrder: 0 },
];
const pax = (id: string, tripStopId: string | null, seats: number, boarding: 'pending' | 'boarded' | 'no_show', documentsChecked = false) => ({
  id, tripStopId, seats, boarding, documentsChecked,
});

describe('computeHeadcount', () => {
  it('counts heads (seats), overall and per stop in stop order', () => {
    const h = computeHeadcount(
      [pax('a', 's1', 1, 'boarded', true), pax('b', 's1', 2, 'no_show'), pax('c', 's2', 1, 'pending'), pax('d', 's2', 3, 'boarded', true)],
      stops,
    );
    expect(h).toMatchObject({ expected: 7, boarded: 4, noShow: 2, pending: 1, documentsChecked: 2 });
    expect(h.byStop.map((s) => [s.name, s.expected, s.boarded, s.noShow, s.pending])).toEqual([
      ['First', 3, 1, 2, 0],
      ['Second', 4, 3, 0, 1],
    ]);
  });

  it('puts people without a stop, or at a stop that is gone, under "no stop" last', () => {
    const h = computeHeadcount([pax('a', null, 1, 'pending'), pax('b', 'gone', 1, 'boarded'), pax('c', 's1', 1, 'pending')], stops);
    expect(h.byStop.map((s) => s.stopId)).toEqual(['s1', 's2', null]);
    expect(h.byStop[2]).toMatchObject({ name: null, expected: 2, boarded: 1, pending: 1 });
    expect(h.expected).toBe(3);
  });

  it('is empty for an empty trip', () => {
    expect(computeHeadcount([], [])).toEqual({ expected: 0, boarded: 0, noShow: 0, pending: 0, documentsChecked: 0, byStop: [] });
  });
});

describe('headcountShares', () => {
  it('adds up to 100 when anyone is expected', () => {
    const s = headcountShares({ expected: 3, boarded: 1, noShow: 1 });
    expect(s).toEqual({ boarded: 33, noShow: 33, pending: 34 });
    expect(s.boarded + s.noShow + s.pending).toBe(100);
  });
  it('is all zero for nobody expected', () => {
    expect(headcountShares({ expected: 0, boarded: 0, noShow: 0 })).toEqual({ boarded: 0, noShow: 0, pending: 0 });
  });
  it('never goes negative when rounding overshoots', () => {
    expect(headcountShares({ expected: 3, boarded: 2, noShow: 1 })).toEqual({ boarded: 67, noShow: 33, pending: 0 });
  });
});

describe('isCountComplete', () => {
  it('needs people expected and none pending', () => {
    expect(isCountComplete({ expected: 4, pending: 0 })).toBe(true);
    expect(isCountComplete({ expected: 4, pending: 1 })).toBe(false);
    expect(isCountComplete({ expected: 0, pending: 0 })).toBe(false);
  });
});

describe('ticks', () => {
  it('pressing the status that is set takes it back to pending', () => {
    expect(nextBoarding('pending', 'boarded')).toBe('boarded');
    expect(nextBoarding('boarded', 'boarded')).toBe('pending');
    expect(nextBoarding('boarded', 'no_show')).toBe('no_show');
    expect(nextBoarding('no_show', 'no_show')).toBe('pending');
  });

  it('applies one tick to one passenger and leaves the rest alone', () => {
    const list = [pax('a', 's1', 1, 'pending'), pax('b', 's1', 1, 'pending')];
    const next = withTick(list, 'a', { boarding: 'boarded' });
    expect(next[0]).toMatchObject({ boarding: 'boarded', documentsChecked: false });
    expect(next[1]).toBe(list[1]);
    expect(withTick(list, 'a', { documentsChecked: true })[0]).toMatchObject({ boarding: 'pending', documentsChecked: true });
    expect(list[0]?.boarding).toBe('pending');
  });

  it('makes a different operation id every time', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newOpId()));
    expect(ids.size).toBe(50);
  });
});
