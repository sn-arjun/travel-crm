import { describe, it, expect, vi, beforeEach } from 'vitest';

const post = vi.fn();
const put = vi.fn();
const get = vi.fn();
vi.mock('./client', () => ({ client: { post: (...a: unknown[]) => post(...a), put: (...a: unknown[]) => put(...a), get: (...a: unknown[]) => get(...a) } }));
vi.mock('./config', () => ({ API_ENDPOINTS: { settings: { company: '/settings/company' }, files: { upload: '/files/upload' } } }));
const numbering = { get: vi.fn(), update: vi.fn() };
vi.mock('./settings', () => ({ settingsApi: { numberingConfig: numbering } }));

const { onboardingApi, isOnboardingPending, logoSettingValue } = await import('./onboarding');

describe('onboarding api', () => {
  beforeEach(() => {
    post.mockReset();
    put.mockReset();
    get.mockReset();
    numbering.get.mockReset();
    numbering.update.mockReset();
  });

  it('only an explicit onboarding_completed=false sends an agency to the wizard', () => {
    expect(isOnboardingPending({ onboarding_completed: 'false' })).toBe(true);
    expect(isOnboardingPending({ onboarding_completed: 'true' })).toBe(false);
    expect(isOnboardingPending({})).toBe(false);
    expect(isOnboardingPending(null)).toBe(false);
  });

  it('stores an uploaded logo as the app-relative file path with each key segment encoded', () => {
    expect(logoSettingValue('tenant-1/abc-my logo.png')).toBe('/files/tenant-1/abc-my%20logo.png');
  });

  it('uploads the logo through /files/upload and returns the value for company_logo', async () => {
    post.mockResolvedValue({ data: { key: 't1/id-logo.png' } });
    const file = new File(['x'], 'logo.png', { type: 'image/png' });
    const value = await onboardingApi.uploadLogo(file);
    expect(post.mock.calls[0]![0]).toBe('/files/upload');
    expect((post.mock.calls[0]![1] as FormData).get('file')).toBeInstanceOf(File);
    expect(value).toBe('/files/t1/id-logo.png');
  });

  it('completing sets onboarding_completed to true through the company settings endpoint', async () => {
    put.mockResolvedValue({});
    await onboardingApi.complete();
    expect(put).toHaveBeenCalledWith('/settings/company', { onboarding_completed: 'true' });
  });

  it('changing the invoice prefix keeps the other numbering rules', async () => {
    numbering.get.mockResolvedValue({ data: { invoicePrefix: 'INV', receiptPrefix: 'RCP', fyStartMonth: 4, resetYearly: true } });
    await onboardingApi.setInvoicePrefix('TRV');
    expect(numbering.update).toHaveBeenCalledWith({ invoicePrefix: 'TRV', receiptPrefix: 'RCP', fyStartMonth: 4, resetYearly: true });
  });
});
