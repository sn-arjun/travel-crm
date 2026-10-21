import { describe, it, expect } from 'vitest';
import { MockGateway } from '../src/services/billing/mock';

// R135-7: the mock checkout link points at the API's own origin, port included.

const quote = { planKey: 'pro', planName: 'Pro', currency: 'GBP', extraUsers: 0, subtotal: 100, total: 120 };
const base = { tenantId: 't1', successUrl: 'http://app/ok', cancelUrl: 'http://app/no' };

describe('mock checkout URL', () => {
  it('uses the API origin of the request (with its port) when API_PUBLIC_URL is not set', async () => {
    const gateway = new MockGateway({ TEST_MODE: 'true' } as any);
    const sub = await gateway.createCheckout({ ...base, quote, apiBaseUrl: 'http://localhost:8857' });
    expect(sub.url.startsWith('http://localhost:8857/api/v1/billing/mock-checkout?')).toBe(true);
    const order = await gateway.createOrderCheckout({ ...base, orderId: 'o1', description: 'x', currency: 'GBP', total: 5, apiBaseUrl: 'http://localhost:8857' });
    expect(order.url.startsWith('http://localhost:8857/api/v1/billing/mock-addon-checkout?')).toBe(true);
  });

  it('API_PUBLIC_URL still wins when it is set', async () => {
    const gateway = new MockGateway({ TEST_MODE: 'true', API_PUBLIC_URL: 'https://api.example.test/' } as any);
    const sub = await gateway.createCheckout({ ...base, quote, apiBaseUrl: 'http://localhost:8857' });
    expect(sub.url.startsWith('https://api.example.test/api/v1/billing/mock-checkout?')).toBe(true);
  });
});
