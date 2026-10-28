import { z } from 'zod';

// ── Auth Schemas ────────────────────────────────────────────

// tenantId is optional in the body: the route falls back to the X-Tenant-Id header
// and answers 400 "tenantId is required" when neither is supplied.
export const loginSchema = z.object({
  phone: z.string().min(10, 'Phone number is required'),
  tenantId: z.string().min(1).optional(),
});

export const verifyOtpSchema = z.object({
  phone: z.string().min(10, 'Phone number is required'),
  tenantId: z.string().min(1).optional(),
  otp: z.string().length(6, 'OTP must be 6 digits'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

// ── Trip Schemas ────────────────────────────────────────────

export const tripListSchema = z.object({
  tab: z.enum(['today', 'upcoming', 'past']).default('today'),
  page: z.string().regex(/^\d+$/).transform(Number).default(1),
  limit: z.string().regex(/^\d+$/).transform(Number).default(20),
});

export const rejectTripSchema = z.object({
  reason: z.string().min(10, 'Reason must be at least 10 characters'),
});

export const updateTripStatusSchema = z.object({
  status: z.enum(['en_route', 'started', 'completed']),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  notes: z.string().optional(),
});

export const checkInOutSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  photo: z.string().optional(), // base64 encoded
});

// ── Profile Schemas ─────────────────────────────────────────

export const updateProfileSchema = z.object({
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
});

// ── Push Token Schemas ──────────────────────────────────────

export const registerPushTokenSchema = z.object({
  token: z.string().min(1, 'FCM token is required'),
  platform: z.enum(['android', 'ios']).optional(),
});
