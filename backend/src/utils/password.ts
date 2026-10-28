import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ============================================================
// Password policy (R209)
// ============================================================

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/** Passwords that top the breach lists, lowercase. A password is also refused when it is one of these plus trailing digits or symbols. */
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'passw0rd', 'p@ssw0rd', 'p@ssword', 'letmein', 'welcome', 'welcome1', 'admin', 'administrator',
  'qwerty', 'qwertyuiop', 'qwerty123', 'asdfghjkl', 'zxcvbnm', 'iloveyou', 'monkey', 'dragon', 'football', 'baseball',
  'abc123', 'abcdefgh', 'abcdefghij', 'abcdefghijkl', 'trustno1', 'sunshine', 'princess', 'master', 'shadow', 'superman',
  'batman', 'login', 'changeme', 'changeme123', 'default', 'secret', 'passpass', 'travel', 'travelcrm', 'travelcrmpro',
  'holiday', 'india', 'india123', 'whatever', 'freedom', 'starwars', 'hello123', 'summer', 'winter', 'spring', 'autumn',
  'internet', 'computer', 'michael', 'jennifer', 'charlie', 'donald', 'london', 'mumbai', 'delhi', 'newpassword',
  'mypassword', 'yourpassword', 'testtest', 'test1234', 'temp1234', 'temporary', 'adminadmin', 'rootroot',
  'qazwsx', 'qazwsxedc', '1q2w3e4r', '1qaz2wsx', 'zaq12wsx', 'passwordpassword',
]);

/**
 * The server-side password rule, used by change, reset, invitation acceptance and the first-login change:
 * 12 to 128 characters, at least one letter and one digit, not the account's email (or its local part), and not a
 * well-known password. Existing passwords are never re-checked; the rule applies when a password is next set.
 * Returns the message to show, or null when the password is acceptable.
 */
export function validatePassword(password: string, ctx: { email?: string | null } = {}): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  if (password.length > PASSWORD_MAX_LENGTH) return `Password must be at most ${PASSWORD_MAX_LENGTH} characters`;
  if (!/[A-Za-z]/.test(password)) return 'Password must contain at least one letter';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one digit';

  const lower = password.toLowerCase();
  const email = ctx.email?.trim().toLowerCase();
  if (email) {
    const local = email.split('@')[0] ?? '';
    if (lower === email || (local.length >= 6 && lower === local)) return 'Password must not be your email address';
  }
  const stripped = lower.replace(/[^a-z]+$/, '');
  if (COMMON_PASSWORDS.has(lower) || (stripped.length >= 5 && COMMON_PASSWORDS.has(stripped))) {
    return 'That password is too common. Choose something harder to guess';
  }
  // Runs like "aaaaaaaaaaaa1" or "123456789012a" carry almost no entropy.
  if (new Set(lower).size <= 3) return 'That password is too repetitive. Choose something harder to guess';
  return null;
}
