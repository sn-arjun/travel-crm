import { API_VERSION } from '../constants/index';
import type {
  PaginatedResponse,
  ApiError,
  LoginRequest,
  LoginResponse,
  Contact,
  ContactCreateRequest,
  Lead,
  LeadCreateRequest,
  Invoice,
  DashboardKPIs,
  PipelineOverview,
  FollowUp,
  User,
  SortConfig,
  FilterConfig,
} from '../types/index';

// ─── API Client Configuration ──────────────────────────────
export interface ApiClientConfig {
  baseUrl: string;
  getAccessToken: () => string | null;
  getRefreshToken: () => string | null;
  onTokenRefreshed: (accessToken: string, refreshToken: string) => void;
  onAuthError: () => void;
}

// ─── API Client ────────────────────────────────────────────
export class ApiClient {
  private config: ApiClientConfig;
  private isRefreshing = false;
  private refreshQueue: Array<{
    resolve: (token: string) => void;
    reject: (error: Error) => void;
  }> = [];

  constructor(config: ApiClientConfig) {
    this.config = config;
  }

  private get baseUrl(): string {
    return `${this.config.baseUrl}/api/${API_VERSION}`;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const token = this.config.getAccessToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers as Record<string, string> ?? {}),
    };

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      const newToken = await this.refreshAccessToken();
      if (newToken) {
        headers['Authorization'] = `Bearer ${newToken}`;
        const retryResponse = await fetch(`${this.baseUrl}${path}`, {
          ...options,
          headers,
        });
        if (!retryResponse.ok) {
          const error = (await retryResponse.json()) as ApiError;
          throw error;
        }
        return retryResponse.json() as Promise<T>;
      }
      this.config.onAuthError();
      throw { error: 'Unauthorized', message: 'Session expired', statusCode: 401 } satisfies ApiError;
    }

    if (!response.ok) {
      const error = (await response.json()) as ApiError;
      throw error;
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  private async refreshAccessToken(): Promise<string | null> {
    if (this.isRefreshing) {
      return new Promise((resolve, reject) => {
        this.refreshQueue.push({ resolve, reject });
      });
    }

    this.isRefreshing = true;
    const refreshToken = this.config.getRefreshToken();

    if (!refreshToken) {
      this.isRefreshing = false;
      return null;
    }

    try {
      const response = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        this.refreshQueue.forEach(({ reject }) => reject(new Error('Refresh failed')));
        this.refreshQueue = [];
        return null;
      }

      const data = (await response.json()) as { accessToken: string; refreshToken: string };
      this.config.onTokenRefreshed(data.accessToken, data.refreshToken);

      this.refreshQueue.forEach(({ resolve }) => resolve(data.accessToken));
      this.refreshQueue = [];

      return data.accessToken;
    } finally {
      this.isRefreshing = false;
    }
  }

  // Helper to build query strings
  private buildQuery(params: Record<string, string | number | boolean | undefined>): string {
    const filtered = Object.entries(params).filter(([, v]) => v !== undefined);
    if (filtered.length === 0) return '';
    return '?' + new URLSearchParams(
      filtered.map(([k, v]) => [k, String(v)]),
    ).toString();
  }

  // ─── Auth ──────────────────────────────────────────────
  auth = {
    login: (data: LoginRequest) =>
      this.request<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    sendOtp: (phone: string, countryCode: string) =>
      this.request<{ message: string }>('/auth/send-otp', {
        method: 'POST',
        body: JSON.stringify({ phone, countryCode }),
      }),

    verifyOtp: (phone: string, countryCode: string, code: string) =>
      this.request<LoginResponse>('/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ phone, countryCode, code }),
      }),

    refresh: (refreshToken: string) =>
      this.request<{ accessToken: string; refreshToken: string }>('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      }),

    forgotPassword: (email: string) =>
      this.request<{ message: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),

    resetPassword: (token: string, password: string) =>
      this.request<{ message: string }>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      }),

    me: () => this.request<User>('/auth/me'),
  };

  // ─── Dashboard ─────────────────────────────────────────
  dashboard = {
    kpis: () => this.request<DashboardKPIs>('/dashboard/kpis'),
    pipeline: () => this.request<PipelineOverview>('/dashboard/pipeline'),
    recentActivity: (limit = 20) =>
      this.request<PaginatedResponse<unknown>>(`/activity-logs${this.buildQuery({ limit, page: 1 })}`),
  };

  // ─── Contacts ──────────────────────────────────────────
  contacts = {
    list: (params?: { page?: number; pageSize?: number; search?: string; type?: string; sort?: SortConfig; filters?: FilterConfig }) =>
      this.request<PaginatedResponse<Contact>>(
        `/contacts${this.buildQuery({
          page: params?.page,
          pageSize: params?.pageSize,
          search: params?.search,
          type: params?.type,
          sortBy: params?.sort?.field,
          sortDir: params?.sort?.direction,
          ...params?.filters,
        })}`,
      ),

    get: (id: string) => this.request<Contact>(`/contacts/${id}`),

    create: (data: ContactCreateRequest) =>
      this.request<Contact>('/contacts', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    update: (id: string, data: Partial<ContactCreateRequest>) =>
      this.request<Contact>(`/contacts/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    delete: (id: string) =>
      this.request<void>(`/contacts/${id}`, { method: 'DELETE' }),

    search: (query: string) =>
      this.request<Contact[]>(`/contacts/search${this.buildQuery({ q: query })}`),
  };

  // ─── Leads ─────────────────────────────────────────────
  leads = {
    list: (params?: { page?: number; pageSize?: number; search?: string; status?: string; priority?: string; assignedTo?: string; sort?: SortConfig; filters?: FilterConfig }) =>
      this.request<PaginatedResponse<Lead>>(
        `/leads${this.buildQuery({
          page: params?.page,
          pageSize: params?.pageSize,
          search: params?.search,
          status: params?.status,
          priority: params?.priority,
          assignedTo: params?.assignedTo,
          sortBy: params?.sort?.field,
          sortDir: params?.sort?.direction,
          ...params?.filters,
        })}`,
      ),

    get: (id: string) => this.request<Lead>(`/leads/${id}`),

    create: (data: LeadCreateRequest) =>
      this.request<Lead>('/leads', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    update: (id: string, data: Partial<LeadCreateRequest>) =>
      this.request<Lead>(`/leads/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    delete: (id: string) =>
      this.request<void>(`/leads/${id}`, { method: 'DELETE' }),

    pipeline: () =>
      this.request<PipelineOverview>('/leads/pipeline'),
  };

  // ─── Follow-ups ────────────────────────────────────────
  followUps = {
    list: (params?: { page?: number; pageSize?: number; leadId?: string; upcoming?: boolean }) =>
      this.request<PaginatedResponse<FollowUp>>(
        `/follow-ups${this.buildQuery({
          page: params?.page,
          pageSize: params?.pageSize,
          leadId: params?.leadId,
          upcoming: params?.upcoming,
        })}`,
      ),

    create: (data: { leadId: string; type: string; scheduledAt: string; notes?: string }) =>
      this.request<FollowUp>('/follow-ups', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    complete: (id: string, outcome?: string) =>
      this.request<FollowUp>(`/follow-ups/${id}/complete`, {
        method: 'POST',
        body: JSON.stringify({ outcome }),
      }),
  };

  // ─── Invoices ──────────────────────────────────────────
  invoices = {
    list: (params?: { page?: number; pageSize?: number; status?: string; sort?: SortConfig }) =>
      this.request<PaginatedResponse<Invoice>>(
        `/invoices${this.buildQuery({
          page: params?.page,
          pageSize: params?.pageSize,
          status: params?.status,
          sortBy: params?.sort?.field,
          sortDir: params?.sort?.direction,
        })}`,
      ),

    get: (id: string) => this.request<Invoice>(`/invoices/${id}`),

    create: (data: Record<string, unknown>) =>
      this.request<Invoice>('/invoices', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    update: (id: string, data: Record<string, unknown>) =>
      this.request<Invoice>(`/invoices/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
  };

  // ─── Users ─────────────────────────────────────────────
  users = {
    list: () => this.request<User[]>('/users'),
    get: (id: string) => this.request<User>(`/users/${id}`),
  };
}

// ─── Factory ───────────────────────────────────────────────
export function createApiClient(config: ApiClientConfig): ApiClient {
  return new ApiClient(config);
}
