import type { Softphone } from './index';

/** Choose the implementation for what GET /voip/token says the provider is. The real SDK is imported only when needed. */
export async function createSoftphone(provider: string): Promise<Softphone> {
  if (provider === 'mock') {
    const { MockSoftphone } = await import('./mock-sdk');
    return new MockSoftphone();
  }
  const { TwilioSoftphone } = await import('./provider-sdk');
  return new TwilioSoftphone();
}
