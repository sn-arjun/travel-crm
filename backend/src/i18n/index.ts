import { en, type MessageKey } from './en';
import { nl } from './nl';

export type { MessageKey } from './en';

/** Interface languages the product knows. Backend documents are written in English and Dutch; the rest fall back to English. */
export const UI_LANGUAGES = ['en', 'hi', 'ar', 'nl'] as const;
export type UiLanguage = (typeof UI_LANGUAGES)[number];

/** Languages the backend has its own document texts for. */
export type TextLanguage = 'en' | 'nl';

const CATALOGUES: Record<TextLanguage, Record<MessageKey, string>> = { en, nl };

export function isUiLanguage(value: unknown): value is UiLanguage {
  return typeof value === 'string' && (UI_LANGUAGES as readonly string[]).includes(value);
}

/** The text language for any stored language code: nl stays nl, everything else reads English. */
export function textLanguage(value: unknown): TextLanguage {
  return value === 'nl' ? 'nl' : 'en';
}

/** Recipient's own language when it is en or nl, else the agency default when it is en or nl, else English. */
export function pickLanguage(userLanguage: unknown, agencyDefault: unknown): TextLanguage {
  if (userLanguage === 'en' || userLanguage === 'nl') return userLanguage;
  if (agencyDefault === 'en' || agencyDefault === 'nl') return agencyDefault;
  return 'en';
}

function pluralCategory(lang: TextLanguage, count: number): string {
  try {
    return new Intl.PluralRules(lang).select(count);
  } catch {
    return count === 1 ? 'one' : 'other';
  }
}

export type MessageVars = Record<string, string | number>;

/**
 * The text for `key` in `lang` (English when the language has none, the key when nobody has it), with `{name}`
 * placeholders replaced from `vars`. When `vars.count` is a number, `key_one` / `key_other` are tried first.
 */
export function t(lang: string | null | undefined, key: MessageKey | string, vars?: MessageVars): string {
  const own = CATALOGUES[textLanguage(lang)] as Record<string, string>;
  const english = en as Record<string, string>;
  const candidates = [key];
  if (vars && typeof vars.count === 'number') candidates.unshift(`${key}_${pluralCategory(textLanguage(lang), vars.count)}`, `${key}_other`);
  let template: string | undefined;
  for (const source of [own, english]) {
    for (const k of candidates) {
      if (typeof source[k] === 'string') {
        template = source[k];
        break;
      }
    }
    if (template !== undefined) break;
  }
  const text = template ?? key;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

/** The agency's `default_language` setting when it is en or nl, else English. Never throws. */
export async function agencyDefaultLanguage(db: D1Database): Promise<TextLanguage> {
  try {
    const row = await db.prepare(`SELECT value FROM settings WHERE key = 'default_language'`).first<{ value: string | null }>();
    return textLanguage(row?.value);
  } catch {
    return 'en';
  }
}

/** The language a system email to `email` is written in: see pickLanguage. Never throws. */
export async function emailLanguage(db: D1Database, email: string): Promise<TextLanguage> {
  try {
    const user = await db
      .prepare(`SELECT language FROM users WHERE lower(email) = lower(?)`)
      .bind(email)
      .first<{ language: string | null }>();
    const agency = await db.prepare(`SELECT value FROM settings WHERE key = 'default_language'`).first<{ value: string | null }>();
    return pickLanguage(user?.language, agency?.value);
  } catch {
    return 'en';
  }
}
