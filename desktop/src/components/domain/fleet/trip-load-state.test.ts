import { describe, expect, it } from 'vitest';
import { tripLoadView, TRIP_LOAD_MAX_RETRIES } from './trip-load-state';

describe('tripLoadView', () => {
  it('shows a skeleton while the first request is in flight', () => {
    expect(tripLoadView({ hasTrip: false, loading: true, error: null, retries: 0 })).toBe('loading');
  });

  it('keeps a loaded trip on screen even if a refresh fails or returns nothing', () => {
    expect(tripLoadView({ hasTrip: true, loading: false, error: { status: 404 }, retries: 0 })).toBe('ready');
    expect(tripLoadView({ hasTrip: true, loading: true, error: null, retries: 0 })).toBe('ready');
  });

  it('retries a failed first load before showing anything', () => {
    for (let r = 0; r < TRIP_LOAD_MAX_RETRIES; r++) {
      expect(tripLoadView({ hasTrip: false, loading: false, error: { status: 404 }, retries: r })).toBe('loading');
      expect(tripLoadView({ hasTrip: false, loading: false, error: { status: 500 }, retries: r })).toBe('loading');
    }
  });

  it('shows not-found only for a settled 404, and an error state for anything else', () => {
    expect(tripLoadView({ hasTrip: false, loading: false, error: { status: 404 }, retries: TRIP_LOAD_MAX_RETRIES })).toBe('not-found');
    expect(tripLoadView({ hasTrip: false, loading: false, error: { status: 500 }, retries: TRIP_LOAD_MAX_RETRIES })).toBe('error');
    expect(tripLoadView({ hasTrip: false, loading: false, error: { status: 0 }, retries: TRIP_LOAD_MAX_RETRIES })).toBe('error');
  });

  it('treats an empty successful response as not found', () => {
    expect(tripLoadView({ hasTrip: false, loading: false, error: null, retries: 0 })).toBe('not-found');
  });
});
