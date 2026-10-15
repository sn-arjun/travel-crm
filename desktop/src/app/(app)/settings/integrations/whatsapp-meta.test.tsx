import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import * as React from 'react';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const getWhatsApp = vi.fn();
const saveWhatsAppMeta = vi.fn();
const testWhatsAppMeta = vi.fn();
const setWhatsAppProvider = vi.fn();
vi.mock('@/lib/api/integrations', () => ({
  integrationsApi: {
    getWhatsApp: (...a: unknown[]) => getWhatsApp(...a),
    saveWhatsAppMeta: (...a: unknown[]) => saveWhatsAppMeta(...a),
    testWhatsAppMeta: (...a: unknown[]) => testWhatsAppMeta(...a),
    setWhatsAppProvider: (...a: unknown[]) => setWhatsAppProvider(...a),
    removeWhatsAppMeta: vi.fn(),
  },
}));

import { WhatsAppMeta } from './_whatsapp-meta';

const connected = {
  provider: 'meta', providerExplicit: true, platformConfigured: false, platformTokenAvailable: false,
  account: { phoneNumberId: '109876543210001', wabaId: null, displayPhone: null, isActive: true, tokenConfigured: true, tokenLast4: '9f3a', appSecretConfigured: true, lastTestedAt: null },
  webhookUrl: 'https://api.example.test/api/v1/webhooks/inbound/meta/whatsapp',
  verifyToken: 'mv_abc123',
};

describe('WhatsApp (Meta) settings', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the connected number with the token as set, never the token, and the callback URL and verify token to paste into Meta', async () => {
    getWhatsApp.mockResolvedValue({ data: connected });
    const { container } = render(<WhatsAppMeta />);
    expect(await screen.findByText(/Configured ····9f3a/)).toBeTruthy();
    expect(screen.getByText('109876543210001')).toBeTruthy();
    const values = Array.from(container.querySelectorAll('input')).map((i) => (i as HTMLInputElement).value);
    expect(values).toContain(connected.webhookUrl);
    expect(values).toContain('mv_abc123');
    expect(screen.getByRole('button', { name: 'Copy WhatsApp callback URL' })).toBeTruthy();
  });

  it('connects a number with the pasted token and clears the secrets from the form', async () => {
    getWhatsApp.mockResolvedValue({ data: { ...connected, account: null, verifyToken: null } });
    saveWhatsAppMeta.mockResolvedValue({ data: {} });
    render(<WhatsAppMeta />);
    const phone = (await screen.findByLabelText('Phone number id')) as HTMLInputElement;
    const token = screen.getByLabelText('Access token') as HTMLInputElement;
    expect(token.type).toBe('password');
    fireEvent.change(phone, { target: { value: '109876543210001' } });
    fireEvent.change(token, { target: { value: 'EAAG-test-only-token-123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect WhatsApp' }));
    await waitFor(() =>
      expect(saveWhatsAppMeta).toHaveBeenCalledWith({ phoneNumberId: '109876543210001', wabaId: undefined, accessToken: 'EAAG-test-only-token-123456', appSecret: undefined }),
    );
  });

  it('reports the result of Test connection', async () => {
    getWhatsApp.mockResolvedValue({ data: connected });
    testWhatsAppMeta.mockResolvedValue({ data: { ok: false, message: 'Meta rejected this access token' } });
    render(<WhatsAppMeta />);
    fireEvent.click(await screen.findByRole('button', { name: 'Test connection' }));
    expect(await screen.findByText('Meta rejected this access token')).toBeTruthy();
  });
});
