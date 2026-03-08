import { client, type ApiResponse } from './client';
import { API_ENDPOINTS } from './config';
import type { User, Tenant } from '@travelcrm/shared';

export interface LoginRequest {
  email: string;
  password: string;
  tenantId: string;
}

export interface SendOtpRequest {
  phone: string;
  tenantId: string;
}

export interface VerifyOtpRequest {
  phone: string;
  otp: string;
  tenantId: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
  tenant: Tenant;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RefreshTokenResponse {
  accessToken: string;
  refreshToken: string;
}

export interface ForgotPasswordRequest {
  email: string;
  tenantId?: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
  confirmPassword: string;
}

export interface ResolveTenantRequest {
  email: string;
}

export interface ResolvedTenant {
  id: string;
  companyName: string;
  logoUrl: string | null;
  role: string;
}

export interface ResolveTenantResponse {
  tenants: ResolvedTenant[];
}

export interface SessionData {
  id: string;
  device: string;
  browser: string;
  os: string;
  ipAddress: string;
  loginAt: string;
  isCurrent: boolean;
}

export const authApi = {
  resolveTenant: (data: ResolveTenantRequest) =>
    client.post<ApiResponse<ResolveTenantResponse>>(API_ENDPOINTS.auth.resolveTenant, data),

  login: (data: LoginRequest) =>
    client.post<ApiResponse<LoginResponse>>(API_ENDPOINTS.auth.login, data),

  sendOtp: (data: SendOtpRequest) =>
    client.post<ApiResponse<{ message: string }>>(API_ENDPOINTS.auth.sendOtp, data),

  verifyOtp: (data: VerifyOtpRequest) =>
    client.post<ApiResponse<LoginResponse>>(API_ENDPOINTS.auth.verifyOtp, data),

  logout: () =>
    client.post<ApiResponse<void>>(API_ENDPOINTS.auth.logout),

  refreshToken: (data: RefreshTokenRequest) =>
    client.post<ApiResponse<RefreshTokenResponse>>(API_ENDPOINTS.auth.refreshToken, data),

  forgotPassword: (data: ForgotPasswordRequest) =>
    client.post<ApiResponse<{ message: string }>>(API_ENDPOINTS.auth.forgotPassword, data),

  resetPassword: (data: ResetPasswordRequest) =>
    client.post<ApiResponse<{ message: string }>>(API_ENDPOINTS.auth.resetPassword, data),

  getSessions: () =>
    client.get<ApiResponse<SessionData[]>>(API_ENDPOINTS.auth.sessions),
};
