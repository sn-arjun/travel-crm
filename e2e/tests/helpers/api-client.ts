import { APIRequestContext, expect } from '@playwright/test';

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    tenantId?: string;
  };
}

/**
 * Convert snake_case keys to camelCase recursively
 */
function toCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function camelizeKeys(obj: any): any {
  if (Array.isArray(obj)) return obj.map(camelizeKeys);
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [toCamel(k), camelizeKeys(v)])
    );
  }
  return obj;
}

/**
 * Unwrap backend response shape { success, data } or { success, error }
 * Also normalizes snake_case keys to camelCase
 */
function unwrap(body: any): any {
  if (body && typeof body === 'object' && 'success' in body) {
    if (body.success && 'data' in body) return camelizeKeys(body.data);
    if (!body.success && 'error' in body) {
      return body;
    }
  }
  return camelizeKeys(body);
}

export class APIClient {
  private baseURL: string;
  private authToken: string | null = null;
  private request: APIRequestContext;

  constructor(request: APIRequestContext, baseURL: string) {
    this.request = request;
    this.baseURL = baseURL;
  }

  /**
   * Login user and store authentication token
   */
  async login(
    email: string,
    password: string,
    tenantId: string
  ): Promise<LoginResponse> {
    const response = await this.request.post(`${this.baseURL}/api/auth/login`, {
      data: {
        email,
        password,
        tenantId,
      },
    });

    expect(response.status()).toBe(200);
    const raw = await response.json();
    const data = unwrap(raw) as LoginResponse;
    this.authToken = data.accessToken;
    return data;
  }

  /**
   * Set authentication token manually
   */
  setToken(token: string): void {
    this.authToken = token;
  }

  /**
   * Clear authentication token
   */
  clearToken(): void {
    this.authToken = null;
  }

  /**
   * GET request
   */
  async get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
    let url = `${this.baseURL}${path}`;
    if (params) {
      const sp = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        sp.append(key, String(value));
      });
      url += `?${sp.toString()}`;
    }

    const response = await this.request.get(url, {
      headers: this.getHeaders(),
    });

    expect(response.status()).toBeLessThan(400);
    const raw = await response.json();
    return unwrap(raw) as T;
  }

  /**
   * POST request
   */
  async post<T>(path: string, body?: unknown): Promise<T> {
    const response = await this.request.post(`${this.baseURL}${path}`, {
      headers: this.getHeaders(),
      data: body,
    });

    expect(response.status()).toBeLessThan(400);
    const raw = await response.json();
    return unwrap(raw) as T;
  }

  /**
   * PUT request
   */
  async put<T>(path: string, body?: unknown): Promise<T> {
    const response = await this.request.put(`${this.baseURL}${path}`, {
      headers: this.getHeaders(),
      data: body,
    });

    expect(response.status()).toBeLessThan(400);
    const raw = await response.json();
    return unwrap(raw) as T;
  }

  /**
   * DELETE request
   */
  async delete<T>(path: string): Promise<T> {
    const response = await this.request.delete(`${this.baseURL}${path}`, {
      headers: this.getHeaders(),
    });

    expect(response.status()).toBeLessThan(400);
    const raw = await response.json();
    return unwrap(raw) as T;
  }

  /**
   * Make a raw request without auto-expecting success
   */
  async raw(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    path: string,
    options?: {
      data?: unknown;
      params?: Record<string, string | number>;
    }
  ) {
    let url = `${this.baseURL}${path}`;
    if (options?.params) {
      const sp = new URLSearchParams();
      Object.entries(options.params).forEach(([key, value]) => {
        sp.append(key, String(value));
      });
      url += `?${sp.toString()}`;
    }

    const response = await this.request.fetch(url, {
      method,
      headers: this.getHeaders(),
      data: options?.data,
    });

    return response;
  }

  /**
   * Resolve tenant
   */
  async resolveTenant(email: string) {
    const response = await this.request.post(`${this.baseURL}/api/auth/resolve-tenant`, {
      data: { email },
    });
    const raw = await response.json();
    return unwrap(raw);
  }

  /**
   * Refresh token
   */
  async refreshToken(refreshToken: string): Promise<LoginResponse> {
    const response = await this.request.post(`${this.baseURL}/api/auth/refresh-token`, {
      data: { refreshToken },
    });

    expect(response.status()).toBe(200);
    const raw = await response.json();
    const data = unwrap(raw) as LoginResponse;
    this.authToken = data.accessToken;
    return data;
  }

  /**
   * Get authorization headers
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    return headers;
  }
}
