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
  /** The agency requires two-factor sign-in and this user has not set it up: only Settings > Security works until they do. */
  twoFactorSetupRequired?: boolean;
}

/** Returned instead of tokens when the account has two-factor sign-in on: the second step completes the sign-in. */
export interface TwoFactorChallenge {
  requires2fa: true;
  challengeToken: string;
  methods: Array<'totp' | 'recovery_code'>;
}

export type LoginResult = LoginResponse | TwoFactorChallenge;

export function isTwoFactorChallenge(result: LoginResult): result is TwoFactorChallenge {
  return (result as TwoFactorChallenge).requires2fa === true;
}

export interface TwoFactorVerifyRequest {
  challengeToken: string;
  /** The 6-digit code from the authenticator app, or a recovery code. */
  code: string;
}

export interface TwoFactorVerifyResponse extends LoginResponse {
  usedRecoveryCode: boolean;
  recoveryCodesRemaining: number;
}

export interface TwoFactorStatus {
  enabled: boolean;
  recoveryCodesRemaining: number;
  /** The agency requires every user to use two-factor sign-in. */
  required: boolean;
}

export interface TwoFactorSetupResponse {
  /** Shown once: the base32 secret for manual entry. */
  secret: string;
  /** otpauth:// address for the QR code. */
  otpauthUri: string;
  issuer: string;
  account: string;
}

export interface TwoFactorEnableResponse {
  enabled: true;
  /** Shown once. */
  recoveryCodes: string[];
  /** A fresh access token without any setup-required restriction. */
  accessToken: string;
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

/** The API's rule, minus the common-password list it also checks: 12+ characters with a letter and a digit. */
export const PASSWORD_MIN_LENGTH = 12;
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
    client.post<ApiResponse<LoginResult>>(API_ENDPOINTS.auth.login, data),

  sendOtp: (data: SendOtpRequest) =>
    client.post<ApiResponse<{ message: string }>>(API_ENDPOINTS.auth.sendOtp, data),

  verifyOtp: (data: VerifyOtpRequest) =>
    client.post<ApiResponse<LoginResult>>(API_ENDPOINTS.auth.verifyOtp, data),

  twoFactorVerify: (data: TwoFactorVerifyRequest) =>
    client.post<ApiResponse<TwoFactorVerifyResponse>>(API_ENDPOINTS.auth.twoFactorVerify, data),

  twoFactorStatus: () => client.get<ApiResponse<TwoFactorStatus>>(API_ENDPOINTS.auth.twoFactorStatus),

  twoFactorSetup: (data: { password: string }) =>
    client.post<ApiResponse<TwoFactorSetupResponse>>(API_ENDPOINTS.auth.twoFactorSetup, data),

  twoFactorEnable: (data: { code: string }) =>
    client.post<ApiResponse<TwoFactorEnableResponse>>(API_ENDPOINTS.auth.twoFactorEnable, data),

  twoFactorDisable: (data: { password: string; code: string }) =>
    client.post<ApiResponse<{ enabled: false }>>(API_ENDPOINTS.auth.twoFactorDisable, data),

  twoFactorRecoveryCodes: (data: { password: string; code: string }) =>
    client.post<ApiResponse<{ recoveryCodes: string[] }>>(API_ENDPOINTS.auth.twoFactorRecoveryCodes, data),

  getTwoFactorPolicy: () => client.get<ApiResponse<{ required: boolean }>>(API_ENDPOINTS.auth.twoFactorPolicy),

  setTwoFactorPolicy: (data: { required: boolean }) =>
    client.put<ApiResponse<{ required: boolean }>>(API_ENDPOINTS.auth.twoFactorPolicy, data),

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
