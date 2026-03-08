export const APP_NAME = 'TravelCRM Admin';

export const PLANS = ['free', 'starter', 'pro', 'enterprise'] as const;
export type Plan = typeof PLANS[number];

export const PLAN_LIMITS: Record<Plan, { maxUsers: number; price: number }> = {
  free: { maxUsers: 2, price: 0 },
  starter: { maxUsers: 5, price: 999 },
  pro: { maxUsers: 15, price: 2499 },
  enterprise: { maxUsers: 50, price: 4999 },
};

export const TENANT_STATUSES = ['active', 'suspended', 'trial', 'cancelled'] as const;

export const TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;
export const TICKET_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
