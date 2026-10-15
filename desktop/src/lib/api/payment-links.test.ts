import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./client', () => ({
  client: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

import { client } from './client';
import { invoicesApi, normalizeInvoiceDetail } from './invoices';
import { integrationsApi } from './integrations';

describe('payment link API (R207)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates and cancels a payment link on an invoice', async () => {
    vi.mocked(client.post).mockResolvedValue({ data: { url: 'https://rzp.io/i/x' } });
    await invoicesApi.createPaymentLink('inv1');
    expect(client.post).toHaveBeenCalledWith('/invoices/inv1/payment-link', {});
    await invoicesApi.createPaymentLink('inv1', { gateway: 'stripe' });
    expect(client.post).toHaveBeenLastCalledWith('/invoices/inv1/payment-link', { gateway: 'stripe' });
    vi.mocked(client.delete).mockResolvedValue({ data: { status: 'cancelled' } });
    await invoicesApi.cancelPaymentLink('inv1');
    expect(client.delete).toHaveBeenCalledWith('/invoices/inv1/payment-link');
  });

  it('reads the payment link off the invoice detail (snake_case from the API)', () => {
    const inv = normalizeInvoiceDetail({
      id: 'i1', total: 100, items: [], payments: [],
      payment_link_id: 'plink_1', payment_link_url: 'https://rzp.io/i/abc', payment_link_status: 'created', payment_link_gateway: 'razorpay',
    });
    expect(inv?.paymentLink).toEqual({ id: 'plink_1', url: 'https://rzp.io/i/abc', status: 'created', gateway: 'razorpay' });
  });

  it('has no payment link when the invoice has none', () => {
    expect(normalizeInvoiceDetail({ id: 'i2', total: 100, items: [], payments: [] })?.paymentLink).toBeNull();
  });

  it('connects, tests and disconnects the agency gateway through the integrations API', async () => {
    vi.mocked(client.get).mockResolvedValue({ data: { accounts: [] } });
    await integrationsApi.listPaymentGateways();
    expect(client.get).toHaveBeenCalledWith('/integrations/payment-gateways');
    vi.mocked(client.put).mockResolvedValue({ data: {} });
    await integrationsApi.savePaymentGateway('razorpay', { mode: 'test', keyId: 'rzp_test_x', keySecret: 'secret' });
    expect(client.put).toHaveBeenCalledWith('/integrations/payment-gateways/razorpay', { mode: 'test', keyId: 'rzp_test_x', keySecret: 'secret' });
    vi.mocked(client.post).mockResolvedValue({ data: { ok: true, message: 'Connected' } });
    await integrationsApi.testPaymentGateway('stripe');
    expect(client.post).toHaveBeenCalledWith('/integrations/payment-gateways/stripe/test');
    vi.mocked(client.delete).mockResolvedValue({ data: { deleted: true } });
    await integrationsApi.removePaymentGateway('stripe');
    expect(client.delete).toHaveBeenCalledWith('/integrations/payment-gateways/stripe');
  });
});
