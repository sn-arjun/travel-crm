import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import * as React from 'react';

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a) } }));

const get = vi.fn();
const requestUpgrade = vi.fn();
vi.mock('@/lib/api/settings', () => ({ usageApi: { get: (...a: unknown[]) => get(...a), requestUpgrade: (...a: unknown[]) => requestUpgrade(...a) } }));

import { UsageLimits } from './usage-limits';
import { AllowanceExhaustedDialog, LimitReachedHost } from './allowance-exhausted-dialog';
import { emitLimitReached, toLimitInfo, isLimitBody } from '@/lib/api/limit-events';

const pack = { key: 'sms_100', name: '100 SMS', units: 100, price: 968, currency: 'INR' };
const overview = {
  periodKey: '2026-10',
  periodEnd: '2026-11-01',
  plan: 'pro',
  lines: [
    { key: 'ai_credits', channel: 'ai', label: 'AI credits', used: 100, allowance: 1000, percent: 10, exhausted: false, state: 'ok', periodEnd: '2026-11-01', addons: [], upgradeTo: null },
    { key: 'sms', channel: 'sms', label: 'SMS', used: 12, allowance: 15, percent: 80, exhausted: false, state: 'warning', periodEnd: '2026-11-01', addons: [pack], upgradeTo: null },
    { key: 'whatsapp', channel: 'whatsapp', label: 'WhatsApp messages', used: 400, allowance: 400, percent: 100, exhausted: true, state: 'exhausted', periodEnd: '2026-11-01', addons: [], upgradeTo: { key: 'enterprise', name: 'Enterprise', allowance: 600 } },
  ],
};

beforeEach(() => {
  get.mockReset();
  requestUpgrade.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
});

describe('UsageLimits', () => {
  it('shows every channel with its progress and the 80% and 100% states', async () => {
    get.mockResolvedValue({ data: overview });
    render(<UsageLimits />);
    await waitFor(() => expect(screen.getByTestId('usage-row-sms')).toBeTruthy());

    expect(screen.getByTestId('usage-row-ai_credits').getAttribute('data-state')).toBe('ok');
    expect(screen.getByTestId('usage-row-sms').getAttribute('data-state')).toBe('warning');
    expect(screen.getByTestId('usage-row-whatsapp').getAttribute('data-state')).toBe('exhausted');
    expect(screen.getByText('12 / 15')).toBeTruthy();
    expect(screen.getAllByRole('progressbar')).toHaveLength(3);
    // no request buttons on a healthy channel; both on the others
    expect(screen.getAllByText('Request upgrade')).toHaveLength(2);
    expect(screen.getAllByText('Request top-up')).toHaveLength(2);
  });

  it('request top-up sends the channel to the platform', async () => {
    get.mockResolvedValue({ data: overview });
    requestUpgrade.mockResolvedValue({ data: { requested: true, delivered: true } });
    render(<UsageLimits />);
    await waitFor(() => expect(screen.getByTestId('usage-row-sms')).toBeTruthy());
    const row = screen.getByTestId('usage-row-sms');
    fireEvent.click(row.querySelectorAll('button')[0]!);
    await waitFor(() => expect(requestUpgrade).toHaveBeenCalledWith({ kind: 'top_up', channel: 'sms' }));
    expect(toastSuccess).toHaveBeenCalled();
  });

  it('says so when the usage cannot be loaded', async () => {
    get.mockRejectedValue({ status: 403, message: 'Forbidden' });
    render(<UsageLimits />);
    await waitFor(() => expect(screen.getByText(/could not be loaded/i)).toBeTruthy());
  });
});

describe('AllowanceExhaustedDialog', () => {
  const body = {
    success: false, code: 'ALLOWANCE_EXHAUSTED', message: 'Your plan includes 2 WhatsApp messages per month and all of them are used.',
    channel: 'whatsapp', used: 2, allowance: 2, options: ['upgrade', 'top_up'],
    upgradeTo: { key: 'enterprise', name: 'Enterprise', allowance: 600 },
    addons: [{ key: 'whatsapp_1000', name: '1,000 WhatsApp messages', units: 1000, price: 714, currency: 'INR' }],
  };

  it('shows the message, the packs with prices, and both ways on', () => {
    render(<AllowanceExhaustedDialog limit={toLimitInfo(body)} onClose={() => {}} />);
    expect(screen.getByText(/all of them are used/)).toBeTruthy();
    expect(screen.getByText('1,000 WhatsApp messages')).toBeTruthy();
    expect(screen.getByText('Request credits')).toBeTruthy();
    expect(screen.getByText('Request upgrade')).toBeTruthy();
  });

  it('the API client event opens it for ALLOWANCE_EXHAUSTED and SEAT_LIMIT, and requesting an upgrade is sent', async () => {
    requestUpgrade.mockResolvedValue({ data: { requested: true, delivered: true } });
    render(<LimitReachedHost />);
    expect(screen.queryByTestId('allowance-exhausted-dialog')).toBeNull();

    expect(isLimitBody(body)).toBe(true);
    expect(isLimitBody({ code: 'VALIDATION' })).toBe(false);
    React.act(() => emitLimitReached(body));
    await waitFor(() => expect(screen.getByTestId('allowance-exhausted-dialog')).toBeTruthy());
    fireEvent.click(screen.getByText('Request upgrade'));
    await waitFor(() => expect(requestUpgrade).toHaveBeenCalledWith({ kind: 'plan', channel: 'whatsapp', note: undefined }));

    React.act(() => emitLimitReached({ code: 'SEAT_LIMIT', message: 'Your plan includes 5 users and all of them are in use.', limit: 5, used: 5, options: ['upgrade', 'extra_users'] }));
    await waitFor(() => expect(screen.getByText('User limit reached')).toBeTruthy());
    expect(screen.getByText('Request extra users')).toBeTruthy();
  });
});
