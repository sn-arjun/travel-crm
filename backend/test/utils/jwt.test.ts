import { describe, it, expect } from 'vitest';
import { signAccessToken, verifyAccessToken, type TokenPayload } from '../../src/utils/jwt';

const TEST_SECRET = 'test-secret-key-for-jwt-signing-minimum-32-chars!';

const TEST_PAYLOAD = {
  userId: '01234567-89ab-cdef-0123-456789abcdef',
  tenantId: 'tenant-001',
  role: 'admin',
  email: 'admin@test.com',
};

describe('signAccessToken', () => {
  it('should return a JWT string', async () => {
    const token = await signAccessToken(TEST_PAYLOAD, TEST_SECRET);
    expect(typeof token).toBe('string');
  });

  it('should return a token with three dot-separated parts', async () => {
    const token = await signAccessToken(TEST_PAYLOAD, TEST_SECRET);
    const parts = token.split('.');
    expect(parts.length).toBe(3);
  });

  it('should produce different tokens for different payloads', async () => {
    const token1 = await signAccessToken(TEST_PAYLOAD, TEST_SECRET);
    const token2 = await signAccessToken(
      { ...TEST_PAYLOAD, userId: 'different-user' },
      TEST_SECRET
    );
    expect(token1).not.toBe(token2);
  });

  it('should produce different tokens for different secrets', async () => {
    const token1 = await signAccessToken(TEST_PAYLOAD, TEST_SECRET);
    const token2 = await signAccessToken(TEST_PAYLOAD, 'another-secret-key-that-is-long-enough!!!');
    expect(token1).not.toBe(token2);
  });

  it('should include HS256 algorithm in header', async () => {
    const token = await signAccessToken(TEST_PAYLOAD, TEST_SECRET);
    const headerPart = token.split('.')[0];
    const header = JSON.parse(atob(headerPart));
    expect(header.alg).toBe('HS256');
  });
});

describe('verifyAccessToken', () => {
  it('should verify a valid token and return payload', async () => {
    const token = await signAccessToken(TEST_PAYLOAD, TEST_SECRET);
    const payload = await verifyAccessToken(token, TEST_SECRET);

    expect(payload.userId).toBe(TEST_PAYLOAD.userId);
    expect(payload.tenantId).toBe(TEST_PAYLOAD.tenantId);
    expect(payload.role).toBe(TEST_PAYLOAD.role);
    expect(payload.email).toBe(TEST_PAYLOAD.email);
  });

  it('should include subject (sub) matching userId', async () => {
    const token = await signAccessToken(TEST_PAYLOAD, TEST_SECRET);
    const payload = await verifyAccessToken(token, TEST_SECRET);

    expect(payload.sub).toBe(TEST_PAYLOAD.userId);
  });

  it('should include issued at (iat) timestamp', async () => {
    const token = await signAccessToken(TEST_PAYLOAD, TEST_SECRET);
    const payload = await verifyAccessToken(token, TEST_SECRET);

    expect(payload.iat).toBeDefined();
    expect(typeof payload.iat).toBe('number');
  });

  it('should include expiration (exp) timestamp', async () => {
    const token = await signAccessToken(TEST_PAYLOAD, TEST_SECRET);
    const payload = await verifyAccessToken(token, TEST_SECRET);

    expect(payload.exp).toBeDefined();
    expect(typeof payload.exp).toBe('number');
    // Expiration should be after issued at
    expect(payload.exp!).toBeGreaterThan(payload.iat!);
  });

  it('should set expiration to approximately 15 minutes from issuance', async () => {
    const token = await signAccessToken(TEST_PAYLOAD, TEST_SECRET);
    const payload = await verifyAccessToken(token, TEST_SECRET);

    const fifteenMinutes = 15 * 60; // in seconds
    const diff = payload.exp! - payload.iat!;
    expect(diff).toBe(fifteenMinutes);
  });

  it('should reject token signed with wrong secret', async () => {
    const token = await signAccessToken(TEST_PAYLOAD, TEST_SECRET);

    await expect(
      verifyAccessToken(token, 'wrong-secret-key-that-is-long-enough-for-test!!')
    ).rejects.toThrow();
  });

  it('should reject tampered token', async () => {
    const token = await signAccessToken(TEST_PAYLOAD, TEST_SECRET);
    // Tamper with the payload section
    const parts = token.split('.');
    parts[1] = parts[1] + 'tampered';
    const tamperedToken = parts.join('.');

    await expect(
      verifyAccessToken(tamperedToken, TEST_SECRET)
    ).rejects.toThrow();
  });

  it('should reject completely invalid token', async () => {
    await expect(
      verifyAccessToken('not.a.valid.jwt', TEST_SECRET)
    ).rejects.toThrow();
  });

  it('should reject empty string', async () => {
    await expect(
      verifyAccessToken('', TEST_SECRET)
    ).rejects.toThrow();
  });

  it('should round-trip with all payload fields intact', async () => {
    const payload = {
      userId: 'user-123',
      tenantId: 'tenant-abc',
      role: 'agent',
      email: 'agent@company.com',
    };

    const token = await signAccessToken(payload, TEST_SECRET);
    const decoded = await verifyAccessToken(token, TEST_SECRET);

    expect(decoded.userId).toBe('user-123');
    expect(decoded.tenantId).toBe('tenant-abc');
    expect(decoded.role).toBe('agent');
    expect(decoded.email).toBe('agent@company.com');
  });
});
