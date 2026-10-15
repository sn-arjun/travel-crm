import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import * as React from 'react';

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a), message: vi.fn() } }));

const state = { user: { role: 'admin' as string } };
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: Object.assign((selector: (s: typeof state) => unknown) => selector(state), { getState: () => state }),
}));

const api = { addons: vi.fn(), addonQuote: vi.fn(), addonCheckout: vi.fn() };
const openCheckout = vi.fn();
vi.mock('@/lib/api/billing', () => ({ billingApi: api, openCheckout: (...a: unknown[]) => openCheckout(...a) }));

const requestUpgrade = vi.fn();
const usageGet = vi.fn();
vi.mock('@/lib/api/settings', () => ({ usageApi: { get: (...a: unknown[]) => usageGet(...a), requestUpgrade: (...a: unknown[]) => requestUpgrade(...a) } }));

import { BuyMoreDialog } from './buy-more-dialog';
import { UsageLimits } from './usage-limits';
import { AllowanceExhaustedDialog } from './allowance-exhausted-dialog';
import { toLimitInfo } from '@/lib/api/limit-events';

const offer = (over: Record<string, unknown>) => ({
  unitsPerPack: 100, available: true, reason: null, currency: 'INR', yearlyPrice: null, prorated: null, expiresAt: null, channel: null, ...over,
});
const overview = (configured = true) => ({
  data: {
    configured, gateway: 'razorpay', market: 'IN', purchasedUsers: { quantity: 0, endsAt: null },
    products: [
      offer({ key: 'sms_100', name: '100 SMS', kind: 'comm_pack', channel: 'sms', unitPrice: 967.2 }),
      offer({ key: 'whatsapp_1000', name: '1,000 WhatsApp messages', kind: 'comm_pack', channel: 'whatsapp', unitPrice: 714 }),
      offer({ key: 'ai_credit_pack_5000', name: '5,000 AI credits', kind: 'ai_credit_pack', unitPrice: 250 }),
      offer({ key: 'extra_user', name: 'Extra user (per year)', kind: 'extra_user', unitPrice: 900, yearlyPrice: 1800 }),
    ],
  },
});
const quote = { data: { productKey: 'sms_100', name: '100 SMS', kind: 'comm_pack', quantity: 1, unitsGranted: 100, currency: 'INR', unitPrice: 967.2, subtotal: 967.2, taxLines: [{ code: 'gst', label: 'GST', rate: 18, amount: 174.1 }], taxTotal: 174.1, total: 1141.3, description: '100 SMS x 1', prorated: null, expiresAt: null } };

const usage = {
  data: {
    periodKey: '2026-10', periodEnd: '2026-11-01', plan: 'pro',
    lines: [
      { key: 'sms', channel: 'sms', label: 'SMS', used: 15, allowance: 15, percent: 100, exhausted: true, state: 'exhausted', periodEnd: '2026-11-01', addons: [], upgradeTo: null },
    ],
  },
};

beforeEach(() => {
  for (const fn of [...Object.values(api), openCheckout, requestUpgrade, usageGet, toastSuccess, toastError]) fn.mockReset();
  state.user = { role: 'admin' };
});

describe('BuyMoreDialog', () => {
  it('shows only the packs for the channel that ran out, prices them with tax, and sends the agency to the payment page', async () => {
    api.addons.mockResolvedValue(overview());
    api.addonQuote.mockResolvedValue(quote);
    api.addonCheckout.mockResolvedValue({ data: { url: 'https://rzp.io/i/x', gateway: 'razorpay', replay: false, order: { id: 'o1' }, display: '' } });
    const onClose = vi.fn();
    render(<BuyMoreDialog open focus={{ channel: 'sms' }} onClose={onClose} />);

    await waitFor(() => expect(screen.getByTestId('buy-more-sms_100')).toBeTruthy());
    expect(screen.queryByTestId('buy-more-whatsapp_1000')).toBeNull();
    expect(screen.queryByTestId('buy-more-extra_user')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('buy-more-quote')).toBeTruthy());
    expect(api.addonQuote).toHaveBeenCalledWith('sms_100', 1);

    fireEvent.change(screen.getByTestId('buy-more-quantity'), { target: { value: '3' } });
    await waitFor(() => expect(api.addonQuote).toHaveBeenCalledWith('sms_100', 3));
    await waitFor(() => expect((screen.getByTestId('buy-more-pay') as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId('buy-more-pay'));
    await waitFor(() => expect(openCheckout).toHaveBeenCalledWith('https://rzp.io/i/x'));
    expect(api.addonCheckout).toHaveBeenCalledWith('sms_100', 3, expect.any(String));
    expect(onClose).toHaveBeenCalled();
  });

  it('offers extra users for a seat limit and AI credits for the AI channel', async () => {
    api.addons.mockResolvedValue(overview());
    api.addonQuote.mockResolvedValue(quote);
    const { unmount } = render(<BuyMoreDialog open focus={{ users: true }} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('buy-more-extra_user')).toBeTruthy());
    expect(screen.queryByTestId('buy-more-sms_100')).toBeNull();
    unmount();
    render(<BuyMoreDialog open focus={{ channel: 'ai' }} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('buy-more-ai_credit_pack_5000')).toBeTruthy());
  });

  it('says so, with no pay button, when the payment gateway is not set up', async () => {
    api.addons.mockResolvedValue(overview(false));
    render(<BuyMoreDialog open onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('buy-more-not-configured')).toBeTruthy());
    expect(screen.queryByTestId('buy-more-pay')).toBeNull();
  });
});

describe('Buy more entry points', () => {
  it('usage rows offer Buy more to an administrator when online payment is set up', async () => {
    usageGet.mockResolvedValue(usage);
    api.addons.mockResolvedValue(overview());
    api.addonQuote.mockResolvedValue(quote);
    render(<UsageLimits />);
    await waitFor(() => expect(screen.getByTestId('buy-more-sms')).toBeTruthy());
    expect(screen.queryByText('Request top-up')).toBeNull();
    fireEvent.click(screen.getByTestId('buy-more-sms'));
    await waitFor(() => expect(screen.getByTestId('buy-more-dialog')).toBeTruthy());
  });

  it('falls back to Request top-up when billing is not configured or the user is not an administrator', async () => {
    usageGet.mockResolvedValue(usage);
    api.addons.mockResolvedValue(overview(false));
    const { unmount } = render(<UsageLimits />);
    await waitFor(() => expect(screen.getByTestId('usage-row-sms')).toBeTruthy());
    expect(screen.getByText('Request top-up')).toBeTruthy();
    expect(screen.queryByTestId('buy-more-sms')).toBeNull();
    unmount();

    state.user = { role: 'agent' };
    api.addons.mockClear();
    render(<UsageLimits />);
    await waitFor(() => expect(screen.getByText('Request top-up')).toBeTruthy());
    expect(api.addons).not.toHaveBeenCalled();
  });

  it('the limit-reached dialog offers Buy more next to the upgrade, and an extra-users purchase for a seat limit', async () => {
    api.addons.mockResolvedValue(overview());
    api.addonQuote.mockResolvedValue(quote);
    const seat = toLimitInfo({ code: 'SEAT_LIMIT', message: 'All 5 users are in use.', limit: 5, used: 5, options: ['upgrade', 'extra_users'], addons: [] });
    render(<AllowanceExhaustedDialog limit={seat} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('allowance-buy-more')).toBeTruthy());
    expect(screen.getByText('Request upgrade')).toBeTruthy();
    expect(screen.queryByText('Request extra users')).toBeNull();
    fireEvent.click(screen.getByTestId('allowance-buy-more'));
    await waitFor(() => expect(screen.getByTestId('buy-more-extra_user')).toBeTruthy());
  });
});
