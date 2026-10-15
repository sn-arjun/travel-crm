import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import * as React from 'react';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const listPaymentGateways = vi.fn();
const savePaymentGateway = vi.fn();
const testPaymentGateway = vi.fn();
vi.mock('@/lib/api/integrations', () => ({
  integrationsApi: {
    listPaymentGateways: (...a: unknown[]) => listPaymentGateways(...a),
    savePaymentGateway: (...a: unknown[]) => savePaymentGateway(...a),
    testPaymentGateway: (...a: unknown[]) => testPaymentGateway(...a),
    removePaymentGateway: vi.fn(),
  },
}));

import { PaymentGateways } from './_payment-gateways';

const razorpay = {
  gateway: 'razorpay', mode: 'test', isActive: true, keyConfigured: true, keyIdLast4: 'ey01', secretLast4: 'ests',
  webhookSecretConfigured: true, lastTestedAt: null,
  webhookUrl: 'https://api.example.test/api/v1/webhooks/payments/pw_abc/razorpay',
};

describe('PaymentGateways settings', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows a connected gateway as configured with the last 4 characters, never the secret', async () => {
    listPaymentGateways.mockResolvedValue({ data: { accounts: [razorpay] } });
    const { container } = render(<PaymentGateways />);
    expect(await screen.findByText(/Configured ····ests/)).toBeTruthy();
    expect(screen.getByText('…ey01')).toBeTruthy();
    // no input holds a saved secret, and the webhook URL to paste into Razorpay is shown
    const values = Array.from(container.querySelectorAll('input')).map((i) => (i as HTMLInputElement).value);
    expect(values).toContain(razorpay.webhookUrl);
    expect(values.filter((v) => /secret|rzp_/i.test(v))).toEqual([]);
    expect(screen.getByRole('button', { name: 'Copy Razorpay payment webhook URL' })).toBeTruthy();
  });

  it('connects Stripe with the pasted keys and clears them from the form', async () => {
    listPaymentGateways.mockResolvedValue({ data: { accounts: [] } });
    savePaymentGateway.mockResolvedValue({ data: {} });
    render(<PaymentGateways />);
    const secret = (await screen.findAllByLabelText('Secret key'))[0] as HTMLInputElement;
    expect(secret.type).toBe('password');
    fireEvent.change(secret, { target: { value: 'sk_test_agency_secret' } });
    fireEvent.change(screen.getAllByLabelText('Webhook secret')[1]!, { target: { value: 'whsec_agency' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect Stripe' }));
    await waitFor(() => expect(savePaymentGateway).toHaveBeenCalledWith('stripe', { mode: 'test', keyId: undefined, keySecret: 'sk_test_agency_secret', webhookSecret: 'whsec_agency' }));
  });

  it('reports the result of Test connection', async () => {
    listPaymentGateways.mockResolvedValue({ data: { accounts: [razorpay] } });
    testPaymentGateway.mockResolvedValue({ data: { ok: false, message: 'The gateway rejected these keys' } });
    render(<PaymentGateways />);
    fireEvent.click(await screen.findByRole('button', { name: 'Test connection' }));
    expect(await screen.findByText('The gateway rejected these keys')).toBeTruthy();
  });
});
