/**
 * The single switch for test shortcuts (reset route, fixed driver OTP, provider signature bypass,
 * inbound-email secret bypass, mail outbox). Production can never enable it, even if TEST_MODE leaks
 * into the production environment; index.ts also refuses to serve in that case.
 */
export function isTestMode(env: { TEST_MODE?: string; ENVIRONMENT?: string } | undefined | null): boolean {
  return env?.TEST_MODE === 'true' && env?.ENVIRONMENT !== 'production';
}
