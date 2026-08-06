import { describe, it, expect } from 'vitest';
import { hashPassword, comparePassword } from '../../src/utils/password';

describe('hashPassword', () => {
  it('should return a string', async () => {
    const hash = await hashPassword('password123');
    expect(typeof hash).toBe('string');
  });

  it('should return a bcrypt hash starting with $2a$ or $2b$', async () => {
    const hash = await hashPassword('password123');
    expect(hash).toMatch(/^\$2[ab]\$/);
  });

  it('should produce a 60-character hash', async () => {
    const hash = await hashPassword('password123');
    expect(hash.length).toBe(60);
  });

  it('should produce different hashes for the same input (salt)', async () => {
    const hash1 = await hashPassword('password123');
    const hash2 = await hashPassword('password123');
    expect(hash1).not.toBe(hash2);
  });

  it('should produce different hashes for different inputs', async () => {
    const hash1 = await hashPassword('password123');
    const hash2 = await hashPassword('differentpassword');
    expect(hash1).not.toBe(hash2);
  });
});

describe('comparePassword', () => {
  it('should return true for correct password', async () => {
    const hash = await hashPassword('mypassword');
    const result = await comparePassword('mypassword', hash);
    expect(result).toBe(true);
  });

  it('should return false for incorrect password', async () => {
    const hash = await hashPassword('mypassword');
    const result = await comparePassword('wrongpassword', hash);
    expect(result).toBe(false);
  });

  it('should return false for empty password against valid hash', async () => {
    const hash = await hashPassword('mypassword');
    const result = await comparePassword('', hash);
    expect(result).toBe(false);
  });

  it('should handle special characters in password', async () => {
    const password = 'p@$$w0rd!#%^&*()';
    const hash = await hashPassword(password);
    const result = await comparePassword(password, hash);
    expect(result).toBe(true);
  });

  it('should handle unicode characters in password', async () => {
    const password = 'p\u00e4ssw\u00f6rd\u00fc';
    const hash = await hashPassword(password);
    const result = await comparePassword(password, hash);
    expect(result).toBe(true);
  });

  it('should be case sensitive', async () => {
    const hash = await hashPassword('Password');
    const result = await comparePassword('password', hash);
    expect(result).toBe(false);
  });

  it('should handle very long passwords', async () => {
    const longPassword = 'a'.repeat(200);
    const hash = await hashPassword(longPassword);
    const result = await comparePassword(longPassword, hash);
    expect(result).toBe(true);
  });
});
