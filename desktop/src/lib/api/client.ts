'use client';

import { getApiBaseUrl } from './config';
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
  /**
   * Let the request finish even if the page is reloaded or closed right after it is sent.
   * For small saves made on blur, where the screen already shows the new value.
   */
  keepalive?: boolean;
}

interface InternalRequestConfig extends RequestConfig {
  retryCount?: number;
  isRetry?: boolean;
}

// ============================================================================
// HTTP Client
// ============================================================================

class HttpClient {
  private baseUrl: string | (() => string);
  private defaultTimeout: number = 30000; // 30 seconds

  constructor(baseUrl: string | (() => string)) {
    this.baseUrl = baseUrl;
  }

  private buildUrl(endpoint: string, params?: Record<string, string | number | boolean | undefined>): string {
    // Ensure baseUrl ends with / and endpoint has no leading / so URL concatenation works correctly
    const resolved = typeof this.baseUrl === 'function' ? this.baseUrl() : this.baseUrl;
    const base = resolved.endsWith('/') ? resolved : `${resolved}/`;
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

    const envelope = errorData.error as { message?: string; code?: string } | string | undefined;
    const envelopeMessage = typeof envelope === 'string' ? envelope : envelope?.message;
    const envelopeCode = typeof envelope === 'object' ? envelope?.code : undefined;

    const error: ApiError = {
      status: response.status,
      message: (errorData.message as string) || envelopeMessage || `HTTP ${response.status}`,
      code: (errorData.code as string | undefined) || envelopeCode || undefined,
      errors: (errorData.errors as Record<string, string[]> | undefined) || undefined,
    };

    throw error;
  }

  async request<T>(
    method: HttpMethod,
    endpoint: string,
    config: InternalRequestConfig = {},
  ): Promise<T> {
    const { params, headers = {}, body, responseType = 'json', timeout = this.defaultTimeout, isRetry = false } = config;

    const url = this.buildUrl(endpoint, params);

    // Add auth token
    const store = useAuthStore.getState();
    const sentAccess = store.accessToken;
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    const finalHeaders: Record<string, string> = {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    };

    if (store.accessToken) {
      finalHeaders['Authorization'] = `Bearer ${store.accessToken}`;
    }
    if (store.refreshToken) {
      finalHeaders['X-Refresh-Token'] = store.refreshToken;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: finalHeaders,
        body: isFormData ? (body as FormData) : body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
        ...(config.keepalive ? { keepalive: true } : {}),
      });

      clearTimeout(timeoutId);

      // Handle 401 - attempt a (single-flight) token refresh, then retry once
      if (response.status === 401 && !isRetry) {
        const current = useAuthStore.getState();
        if (current.accessToken !== sentAccess) {
          // Someone (another request, the proactive timer or another window)
          // already rotated the tokens while this request was in flight.
          return this.request<T>(method, endpoint, { ...config, isRetry: true });
        }
        if (current.refreshToken && (await refreshAccessToken())) {
          return this.request<T>(method, endpoint, { ...config, isRetry: true });
        }
      }

      if (!response.ok) {
        await this.handleError(response);
      }

      return this.handleResponse<T>(response, responseType);
    } catch (error) {
      clearTimeout(timeoutId);

      if (!(error instanceof Error) && typeof error === 'object' && error !== null
        && typeof (error as ApiError).status === 'number' && typeof (error as ApiError).message === 'string') {
        throw error as ApiError;
      }

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
// Token refresh (single-flight, cross-window safe)
// ============================================================================

const AUTH_STORAGE_KEY = 'travelcrm-auth';
const REFRESH_LOCK_NAME = 'travelcrm-auth-refresh';
const REFRESH_TIMEOUT_MS = 15_000;

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** Read the tokens another window may have persisted (zustand persist format). */
function readPersistedTokens(): TokenPair | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      state?: { accessToken?: string | null; refreshToken?: string | null };
    };
    const accessToken = parsed.state?.accessToken;
    const refreshToken = parsed.state?.refreshToken;
    if (accessToken && refreshToken) return { accessToken, refreshToken };
  } catch {
    // Corrupt or unavailable storage - treat as "nothing persisted"
  }
  return null;
}

function logoutAndRedirect(): void {
  useAuthStore.getState().logout();
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    window.location.href = '/login';
  }
}

async function runRefresh(usedToken: string): Promise<boolean> {
  // Another window already rotated the tokens: adopt them without a network call.
  const persisted = readPersistedTokens();
  if (persisted && persisted.refreshToken !== usedToken) {
    useAuthStore.getState().setTokens(persisted.accessToken, persisted.refreshToken);
    return true;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}/auth/refresh-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: usedToken }),
      signal: controller.signal,
    });
  } catch {
    // Network error or timeout: transient, never log the user out.
    return false;
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.ok) {
    try {
      const body = (await response.json()) as {
        data?: { accessToken?: string; refreshToken?: string };
      };
      if (body.data?.accessToken && body.data?.refreshToken) {
        useAuthStore.getState().setTokens(body.data.accessToken, body.data.refreshToken);
        return true;
      }
    } catch {
      // Unparseable body: treat as transient
    }
    return false;
  }

  if (response.status === 400 || response.status === 401 || response.status === 403) {
    // The token was rejected. Maybe we lost a race with another window.
    const latest = readPersistedTokens();
    if (latest && latest.refreshToken !== usedToken) {
      useAuthStore.getState().setTokens(latest.accessToken, latest.refreshToken);
      return true;
    }
    logoutAndRedirect();
    return false;
  }

  // 5xx / 429 / anything else: transient, keep the session.
  return false;
}

async function doRefresh(): Promise<boolean> {
  const usedToken = useAuthStore.getState().refreshToken;
  if (!usedToken) return false;

  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(REFRESH_LOCK_NAME, () => runRefresh(usedToken));
  }
  return runRefresh(usedToken);
}

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Refresh the access token. Concurrent callers (requests that got a 401, the
 * proactive timer) share one network call; other windows are coordinated via
 * the Web Locks API and the persisted auth state.
 */
export function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = doRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

// ============================================================================
// Proactive token refresh
// ============================================================================

let refreshInterval: ReturnType<typeof setInterval> | null = null;

/** Refresh when the access token expires within 2 minutes. Never logs out. */
export async function checkProactiveRefresh(): Promise<void> {
  const store = useAuthStore.getState();
  if (!store.accessToken || !store.refreshToken) return;

  try {
    const parts = store.accessToken.split('.');
    if (parts.length !== 3 || !parts[1]) return;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    if (!payload.exp) return;

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp - now < 120) {
      await refreshAccessToken();
    }
  } catch {
    // Silently ignore - will retry next interval
  }
}

function startTokenRefreshTimer() {
  if (refreshInterval) return;
  // Check every 60 seconds if the access token needs refreshing
  refreshInterval = setInterval(() => {
    void checkProactiveRefresh();
  }, 60_000);
}

function stopTokenRefreshTimer() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

// Start the refresh timer when the module loads (client-side only)
if (typeof window !== 'undefined') {
  startTokenRefreshTimer();

  // Listen for auth state changes to start/stop the timer
  if (typeof useAuthStore.subscribe === 'function') {
    useAuthStore.subscribe((state) => {
      if (state.isAuthenticated && state.refreshToken) {
        startTokenRefreshTimer();
      } else {
        stopTokenRefreshTimer();
      }
    });
  }

  // Keep this window in sync when another window/tab rotates or clears the tokens
  window.addEventListener('storage', (e) => {
    if (e.key === AUTH_STORAGE_KEY) {
      void useAuthStore.persist?.rehydrate?.();
    }
  });
}

// ============================================================================
// Singleton instance
// ============================================================================

export const client = new HttpClient(getApiBaseUrl);
