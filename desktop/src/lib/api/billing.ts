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
  /** What the invoice is for when it is not the subscription (an add-on purchase). */
  description?: string | null;
  currency: string;
  subtotal: number;
  total: number;
  status: string;
  issuedAt: string;
}

// Add-ons (R206): extra users, AI credit packs and communication packs bought online.

export type AddonKind = 'extra_user' | 'ai_credit_pack' | 'comm_pack';

export interface AddonOffer {
  key: string;
  name: string;
  kind: AddonKind;
  /** sms, whatsapp, otp, call_minute for communication packs. */
  channel: string | null;
  unitsPerPack: number;
  available: boolean;
  /** Why it cannot be bought (PRICE_NOT_CONFIGURED, NO_ACTIVE_SUBSCRIPTION, ...). */
  reason: string | null;
  currency: string | null;
  /** One pack, or one extra user for the rest of the paid year; before tax. */
  unitPrice: number | null;
  yearlyPrice: number | null;
  prorated: number | null;
  expiresAt: string | null;
}

export interface AddonsOverview {
  /** False when the payment gateway has no credentials on the server: fall back to Request top-up. */
  configured: boolean;
  gateway: 'razorpay' | 'stripe' | 'mock';
  market: string;
  products: AddonOffer[];
  purchasedUsers: { quantity: number; endsAt: string | null };
}

export interface AddonQuote {
  productKey: string;
  name: string;
  kind: AddonKind;
  quantity: number;
  unitsGranted: number;
  currency: string;
  unitPrice: number;
  subtotal: number;
  taxLines: Array<{ code: string; label: string; rate: number; amount: number }>;
  taxTotal: number;
  total: number;
  description: string;
  prorated: number | null;
  expiresAt: string | null;
}

export interface AddonOrder {
  id: string;
  productKey: string;
  description: string | null;
  quantity: number;
  unitsGranted: number;
  currency: string;
  unitPrice: number;
  subtotal: number;
  taxTotal: number;
  total: number;
  status: 'pending' | 'paid' | 'failed';
  gateway: string;
  invoiceId: string | null;
  createdAt: string;
  paidAt: string | null;
}

export interface AddonCheckout {
  url: string | null;
  gateway: string;
  replay: boolean;
  order: AddonOrder;
  display: string;
}

export const billingApi = {
  overview: () => client.get<ApiResponse<BillingOverview>>('/billing/subscription'),
  quote: (planKey: string, extraUsers: number) =>
    client.get<ApiResponse<BillingQuote>>('/billing/quote', { params: { planKey, extraUsers } }),
  checkout: (planKey: string, extraUsers: number) =>
    client.post<ApiResponse<BillingCheckout>>('/billing/checkout', { planKey, extraUsers }),
  addons: () => client.get<ApiResponse<AddonsOverview>>('/billing/addons'),
  addonQuote: (productKey: string, quantity: number) =>
    client.get<ApiResponse<AddonQuote>>('/billing/addons/quote', { params: { productKey, quantity } }),
  addonCheckout: (productKey: string, quantity: number, idempotencyKey?: string) =>
    client.post<ApiResponse<AddonCheckout>>('/billing/addons/checkout', { productKey, quantity, idempotencyKey }),
  addonOrders: () => client.get<ApiResponse<{ orders: AddonOrder[] }>>('/billing/addons/orders'),
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
