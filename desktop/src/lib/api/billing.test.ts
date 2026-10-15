import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./client', () => ({
  client: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

import { client } from './client';
import { billingApi, openCheckout } from './billing';

describe('billingApi', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('reads the overview and invoices from the billing routes', async () => {
    vi.mocked(client.get).mockResolvedValue({ data: {} });
    await billingApi.overview();
    expect(client.get).toHaveBeenCalledWith('/billing/subscription');
    await billingApi.invoices();
    expect(client.get).toHaveBeenCalledWith('/billing/invoices');
  });

  it('asks for a quote and starts a checkout with the plan and extra users', async () => {
    vi.mocked(client.get).mockResolvedValue({ data: {} });
    vi.mocked(client.post).mockResolvedValue({ data: { url: 'https://pay.test/x' } });
    await billingApi.quote('pro', 3);
    expect(client.get).toHaveBeenCalledWith('/billing/quote', { params: { planKey: 'pro', extraUsers: 3 } });
    await billingApi.checkout('pro', 3);
    expect(client.post).toHaveBeenCalledWith('/billing/checkout', { planKey: 'pro', extraUsers: 3 });
  });

  it('downloads an invoice as a blob and cancels through POST', async () => {
    vi.mocked(client.get).mockResolvedValue(new Blob(['x']));
    await billingApi.downloadInvoice('inv-1');
    expect(client.get).toHaveBeenCalledWith('/billing/invoices/inv-1/download', { responseType: 'blob' });
    vi.mocked(client.post).mockResolvedValue({ data: {} });
    await billingApi.cancel();
    expect(client.post).toHaveBeenCalledWith('/billing/cancel');
  });

  it('opens the checkout URL in a new window without an opener (Electron sends it to the system browser)', () => {
    const open = vi.fn();
    vi.stubGlobal('window', { open });
    openCheckout('https://pay.test/x');
    expect(open).toHaveBeenCalledWith('https://pay.test/x', '_blank', 'noopener,noreferrer');
  });
});
