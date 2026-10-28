import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import * as React from 'react';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const { api, setTokens, setTwoFactorSetupRequired, state } = vi.hoisted(() => {
  const setTokens = vi.fn();
  const setTwoFactorSetupRequired = vi.fn();
  return {
    api: {
      twoFactorStatus: vi.fn(),
      twoFactorSetup: vi.fn(),
      twoFactorEnable: vi.fn(),
      twoFactorDisable: vi.fn(),
      twoFactorRecoveryCodes: vi.fn(),
      setTwoFactorPolicy: vi.fn(),
    },
    setTokens,
    setTwoFactorSetupRequired,
    state: { user: { email: 'a@b.test', role: 'salesperson' }, refreshToken: 'r', setTokens, setTwoFactorSetupRequired },
  };
});
vi.mock('@/lib/api/auth', () => ({ authApi: api }));
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: Object.assign((selector: (s: typeof state) => unknown) => selector(state), { getState: () => state }),
}));

import { TwoFactorCard, recoveryCodesFile } from './two-factor-card';

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  setTokens.mockReset();
  setTwoFactorSetupRequired.mockReset();
  state.user = { email: 'a@b.test', role: 'salesperson' };
});

describe('TwoFactorCard', () => {
  it('walks through setup: password, QR code and key, code, then recovery codes that must be acknowledged', async () => {
    api.twoFactorStatus.mockResolvedValueOnce({ data: { enabled: false, recoveryCodesRemaining: 0, required: false } });
    api.twoFactorStatus.mockResolvedValue({ data: { enabled: true, recoveryCodesRemaining: 2, required: false } });
    api.twoFactorSetup.mockResolvedValue({
      data: { secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', otpauthUri: 'otpauth://totp/TravelCRM%20Pro:a%40b.test?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=TravelCRM%20Pro', issuer: 'TravelCRM Pro', account: 'a@b.test' },
    });
    api.twoFactorEnable.mockResolvedValue({ data: { enabled: true, recoveryCodes: ['AAAAA-BBBBB', 'CCCCC-DDDDD'], accessToken: 'fresh' } });

    render(<TwoFactorCard />);
    fireEvent.click(await screen.findByTestId('two-factor-start'));

    fireEvent.change(screen.getByLabelText('Confirm with your password'), { target: { value: 'Voyage2026ok!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByTestId('two-factor-secret')).toHaveProperty('textContent', 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP');
    expect(api.twoFactorSetup).toHaveBeenCalledWith({ password: 'Voyage2026ok!' });
    expect(screen.getByTestId('qr-code')).toBeTruthy();

    // A code that is not 6 digits cannot be submitted.
    const confirm = screen.getByTestId('two-factor-confirm') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Code from the app'), { target: { value: '12ab34567' } });
    expect((screen.getByLabelText('Code from the app') as HTMLInputElement).value).toBe('123456');
    fireEvent.click(confirm);

    await waitFor(() => expect(api.twoFactorEnable).toHaveBeenCalledWith({ code: '123456' }));
    expect(await screen.findByTestId('two-factor-recovery-codes')).toBeTruthy();
    expect(screen.getByText('AAAAA-BBBBB')).toBeTruthy();
    expect(setTokens).toHaveBeenCalledWith('fresh', 'r');
    expect(setTwoFactorSetupRequired).toHaveBeenCalledWith(false);

    const done = screen.getByTestId('two-factor-done') as HTMLButtonElement;
    expect(done.disabled).toBe(true);
    fireEvent.click(screen.getByTestId('two-factor-saved'));
    expect(done.disabled).toBe(false);
    fireEvent.click(done);
    expect(screen.queryByTestId('two-factor-recovery-codes')).toBeNull();
    expect(await screen.findByText(/2 recovery codes are left/)).toBeTruthy();
  });

  it('shows the error from a wrong password and does not reveal a secret', async () => {
    api.twoFactorStatus.mockResolvedValue({ data: { enabled: false, recoveryCodesRemaining: 0, required: false } });
    api.twoFactorSetup.mockRejectedValue({ status: 401, message: 'Password is incorrect' });
    render(<TwoFactorCard />);
    fireEvent.click(await screen.findByTestId('two-factor-start'));
    fireEvent.change(screen.getByLabelText('Confirm with your password'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Password is incorrect')).toBeTruthy();
    expect(screen.queryByTestId('two-factor-secret')).toBeNull();
  });

  it('cannot be turned off when the agency requires it, and only admins see the requirement switch', async () => {
    api.twoFactorStatus.mockResolvedValue({ data: { enabled: true, recoveryCodesRemaining: 9, required: true } });
    const { unmount } = render(<TwoFactorCard />);
    const off = (await screen.findByTestId('two-factor-disable-start')) as HTMLButtonElement;
    expect(off.disabled).toBe(true);
    expect(screen.queryByLabelText('Require for everyone')).toBeNull();
    unmount();

    state.user = { email: 'a@b.test', role: 'admin' };
    render(<TwoFactorCard />);
    expect(await screen.findByLabelText('Require for everyone')).toBeTruthy();
  });
});

describe('recoveryCodesFile', () => {
  it('lists the account and every code', () => {
    const text = recoveryCodesFile(['AAAAA-BBBBB', 'CCCCC-DDDDD'], 'a@b.test');
    expect(text).toContain('Account: a@b.test');
    expect(text).toContain('AAAAA-BBBBB\nCCCCC-DDDDD');
  });
});
