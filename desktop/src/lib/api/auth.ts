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
  /** True for a first login with a temporary password: the user must set their own before anything else. */
  mustChangePassword?: boolean;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RefreshTokenResponse {
  accessToken: string;
  refreshToken: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface ChangePasswordResponse {
  message: string;
  /** A fresh access token without the must-change restriction. */
  accessToken: string;
  mustChangePassword: false;
}

/** Same rule as the API until the stronger policy lands: 10+ characters with a letter and a digit. */
export const PASSWORD_MIN_LENGTH = 10;
export function passwordPolicyError(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters`;
  if (!/[A-Za-z]/.test(password)) return 'Include at least one letter';
  if (!/[0-9]/.test(password)) return 'Include at least one digit';
  return null;
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

  changePassword: (data: ChangePasswordRequest) =>
    client.post<ApiResponse<ChangePasswordResponse>>(API_ENDPOINTS.auth.changePassword, data),

  getSessions: () =>
    client.get<ApiResponse<SessionData[]>>(API_ENDPOINTS.auth.sessions),
};
