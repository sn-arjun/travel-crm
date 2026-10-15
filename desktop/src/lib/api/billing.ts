import { client, type ApiResponse } from './client';

// Subscription billing (R205). The backend picks the payment gateway from the agency's country;
// the desktop only ever sees a checkout URL to open.

export type SubscriptionStatus = 'none' | 'trial' | 'active' | 'past_due' | 'expired' | 'cancelled';

export interface BillingPlan {
  key: string;
  name: string;
  description: string | null;
  available: boolean;
  currency: string | null;
  yearlyPrice: number | null;
  includedUsers: number | null;
  extraUserYearlyPrice: number | null;
}

export interface BillingOverview {
  /** False when the payment gateway has no credentials on the server: show a plain message instead of buttons. */
  configured: boolean;
  gateway: 'razorpay' | 'stripe' | 'mock';
  market: string;
  currency: string | null;
  tenantStatus: string;
  /** The subscription lapsed: the workspace can be read but not changed until it is paid. */
  readOnly: boolean;
  subscription: {
    status: SubscriptionStatus;
    planKey: string;
    planName: string;
    amount: number;
    currentPeriodEnd: string | null;
    trialEndsAt: string | null;
    pastDueSince: string | null;
    graceEndsAt: string | null;
    graceDays: number;
    cancelAtPeriodEnd: boolean;
    cancelledAt: string | null;
    extraUsers: number;
  };
  seats: { limit: number; used: number; available: number; included: number | null };
  plans: BillingPlan[];
}

export interface BillingQuote {
  planKey: string;
  planName: string;
  currency: string;
  extraUsers: number;
  includedUsers: number;
  subtotal: number;
  taxLines: Array<{ code: string; label: string; rate: number; amount: number }>;
  taxTotal: number;
  total: number;
}

export interface BillingCheckout {
  url: string;
  gateway: string;
  reference: string;
  currency: string;
  subtotal: number;
  taxTotal: number;
  total: number;
  display: string;
}

export interface PlatformInvoice {
  id: string;
  number: string;
  period: string | null;
  currency: string;
  subtotal: number;
  total: number;
  status: string;
  issuedAt: string;
}

export const billingApi = {
  overview: () => client.get<ApiResponse<BillingOverview>>('/billing/subscription'),
  quote: (planKey: string, extraUsers: number) =>
    client.get<ApiResponse<BillingQuote>>('/billing/quote', { params: { planKey, extraUsers } }),
  checkout: (planKey: string, extraUsers: number) =>
    client.post<ApiResponse<BillingCheckout>>('/billing/checkout', { planKey, extraUsers }),
  cancel: () => client.post<ApiResponse<{ cancelAtPeriodEnd: boolean; currentPeriodEnd: string | null }>>('/billing/cancel'),
  invoices: () => client.get<ApiResponse<{ invoices: PlatformInvoice[] }>>('/billing/invoices'),
  downloadInvoice: (id: string) => client.get<Blob>(`/billing/invoices/${id}/download`, { responseType: 'blob' }),
};

/**
 * Open a checkout URL where the agency can pay: in Electron the main process routes window.open to the system
 * browser (shell.openExternal); on the web it opens a new tab.
 */
export function openCheckout(url: string): void {
  if (typeof window === 'undefined') return;
  window.open(url, '_blank', 'noopener,noreferrer');
}
