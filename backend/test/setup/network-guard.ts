/**
 * Network guard for the backend test suite: no test may reach a real provider.
 *
 * Some tests switch TEST_MODE off on purpose (to exercise production limits), and then code paths that would
 * normally write to the local outbox call the provider instead, with the test-only keys. That sends test data
 * to a third party. This guard answers every request to a known provider host with a synthetic 503, so the
 * product's own error handling runs and nothing leaves the machine.
 *
 * A test that wants to check a provider call still works: it replaces globalThis.fetch (vi.spyOn or assignment)
 * and the replacement is called instead of this guard.
 */

const PROVIDER_HOSTS = [
  'api.sendgrid.com',
  'api.twilio.com',
  'verify.twilio.com',
  'graph.facebook.com',
  'api.stripe.com',
  'api.razorpay.com',
  'api.anthropic.com',
  'api.deepgram.com',
  'fcm.googleapis.com',
  'maps.googleapis.com',
  'open.er-api.com',
  'api.cloudflare.com',
];

const blocked: string[] = [];

const realFetch = globalThis.fetch.bind(globalThis);

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    return realFetch(input, init);
  }
  if (PROVIDER_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
    blocked.push(`${(init?.method ?? 'GET').toUpperCase()} ${host}`);
    return new Response(JSON.stringify({ errors: [{ message: `blocked in tests: ${host} (network guard)` }] }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return realFetch(input, init);
}) as typeof fetch;

/** Provider requests the guard refused (for tests that want to assert nothing tried to leave). */
export function blockedProviderRequests(): readonly string[] {
  return blocked;
}
