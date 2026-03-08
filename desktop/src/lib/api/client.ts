'use client';

import { API_BASE_URL } from './config';
import { useAuthStore } from '@/stores/auth-store';

// ============================================================================
// Types
// ============================================================================

export interface ApiError {
  status: number;
  message: string;
  code?: string;
  errors?: Record<string, string[]>;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface RequestConfig {
  params?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  body?: unknown;
  responseType?: 'json' | 'blob' | 'text';
  timeout?: number;
}

interface InternalRequestConfig extends RequestConfig {
  retryCount?: number;
  isRetry?: boolean;
}

// ============================================================================
// HTTP Client
// ============================================================================

class HttpClient {
  private baseUrl: string;
  private defaultTimeout: number = 30000; // 30 seconds

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private buildUrl(endpoint: string, params?: Record<string, string | number | boolean | undefined>): string {
    // Ensure baseUrl ends with / and endpoint has no leading / so URL concatenation works correctly
    const base = this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`;
    const path = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
    const url = new URL(path, base);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.append(key, String(value));
        }
      });
    }

    return url.toString();
  }

  private async handleResponse<T>(response: Response, responseType?: 'json' | 'blob' | 'text'): Promise<T> {
    if (responseType === 'blob') {
      return (await response.blob()) as T;
    }

    if (responseType === 'text') {
      return (await response.text()) as T;
    }

    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      return (await response.json()) as T;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return undefined as T;
  }

  private async handleError(response: Response): Promise<never> {
    const contentType = response.headers.get('content-type');

    let errorData: Record<string, unknown> = {
      status: response.status,
      message: `HTTP ${response.status}`,
    };

    if (contentType?.includes('application/json')) {
      try {
        errorData = await response.json();
      } catch {
        // Ignore JSON parse errors
      }
    }

    const error: ApiError = {
      status: response.status,
      message: (errorData.message as string) || `HTTP ${response.status}`,
      code: (errorData.code as string | undefined) || undefined,
      errors: (errorData.errors as Record<string, string[]> | undefined) || undefined,
    };

    throw error;
  }

  private async handleAuthRefresh(): Promise<boolean> {
    try {
      const store = useAuthStore.getState();
      const refreshToken = store.refreshToken;

      if (!refreshToken) {
        return false;
      }

      const response = await fetch(`${this.baseUrl}/auth/refresh-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        store.logout();
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        return false;
      }

      const data = (await response.json()) as {
        data?: { accessToken?: string; refreshToken?: string };
      };

      if (data.data?.accessToken && data.data?.refreshToken) {
        store.setTokens(data.data.accessToken, data.data.refreshToken);
        return true;
      }

      return false;
    } catch (error) {
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      return false;
    }
  }

  async request<T>(
    method: HttpMethod,
    endpoint: string,
    config: InternalRequestConfig = {},
  ): Promise<T> {
    const { params, headers = {}, body, responseType = 'json', timeout = this.defaultTimeout, retryCount = 0, isRetry = false } = config;

    const url = this.buildUrl(endpoint, params);

    // Add auth token
    const store = useAuthStore.getState();
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    const finalHeaders: Record<string, string> = {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    };

    if (store.accessToken) {
      finalHeaders['Authorization'] = `Bearer ${store.accessToken}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: finalHeaders,
        body: isFormData ? (body as FormData) : body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle 401 - attempt token refresh
      if (response.status === 401 && !isRetry && store.refreshToken) {
        const refreshed = await this.handleAuthRefresh();
        if (refreshed) {
          return this.request<T>(method, endpoint, {
            ...config,
            isRetry: true,
          });
        }
      }

      if (!response.ok) {
        await this.handleError(response);
      }

      return this.handleResponse<T>(response, responseType);
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw {
            status: 0,
            message: 'Request timeout',
            code: 'TIMEOUT',
          } as ApiError;
        }

        // Re-throw ApiError if it was already formatted
        if ('status' in error && 'message' in error) {
          throw error as ApiError;
        }

        throw {
          status: 0,
          message: error.message,
          code: 'NETWORK_ERROR',
        } as ApiError;
      }

      throw {
        status: 0,
        message: 'Unknown error',
        code: 'UNKNOWN_ERROR',
      } as ApiError;
    }
  }

  async get<T>(endpoint: string, config?: RequestConfig): Promise<T> {
    return this.request<T>('GET', endpoint, config);
  }

  async post<T>(endpoint: string, body?: unknown, config?: RequestConfig): Promise<T> {
    return this.request<T>('POST', endpoint, { ...config, body });
  }

  async put<T>(endpoint: string, body?: unknown, config?: RequestConfig): Promise<T> {
    return this.request<T>('PUT', endpoint, { ...config, body });
  }

  async patch<T>(endpoint: string, body?: unknown, config?: RequestConfig): Promise<T> {
    return this.request<T>('PATCH', endpoint, { ...config, body });
  }

  async delete<T = void>(endpoint: string, config?: RequestConfig): Promise<T> {
    return this.request<T>('DELETE', endpoint, config);
  }
}

// ============================================================================
// Singleton instance
// ============================================================================

export const client = new HttpClient(API_BASE_URL);
