import { client, type ApiResponse } from './client';
import { API_ENDPOINTS } from './config';
import { settingsApi } from './settings';

/**
 * First-run setup of a new agency (R113). The wizard saves through the ordinary settings endpoints;
 * `onboarding_completed` is a flat settings row seeded as 'false' by the provisioner. Agencies created
 * before that row existed have no value and are never sent to the wizard.
 */

type RawSettings = Record<string, string | null>;

export const ONBOARDING_KEY = 'onboarding_completed';

export function isOnboardingPending(raw: RawSettings | null | undefined): boolean {
  return raw?.[ONBOARDING_KEY] === 'false';
}

/** The stored value for an uploaded logo: the app-relative file path the company page already renders. */
export function logoSettingValue(fileKey: string): string {
  return `/files/${fileKey.split('/').map(encodeURIComponent).join('/')}`;
}

export const onboardingApi = {
  /** All settings rows exactly as stored (company keys, tax_system, onboarding_completed, ...). */
  getRaw: async (): Promise<RawSettings> => {
    const res = await client.get<ApiResponse<RawSettings>>(API_ENDPOINTS.settings.company);
    return res?.data ?? {};
  },

  /** Writes raw settings rows (admin only). */
  save: (values: Record<string, string>) =>
    client.put<ApiResponse<{ message: string }>>(API_ENDPOINTS.settings.company, values),

  /** Uploads the logo through the generic file endpoint and returns the value to store in company_logo. */
  uploadLogo: async (file: File): Promise<string> => {
    const form = new FormData();
    form.append('file', file);
    const res = await client.post<ApiResponse<{ key: string }>>(API_ENDPOINTS.files.upload, form);
    const key = res?.data?.key;
    if (!key) throw new Error('Upload failed');
    return logoSettingValue(key);
  },

  /** Changes only the invoice prefix, keeping every other numbering rule as it is. */
  setInvoicePrefix: async (prefix: string) => {
    const current = await settingsApi.numberingConfig.get();
    if (!current || !('data' in current)) return;
    return settingsApi.numberingConfig.update({ ...current.data, invoicePrefix: prefix });
  },

  getInvoicePrefix: async (): Promise<string> => {
    const current = await settingsApi.numberingConfig.get();
    return current && 'data' in current ? current.data.invoicePrefix : 'INV';
  },

  complete: () =>
    client.put<ApiResponse<{ message: string }>>(API_ENDPOINTS.settings.company, { [ONBOARDING_KEY]: 'true' }),
};
