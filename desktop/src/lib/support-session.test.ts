import { describe, it, expect } from 'vitest';
import { readSupportSession } from './support-session';

function token(claims: Record<string, unknown>): string {
  const enc = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${enc({ alg: 'HS256' })}.${enc(claims)}.signature`;
}

describe('readSupportSession', () => {
  it('reads the imp, impName, sid and exp claims', () => {
    const session = readSupportSession(token({ imp: 'admin-1', impName: 'Asha Rao', sid: 'sess-1', tenantId: 't-1', exp: 1_800_000_000 }));
    expect(session).toEqual({ name: 'Asha Rao', tenantId: 't-1', sessionId: 'sess-1', expiresAt: 1_800_000_000_000 });
  });

  it('returns null for a normal agency token', () => {
    expect(readSupportSession(token({ userId: 'u1', tenantId: 't1', exp: 1_800_000_000 }))).toBeNull();
  });

  it('falls back to a generic name when impName is missing', () => {
    expect(readSupportSession(token({ imp: 'admin-1', sid: 's' }))?.name).toBe('support');
  });

  it('returns null for missing or malformed tokens', () => {
    expect(readSupportSession(null)).toBeNull();
    expect(readSupportSession('')).toBeNull();
    expect(readSupportSession('not-a-token')).toBeNull();
    expect(readSupportSession('a.b.c')).toBeNull();
  });
});
