/** First-load automatic retries before the trip page gives up and shows a message. */
export const TRIP_LOAD_MAX_RETRIES = 2;

export type TripLoadView = 'loading' | 'ready' | 'not-found' | 'error';

/**
 * What the trip detail page shows. A trip that is already on screen always stays on screen
 * (a failed refresh never turns it into "not found"); a failed first load is retried before the
 * page settles, and only a settled 404 reads as "not found".
 */
export function tripLoadView(input: {
  hasTrip: boolean;
  loading: boolean;
  error: { status: number } | null;
  retries: number;
}): TripLoadView {
  const { hasTrip, loading, error, retries } = input;
  if (hasTrip) return 'ready';
  if (loading) return 'loading';
  if (error && retries < TRIP_LOAD_MAX_RETRIES) return 'loading';
  if (error) return error.status === 404 ? 'not-found' : 'error';
  return 'not-found';
}
