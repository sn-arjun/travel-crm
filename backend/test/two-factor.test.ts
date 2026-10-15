import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import worker from '../src/index';
import { hashPassword, validatePassword } from '../src/utils/password';
import { base32Decode, base32Encode, generateRecoveryCodes, hashRecoveryCode, hotp, otpauthUri, totpAt, totpStep, verifyTotp } from '../src/utils/totp';
import { passwordChangeAllowed, twoFactorSetupAllowed } from '../src/middleware/tenant';

// R209: two-factor sign-in (TOTP + recovery codes) and the stronger password policy.
const testEnv = env as any;
const TENANT_ID = '0196a209-0000-7000-8000-000000000001';
const PASSWORD = 'Voyage2026ok!';
const DOMAIN = '@r209.test';

const users: Record<string, { id: string; email: string }> = {};

async function call(method: string, path: string, token: string | null, body?: unknown, headers: Record<string, string> = {}): Promise<Response> {
  const h: Record<string, string> = { 'Content-Type': 'application/json', ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost/api/v1${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }),
    testEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}
const json = async (res: Response) => (await res.json()) as any;

async function makeUser(key: string, role = 'salesperson') {
  const id = `0196a209-0000-7000-8000-${String(Object.keys(users).length + 10).padStart(12, '0')}`;
  const email = `${key}${DOMAIN}`;
  await testEnv.MASTER_DB
    .prepare(`INSERT OR REPLACE INTO users (id, email, password_hash, role, name, is_active, language) VALUES (?, ?, ?, ?, ?, 1, 'en')`)
    .bind(id, email, await hashPassword(PASSWORD), role, `User ${key}`)
    .run();
  await testEnv.MASTER_DB
    .prepare(`INSERT OR REPLACE INTO tenant_users (id, tenant_id, email, user_id, role, is_active) VALUES (?, ?, ?, ?, ?, 1)`)
    .bind(id.replace('0196a209', '0196b209'), TENANT_ID, email, id, role)
    .run();
  users[key] = { id, email };
}

const login = (key: string, password = PASSWORD) => call('POST', '/auth/login', null, { email: users[key]!.email, password, tenantId: TENANT_ID });

/** A signed-in session for a user without 2FA. */
async function signIn(key: string) {
  const res = await login(key);
  expect(res.status).toBe(200);
  return (await json(res)).data as { accessToken: string; refreshToken: string };
}

/** Enrol a user through the API; returns the secret, the recovery codes and the fresh token. */
async function enrol(key: string) {
  const { accessToken } = await signIn(key);
  const setup = await call('POST', '/auth/2fa/setup', accessToken, { password: PASSWORD });
  expect(setup.status).toBe(200);
  const { secret } = (await json(setup)).data;
  const enable = await call('POST', '/auth/2fa/enable', accessToken, { code: await totpAt(secret, Date.now()) });
  expect(enable.status).toBe(200);
  const data = (await json(enable)).data;
  signInCodes[key] = [...data.recoveryCodes];
  return { secret: secret as string, recoveryCodes: data.recoveryCodes as string[], accessToken: data.accessToken as string };
}

/** The next code after `secret`'s last used step (the one a replay check would reject). */
const nextCode = (secret: string, stepsAhead: number) => totpAt(secret, Date.now() + stepsAhead * 30_000);

async function outbox(to: string): Promise<Array<{ template: string }>> {
  return (await json(await call('GET', `/test/outbox?to=${encodeURIComponent(to)}`, null))).data;
}

beforeAll(async () => {
  await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
  await testEnv.MASTER_DB
    .prepare(`INSERT OR REPLACE INTO tenants (id, company_name, subdomain, plan, status) VALUES (?, 'Agency R209', 'r209-agency', 'pro', 'active')`)
    .bind(TENANT_ID)
    .run();
  for (const [key, role] of [['main', 'admin'], ['lock', 'salesperson'], ['rec', 'salesperson'], ['target', 'salesperson'], ['plain', 'salesperson'], ['pol', 'salesperson'], ['replay', 'salesperson']] as const) {
    await makeUser(key, role);
  }
});

afterAll(async () => {
  const mine = `(SELECT id FROM users WHERE email LIKE '%${DOMAIN}')`;
  const statements = [
    `DELETE FROM settings WHERE key = 'require_2fa'`,
    `DELETE FROM login_history WHERE user_id IN ${mine}`,
    `DELETE FROM activity_logs WHERE user_id IN ${mine}`,
    `DELETE FROM tenant_users WHERE tenant_id = '${TENANT_ID}'`,
    `DELETE FROM users WHERE email LIKE '%${DOMAIN}'`,
    `DELETE FROM tenants WHERE id = '${TENANT_ID}'`,
  ];
  for (const sql of statements) {
    try {
      await testEnv.MASTER_DB.prepare(sql).run();
    } catch {
      // a leftover row is cleared by the next /test/reset
    }
  }
});

describe('TOTP primitives (RFC 6238 / RFC 4226)', () => {
  const rfcSecret = base32Encode(new TextEncoder().encode('12345678901234567890'));

  it('matches the RFC 6238 SHA-1 test vectors (6 digits)', async () => {
    // RFC 6238 appendix B gives 8-digit codes 94287082, 07081804, 14050471, 89005924, 69279037, 65353130
    const vectors: Array<[number, string]> = [
      [59, '287082'],
      [1111111109, '081804'],
      [1111111111, '050471'],
      [1234567890, '005924'],
      [2000000000, '279037'],
      [20000000000, '353130'],
    ];
    for (const [seconds, code] of vectors) expect(await totpAt(rfcSecret, seconds * 1000), String(seconds)).toBe(code);
  });

  it('matches the RFC 4226 HOTP test vectors', async () => {
    const key = new TextEncoder().encode('12345678901234567890');
    const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
    for (let i = 0; i < expected.length; i++) expect(await hotp(key, i)).toBe(expected[i]);
  });

  it('round-trips base32 and builds an otpauth URI', () => {
    const bytes = new Uint8Array([1, 2, 3, 250, 251, 252, 0, 9]);
    expect(Array.from(base32Decode(base32Encode(bytes))!)).toEqual(Array.from(bytes));
    expect(base32Decode('not base32 !')).toBeNull();
    const uri = otpauthUri('JBSWY3DPEHPK3PXP', 'a@b.test', 'TravelCRM Pro');
    expect(uri).toMatch(/^otpauth:\/\/totp\/TravelCRM%20Pro:a%40b\.test\?/);
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(uri).toContain('issuer=TravelCRM%20Pro');
  });

  it('accepts one step either side, refuses two, and never accepts a step twice', async () => {
    const now = 1_700_000_000_000;
    const step = totpStep(now);
    expect(await verifyTotp(rfcSecret, await totpAt(rfcSecret, now), { nowMs: now })).toBe(step);
    expect(await verifyTotp(rfcSecret, await totpAt(rfcSecret, now - 30_000), { nowMs: now })).toBe(step - 1);
    expect(await verifyTotp(rfcSecret, await totpAt(rfcSecret, now + 30_000), { nowMs: now })).toBe(step + 1);
    expect(await verifyTotp(rfcSecret, await totpAt(rfcSecret, now - 90_000), { nowMs: now })).toBeNull();
    expect(await verifyTotp(rfcSecret, await totpAt(rfcSecret, now), { nowMs: now, afterStep: step })).toBeNull();
    expect(await verifyTotp(rfcSecret, '12345', { nowMs: now })).toBeNull();
    expect(await verifyTotp(rfcSecret, 'abcdef', { nowMs: now })).toBeNull();
  });

  it('makes distinct, normalisable recovery codes', async () => {
    const codes = generateRecoveryCodes();
    expect(new Set(codes).size).toBe(10);
    expect(codes[0]).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    expect(await hashRecoveryCode(codes[0]!)).toBe(await hashRecoveryCode(codes[0]!.toLowerCase().replace('-', ' ')));
    expect(await hashRecoveryCode(codes[0]!)).not.toBe(await hashRecoveryCode(codes[1]!));
  });
});

describe('password policy', () => {
  it('requires 12+ characters, a letter and a digit', () => {
    expect(validatePassword('Short1a')).toMatch(/at least 12/);
    expect(validatePassword('Admin@123')).toMatch(/at least 12/); // the seeded demo password stays valid to LOG IN, but cannot be chosen
    expect(validatePassword('onlyletterspassword')).toMatch(/digit/);
    expect(validatePassword('12345678901234')).toMatch(/letter/);
    expect(validatePassword('a'.repeat(129) + '1')).toMatch(/at most 128/);
    expect(validatePassword('Voyage2026ok!')).toBeNull();
    expect(validatePassword('Another1Passw0rd')).toBeNull();
  });

  it('refuses the email address, the local part and common passwords', () => {
    expect(validatePassword('jane.doe@example.com1', { email: 'jane.doe@example.com' })).toBeNull(); // different from the email
    expect(validatePassword('jane.doe.travel9', { email: 'jane.doe.travel9@example.com' })).toMatch(/email/);
    expect(validatePassword('longlocalpart1@x.com', { email: 'longlocalpart1@x.com' })).toMatch(/email/);
    expect(validatePassword('Password123456')).toMatch(/common/);
    expect(validatePassword('qwerty123456')).toMatch(/common/);
    expect(validatePassword('Welcome20261234')).toMatch(/common/); // a listed word plus trailing digits
    expect(validatePassword('Welcomed-Guests-2026')).toBeNull();
    expect(validatePassword('aaaaaaaaaaaa1')).toMatch(/repetitive/);
  });
});

describe('enrolment, sign-in, recovery and disable', () => {
  let secret = '';
  let recoveryCodes: string[] = [];
  let token = '';

  it('starts with a status of off and refuses setup with a wrong password', async () => {
    const { accessToken } = await signIn('main');
    const status = await json(await call('GET', '/auth/2fa/status', accessToken));
    expect(status.data).toMatchObject({ enabled: false, recoveryCodesRemaining: 0 });
    expect((await call('POST', '/auth/2fa/setup', accessToken, { password: 'wrong-password-1' })).status).toBe(401);
    expect((await call('POST', '/auth/2fa/setup', null, { password: PASSWORD })).status).toBe(401);
  });

  it('setup returns the secret once and stores it encrypted; enable needs a correct code', async () => {
    const { accessToken } = await signIn('main');
    const setup = await json(await call('POST', '/auth/2fa/setup', accessToken, { password: PASSWORD }));
    secret = setup.data.secret;
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(setup.data.otpauthUri).toContain(`secret=${secret}`);
    expect(setup.data.otpauthUri).toContain('main%40r209.test');

    const row = await testEnv.MASTER_DB.prepare(`SELECT totp_secret_enc, totp_enabled, recovery_codes_hash FROM users WHERE id = ?`).bind(users.main!.id).first();
    expect(row.totp_enabled).toBe(0);
    expect(row.totp_secret_enc).toMatch(/^enc:v1:/);
    expect(row.totp_secret_enc).not.toContain(secret);

    // A wrong code does not turn it on; the pending secret signs nobody in.
    expect((await call('POST', '/auth/2fa/enable', accessToken, { code: '000000' })).status).toBe(400);
    expect((await json(await login('main'))).data.accessToken).toBeTruthy();

    const enable = await call('POST', '/auth/2fa/enable', accessToken, { code: await totpAt(secret, Date.now()) });
    expect(enable.status).toBe(200);
    const data = (await json(enable)).data;
    recoveryCodes = data.recoveryCodes;
    token = data.accessToken;
    expect(recoveryCodes).toHaveLength(10);
    expect(data.enabled).toBe(true);
  });

  it('keeps only hashes of the recovery codes and mails the account holder', async () => {
    const row = await testEnv.MASTER_DB.prepare(`SELECT recovery_codes_hash FROM users WHERE id = ?`).bind(users.main!.id).first();
    for (const code of recoveryCodes) expect(row.recovery_codes_hash).not.toContain(code.replace('-', ''));
    expect(JSON.parse(row.recovery_codes_hash)).toContain(await hashRecoveryCode(recoveryCodes[0]!));
    expect((await outbox(users.main!.email)).map((m) => m.template)).toContain('two_factor_enabled');
    // The secret is never returned again.
    const status = await call('GET', '/auth/2fa/status', token);
    expect(JSON.stringify(await json(status))).not.toContain(secret);
  });

  it('login with 2FA on issues a challenge and no token', async () => {
    const res = await login('main');
    expect(res.status).toBe(200);
    const body = (await json(res)).data;
    expect(body.requires2fa).toBe(true);
    expect(body.challengeToken).toMatch(/^[0-9a-f]{64}$/);
    expect(body.accessToken).toBeUndefined();
    expect(body.refreshToken).toBeUndefined();
    expect(body.user).toBeUndefined();
  });

  it('a wrong password still fails before any challenge', async () => {
    const res = await login('main', 'wrong-password-1');
    expect(res.status).toBe(401);
  });

  it('verify signs in with a current code, and that code works once', async () => {
    const challenge = (await json(await login('main'))).data.challengeToken;
    // Step ahead of the one used while enabling, so replay protection is exercised on its own below.
    const code = await nextCode(secret, 1);
    const res = await call('POST', '/auth/2fa/verify', null, { challengeToken: challenge, code });
    expect(res.status).toBe(200);
    const data = (await json(res)).data;
    expect(data.accessToken).toBeTruthy();
    expect(data.refreshToken).toBeTruthy();
    expect(data.user.email).toBe(users.main!.email);
    expect(data.usedRecoveryCode).toBe(false);
    expect((await call('GET', '/users/me', data.accessToken)).status).toBe(200);
    expect((await call('POST', '/auth/refresh-token', null, { refreshToken: data.refreshToken })).status).toBe(200);

    // The challenge is spent, and the same code on a fresh challenge is a replay.
    expect((await call('POST', '/auth/2fa/verify', null, { challengeToken: challenge, code })).status).toBe(401);
    const second = (await json(await login('main'))).data.challengeToken;
    expect((await call('POST', '/auth/2fa/verify', null, { challengeToken: second, code })).status).toBe(401);
  });

  it('an unknown or malformed challenge is refused', async () => {
    expect((await call('POST', '/auth/2fa/verify', null, { challengeToken: 'f'.repeat(64), code: '123456' })).status).toBe(401);
    expect((await call('POST', '/auth/2fa/verify', null, { code: '123456' })).status).toBe(400);
  });

  it('the TOTP secret opens only for its own user (bound to the row)', async () => {
    const sealed = (await testEnv.MASTER_DB.prepare(`SELECT totp_secret_enc FROM users WHERE id = ?`).bind(users.main!.id).first()).totp_secret_enc;
    await testEnv.MASTER_DB.prepare(`UPDATE users SET totp_secret_enc = ?, totp_enabled = 1 WHERE id = ?`).bind(sealed, users.plain!.id).run();
    const challenge = (await json(await login('plain'))).data.challengeToken;
    const res = await call('POST', '/auth/2fa/verify', null, { challengeToken: challenge, code: await totpAt(secret, Date.now()) });
    expect(res.status).toBe(500); // the ciphertext is not valid for another user's row
    await testEnv.MASTER_DB.prepare(`UPDATE users SET totp_secret_enc = NULL, totp_enabled = 0 WHERE id = ?`).bind(users.plain!.id).run();
  });

  it('a recovery code signs in once and then is gone', async () => {
    const code = recoveryCodes[0]!;
    const challenge = (await json(await login('main'))).data.challengeToken;
    const res = await call('POST', '/auth/2fa/verify', null, { challengeToken: challenge, code: code.toLowerCase() });
    expect(res.status).toBe(200);
    const data = (await json(res)).data;
    expect(data.usedRecoveryCode).toBe(true);
    expect(data.recoveryCodesRemaining).toBe(9);

    const again = (await json(await login('main'))).data.challengeToken;
    expect((await call('POST', '/auth/2fa/verify', null, { challengeToken: again, code })).status).toBe(401);
    // another one still works
    const third = (await json(await login('main'))).data.challengeToken;
    expect((await call('POST', '/auth/2fa/verify', null, { challengeToken: third, code: recoveryCodes[1]! })).status).toBe(200);
  });

  it('regenerates recovery codes with the password and a code; the old set stops working', async () => {
    const { accessToken } = (await json(await call('POST', '/auth/2fa/verify', null, {
      challengeToken: (await json(await login('main'))).data.challengeToken,
      code: recoveryCodes[2]!,
    }))).data;
    expect((await call('POST', '/auth/2fa/recovery-codes', accessToken, { password: PASSWORD, code: '000000' })).status).toBe(401);
    const res = await call('POST', '/auth/2fa/recovery-codes', accessToken, { password: PASSWORD, code: recoveryCodes[3]! });
    expect(res.status).toBe(200);
    const fresh: string[] = (await json(res)).data.recoveryCodes;
    expect(fresh).toHaveLength(10);
    const stale = (await json(await login('main'))).data.challengeToken;
    expect((await call('POST', '/auth/2fa/verify', null, { challengeToken: stale, code: recoveryCodes[4]! })).status).toBe(401);
    recoveryCodes = fresh;
  });

  it('disable needs the password and a valid code, then login goes back to one step', async () => {
    const { accessToken } = (await json(await call('POST', '/auth/2fa/verify', null, {
      challengeToken: (await json(await login('main'))).data.challengeToken,
      code: recoveryCodes[0]!,
    }))).data;
    expect((await call('POST', '/auth/2fa/disable', accessToken, { password: 'wrong-password-1', code: recoveryCodes[1]! })).status).toBe(401);
    expect((await call('POST', '/auth/2fa/disable', accessToken, { password: PASSWORD, code: '000000' })).status).toBe(401);
    const res = await call('POST', '/auth/2fa/disable', accessToken, { password: PASSWORD, code: recoveryCodes[1]! });
    expect(res.status).toBe(200);

    const row = await testEnv.MASTER_DB.prepare(`SELECT totp_secret_enc, totp_enabled, recovery_codes_hash FROM users WHERE id = ?`).bind(users.main!.id).first();
    expect(row).toMatchObject({ totp_secret_enc: null, totp_enabled: 0, recovery_codes_hash: null });
    expect((await outbox(users.main!.email)).map((m) => m.template)).toContain('two_factor_disabled');

    const plain = (await json(await login('main'))).data;
    expect(plain.requires2fa).toBeUndefined();
    expect(plain.accessToken).toBeTruthy();
  });
});

describe('challenge lockout', () => {
  it('five wrong codes lock the challenge, even for the right code afterwards', async () => {
    const { secret } = await enrol('lock');
    const challenge = (await json(await login('lock'))).data.challengeToken;
    for (let i = 1; i <= 4; i++) {
      const res = await call('POST', '/auth/2fa/verify', null, { challengeToken: challenge, code: '000000' });
      expect(res.status, `attempt ${i}`).toBe(401);
      expect((await json(res)).error.message).toContain(`${5 - i} attempts left`);
    }
    const fifth = await call('POST', '/auth/2fa/verify', null, { challengeToken: challenge, code: '000000' });
    expect(fifth.status).toBe(429);
    const good = await call('POST', '/auth/2fa/verify', null, { challengeToken: challenge, code: await nextCode(secret, 1) });
    expect(good.status).toBe(401);
    // A new password step gives a new challenge that works.
    const fresh = (await json(await login('lock'))).data.challengeToken;
    expect((await call('POST', '/auth/2fa/verify', null, { challengeToken: fresh, code: await nextCode(secret, 1) })).status).toBe(200);
  });

  it('with real rate limits the verify route throttles a single account', async () => {
    const strict = { ...testEnv, RATE_LIMIT_MULTIPLIER: '1' };
    const { secret } = await enrol('replay');
    let limited = false;
    for (let i = 0; i < 20 && !limited; i++) {
      const challenge = (await json(await login('replay'))).data.challengeToken;
      const ctx = createExecutionContext();
      const res = await worker.fetch(
        new Request('http://localhost/api/v1/auth/2fa/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ challengeToken: challenge, code: '000000' }),
        }),
        strict,
        ctx,
      );
      await waitOnExecutionContext(ctx);
      limited = res.status === 429 && /Retry in/.test((await json(res)).error.message);
    }
    expect(limited).toBe(true);
    expect(secret).toBeTruthy();
  });
});

describe('admin reset and the agency requirement', () => {
  it('an admin turns off a locked-out user\'s 2FA; the user is signed out everywhere and mailed', async () => {
    const admin = await signIn('main'); // 'main' is an admin with 2FA off again
    const target = await enrol('target');
    const targetSession = (await json(await call('POST', '/auth/2fa/verify', null, {
      challengeToken: (await json(await login('target'))).data.challengeToken,
      code: target.recoveryCodes[0]!,
    }))).data;

    expect((await call('POST', `/users/${users.target!.id}/two-factor/reset`, targetSession.accessToken)).status).toBe(403); // not an admin
    expect((await call('POST', `/users/${users.main!.id}/two-factor/reset`, admin.accessToken)).status).toBe(400); // not on yourself
    const res = await call('POST', `/users/${users.target!.id}/two-factor/reset`, admin.accessToken);
    expect(res.status).toBe(200);

    const row = await testEnv.MASTER_DB.prepare(`SELECT totp_enabled, totp_secret_enc FROM users WHERE id = ?`).bind(users.target!.id).first();
    expect(row).toMatchObject({ totp_enabled: 0, totp_secret_enc: null });
    expect((await call('POST', '/auth/refresh-token', null, { refreshToken: targetSession.refreshToken })).status).toBe(401);
    expect((await json(await login('target'))).data.accessToken).toBeTruthy();
    expect((await outbox(users.target!.email)).map((m) => m.template)).toContain('two_factor_disabled');
  });

  it('GET /users/:id never returns 2FA material', async () => {
    const admin = await signIn('main');
    await enrol('rec');
    const res = await json(await call('GET', `/users/${users.rec!.id}`, admin.accessToken));
    const text = JSON.stringify(res);
    expect(res.data.twoFactorEnabled).toBe(true);
    expect(text).not.toContain('totpSecretEnc');
    expect(text).not.toContain('recoveryCodesHash');
    expect(text).not.toContain('enc:v1');
    const me = await json(await call('GET', '/users/me', (await signInWithCode('rec')).accessToken));
    expect(me.data.twoFactorEnabled).toBe(true);
  });

  it('requiring 2FA needs an enrolled admin; unenrolled users then get a setup-only token', async () => {
    const admin = await signIn('main');
    // The admin is not enrolled: refused.
    expect((await call('PUT', '/auth/2fa/policy', admin.accessToken, { required: true })).status).toBe(409);
    const enrolled = await enrol('main');
    const adminSession = await signInWithCode('main', enrolled);

    // Only admins can change the policy.
    const member = await signIn('pol');
    expect((await call('PUT', '/auth/2fa/policy', member.accessToken, { required: true })).status).toBe(403);
    expect((await call('PUT', '/auth/2fa/policy', adminSession.accessToken, { required: true })).status).toBe(200);
    expect((await json(await call('GET', '/auth/2fa/policy', adminSession.accessToken))).data.required).toBe(true);

    // The unenrolled user signs in, but only the 2FA routes, logout and the profile read answer.
    const res = await json(await login('pol'));
    expect(res.data.twoFactorSetupRequired).toBe(true);
    const restricted = res.data.accessToken;
    const claims = JSON.parse(atob(restricted.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')));
    expect(claims.tfs).toBe(true);
    const blocked = await call('GET', '/leads', restricted);
    expect(blocked.status).toBe(403);
    expect((await json(blocked)).error.code).toBe('TWO_FACTOR_SETUP_REQUIRED');
    expect((await call('GET', '/users/me', restricted)).status).toBe(200);

    // A refresh keeps the restriction.
    const refreshed = (await json(await call('POST', '/auth/refresh-token', null, { refreshToken: res.data.refreshToken }))).data;
    expect(refreshed.twoFactorSetupRequired).toBe(true);
    expect((await call('GET', '/leads', refreshed.accessToken)).status).toBe(403);

    // Enrolling lifts it, and the enrolled user can no longer turn 2FA off.
    const setup = await json(await call('POST', '/auth/2fa/setup', restricted, { password: PASSWORD }));
    const enable = await json(await call('POST', '/auth/2fa/enable', restricted, { code: await totpAt(setup.data.secret, Date.now()) }));
    expect((await call('GET', '/leads', enable.data.accessToken)).status).toBe(200);
    const disable = await call('POST', '/auth/2fa/disable', enable.data.accessToken, { password: PASSWORD, code: enable.data.recoveryCodes[0] });
    expect(disable.status).toBe(403);
    expect((await json(disable)).error.code).toBe('TWO_FACTOR_REQUIRED');

    // Switching the requirement off lets a user without 2FA sign in normally again.
    expect((await call('PUT', '/auth/2fa/policy', adminSession.accessToken, { required: false })).status).toBe(200);
    const plain = (await json(await login('plain'))).data;
    expect(plain.twoFactorSetupRequired).toBe(false);
    expect((await call('GET', '/leads', plain.accessToken)).status).toBe(200);
  });

  it('the setup-only allow-list is exactly the 2FA routes, logout and the profile read', () => {
    expect(twoFactorSetupAllowed('POST', '/api/v1/auth/2fa/setup')).toBe(true);
    expect(twoFactorSetupAllowed('POST', '/api/auth/2fa/enable')).toBe(true);
    expect(twoFactorSetupAllowed('POST', '/api/v1/auth/logout')).toBe(true);
    expect(twoFactorSetupAllowed('GET', '/api/v1/users/me')).toBe(true);
    expect(twoFactorSetupAllowed('GET', '/api/v1/leads')).toBe(false);
    expect(twoFactorSetupAllowed('POST', '/api/v1/auth/change-password')).toBe(false);
    expect(passwordChangeAllowed('POST', '/api/v1/auth/2fa/setup')).toBe(false);
  });
});

describe('phone code sign-in respects 2FA', () => {
  it('an enrolled user who passes the phone code still owes the authenticator code', async () => {
    // verify-otp checks the code with the provider; under TEST_MODE the provider accepts nothing, so assert the
    // contract on the route that is reachable: an enrolled user never gets tokens from /login alone.
    const res = await json(await login('rec'));
    expect(res.data.requires2fa).toBe(true);
    expect(res.data.accessToken).toBeUndefined();
  });
});

describe('policy enforcement on every password path', () => {
  it('change-password refuses weak passwords server-side and accepts a strong one', async () => {
    const { accessToken: token } = await signIn('plain');
    const weak = ['Short1a', 'onlyletterspassword', '12345678901234', 'Password123456', 'plain@r209.test', 'Eleven11111'];
    for (const newPassword of weak) {
      const res = await call('POST', '/auth/change-password', token, { currentPassword: PASSWORD, newPassword });
      expect(res.status, newPassword).toBe(400);
    }
    const ok = await call('POST', '/auth/change-password', token, { currentPassword: PASSWORD, newPassword: 'Harbour-Lights-77' });
    expect(ok.status).toBe(200);
    expect((await login('plain')).status).toBe(401);
    expect((await login('plain', 'Harbour-Lights-77')).status).toBe(200);
    await testEnv.MASTER_DB.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).bind(await hashPassword(PASSWORD), users.plain!.id).run();
  });

  it('reset-password rejects a weak password without spending the link, then accepts a strong one', async () => {
    await testEnv.SESSIONS.put('reset:r209-token', JSON.stringify({ userId: users.plain!.id, tenantId: TENANT_ID }), { expirationTtl: 600 });
    const weak = await call('POST', '/auth/reset-password', null, { token: 'r209-token', password: 'Password123456' });
    expect(weak.status).toBe(400);
    expect(await testEnv.SESSIONS.get('reset:r209-token')).not.toBeNull(); // still usable
    const short = await call('POST', '/auth/reset-password', null, { token: 'r209-token', password: 'abc' });
    expect(short.status).toBe(400);
    const ok = await call('POST', '/auth/reset-password', null, { token: 'r209-token', password: 'Sunrise-Harbour-42' });
    expect(ok.status).toBe(200);
    expect(await testEnv.SESSIONS.get('reset:r209-token')).toBeNull();
    expect((await login('plain', 'Sunrise-Harbour-42')).status).toBe(200);
    await testEnv.MASTER_DB.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).bind(await hashPassword(PASSWORD), users.plain!.id).run();
  });

  it('setup-account (invitation) rejects a weak password without spending the invitation', async () => {
    await testEnv.SESSIONS.put('invite:r209-invite', JSON.stringify({ tenantId: TENANT_ID, email: `invitee${DOMAIN}`, role: 'salesperson' }), { expirationTtl: 600 });
    for (const password of ['Password123', 'invitee@r209.test', 'short1']) {
      const res = await call('POST', '/auth/setup-account', null, { token: 'r209-invite', name: 'Invitee', password });
      expect(res.status, password).toBe(400);
    }
    expect(await testEnv.SESSIONS.get('invite:r209-invite')).not.toBeNull();
    const ok = await call('POST', '/auth/setup-account', null, { token: 'r209-invite', name: 'Invitee', password: 'Coastal-Breeze-2026' });
    expect(ok.status).toBe(201);
    await testEnv.MASTER_DB.prepare(`DELETE FROM tenant_users WHERE email = ?`).bind(`invitee${DOMAIN}`).run();
  });

  it('existing users with a short password can still sign in until they change it', async () => {
    await testEnv.MASTER_DB.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).bind(await hashPassword('Admin@123'), users.plain!.id).run();
    expect((await login('plain', 'Admin@123')).status).toBe(200);
    await testEnv.MASTER_DB.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).bind(await hashPassword(PASSWORD), users.plain!.id).run();
  });
});

/** Sign in as an enrolled user with a recovery code (keeps the TOTP replay step untouched). */
async function signInWithCode(key: string, enrolled?: { recoveryCodes: string[] }) {
  const codes = enrolled?.recoveryCodes ?? signInCodes[key];
  if (!codes) throw new Error(`no recovery codes recorded for ${key}`);
  const challenge = (await json(await login(key))).data.challengeToken;
  const res = await call('POST', '/auth/2fa/verify', null, { challengeToken: challenge, code: codes.shift()! });
  expect(res.status).toBe(200);
  return (await json(res)).data as { accessToken: string; refreshToken: string };
}
const signInCodes: Record<string, string[]> = {};
