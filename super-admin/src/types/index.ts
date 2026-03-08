// ── Super Admin Types ──────────────────────────────────────────

export interface Tenant {
  id: string;
  companyName: string;
  subdomain: string;
  plan: 'free' | 'starter' | 'pro' | 'enterprise';
  status: 'active' | 'suspended' | 'trial' | 'cancelled';
  contactEmail: string;
  contactPhone?: string;
  maxUsers: number;
  createdAt: string;
  updatedAt: string;
}

export interface Subscription {
  id: string;
  tenantId: string;
  plan: string;
  status: 'active' | 'past_due' | 'cancelled' | 'trialing';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  amount: number;
  currency: string;
  paymentGateway: 'razorpay' | 'stripe';
  gatewaySubscriptionId?: string;
  createdAt: string;
}

export interface WordPressSite {
  id: string;
  tenantId: string;
  subdomain: string;
  domain?: string;
  status: 'provisioning' | 'active' | 'suspended' | 'error';
  wpVersion?: string;
  containerHost?: string;
  sslEnabled: boolean;
  createdAt: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  type: 'info' | 'warning' | 'maintenance' | 'feature';
  isActive: boolean;
  publishedAt?: string;
  expiresAt?: string;
  createdBy: string;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  tenantId: string;
  tenantName?: string;
  subject: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogEntry {
  id: string;
  adminId: string;
  adminEmail: string;
  action: string;
  entityType: string;
  entityId?: string;
  details?: string;
  ipAddress?: string;
  createdAt: string;
}

export interface SystemHealthMetric {
  name: string;
  value: number;
  unit: string;
  status: 'healthy' | 'warning' | 'critical';
  threshold?: number;
}

export interface DashboardStats {
  totalTenants: number;
  activeTenants: number;
  trialTenants: number;
  mrr: number;
  newThisMonth: number;
  churnedThisMonth: number;
  growthRate: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: 'super_admin' | 'support' | 'viewer';
  isActive?: boolean;
  lastLoginAt?: string;
  createdAt?: string;
}

export interface LoginLog {
  id: string;
  adminId: string | null;
  ipAddress: string;
  userAgent: string;
  success: boolean;
  createdAt: string;
}
