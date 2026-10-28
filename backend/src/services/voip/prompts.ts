/**
 * Everything a caller hears from the platform, in the agency's language (R137).
 *
 * The prompts used to be inline English strings in routes/voip-callbacks.ts and in the TwiML generators of the Twilio
 * adapter. They live here now, in English and Dutch, each language with the voice and language code the provider needs
 * (Twilio <Say voice= language=>). The agency language is its settings key `default_language` (English when unset or not
 * one we have prompts for). The agency's own texts (recording announcement, IVR greeting, voicemail greeting) still win;
 * they are spoken with the agency language's voice.
 *
 * Adding a language is data: one entry in PROMPTS and one in PROMPT_VOICES.
 *
 * Dutch wording is machine-made and needs a native review before a Dutch agency relies on it (docs/i18n/NL-REVIEW.md).
 */

import { escapeXml } from '../voip-base';

export type PromptLanguage = 'en' | 'nl';
export const PROMPT_LANGUAGES: readonly PromptLanguage[] = ['en', 'nl'];
export const DEFAULT_PROMPT_LANGUAGE: PromptLanguage = 'en';

export const PROMPT_VOICES: Record<PromptLanguage, { voice: string; language: string }> = {
  en: { voice: 'Polly.Joanna', language: 'en-US' },
  nl: { voice: 'Polly.Lotte', language: 'nl-NL' },
};

export type PromptKey =
  | 'unavailable' // the agency has no calling set up
  | 'hold' // IVR without a menu: connecting
  | 'leaveMessage' // voicemail greeting when the agency has no recorded one
  | 'unreachable' // nobody answered (fallback markup)
  | 'goodbye' // after a voicemail
  | 'nobodyAvailable' // nobody answered and voicemail is off
  | 'recordingAnnouncement' // the default recording notice
  | 'ivrWelcome'
  | 'ivrSelect'
  | 'ivrInvalid'
  | 'ivrNoInput'
  | 'ivrPress'; // {digit} {label}

export const PROMPTS: Record<PromptLanguage, Record<PromptKey, string>> = {
  en: {
    unavailable: "We're sorry, this service is not currently available. Please try again later.",
    hold: 'Please hold while we connect you.',
    leaveMessage: 'Please leave a message after the beep.',
    unreachable: 'The person you are trying to reach is unavailable. Please leave a message after the beep.',
    goodbye: 'Thank you for your message. Goodbye.',
    nobodyAvailable: 'Nobody is available to take your call right now. Please try again later.',
    recordingAnnouncement: 'This call may be recorded for quality and training purposes.',
    ivrWelcome: 'Welcome. Please select an option.',
    ivrSelect: 'Please select an option.',
    ivrInvalid: 'Invalid selection.',
    ivrNoInput: "We didn't receive any input. Goodbye.",
    ivrPress: 'Press {digit} for {label}.',
  },
  nl: {
    unavailable: 'Het spijt ons, deze dienst is momenteel niet beschikbaar. Probeer het later opnieuw.',
    hold: 'Een ogenblik geduld, we verbinden u door.',
    leaveMessage: 'Laat een bericht achter na de piep.',
    unreachable: 'De persoon die u probeert te bereiken is niet beschikbaar. Laat een bericht achter na de piep.',
    goodbye: 'Bedankt voor uw bericht. Tot ziens.',
    nobodyAvailable: 'Er is op dit moment niemand beschikbaar om uw oproep aan te nemen. Probeer het later opnieuw.',
    recordingAnnouncement: 'Dit gesprek kan worden opgenomen voor kwaliteits- en trainingsdoeleinden.',
    ivrWelcome: 'Welkom. Maak een keuze.',
    ivrSelect: 'Maak een keuze.',
    ivrInvalid: 'Ongeldige keuze.',
    ivrNoInput: 'We hebben geen invoer ontvangen. Tot ziens.',
    ivrPress: 'Druk op {digit} voor {label}.',
  },
};

/** 'nl', 'NL', 'nl-NL' and 'nl_BE' are Dutch; anything else we have no prompts for is English. */
export function resolvePromptLanguage(value: string | null | undefined): PromptLanguage {
  const base = (value ?? '').trim().toLowerCase().split(/[-_]/)[0];
  return PROMPT_LANGUAGES.find((l) => l === base) ?? DEFAULT_PROMPT_LANGUAGE;
}

/** The agency's prompt language: its `default_language` setting, else English. */
export async function agencyPromptLanguage(db: D1Database): Promise<PromptLanguage> {
  try {
    const row = await db.prepare(`SELECT value FROM settings WHERE key = 'default_language'`).first<{ value: string | null }>();
    return resolvePromptLanguage(row?.value);
  } catch {
    return DEFAULT_PROMPT_LANGUAGE;
  }
}

/** The text of one prompt, with {name} placeholders filled. */
export function promptText(language: PromptLanguage, key: PromptKey, vars: Record<string, string> = {}): string {
  const text = PROMPTS[language]?.[key] ?? PROMPTS[DEFAULT_PROMPT_LANGUAGE][key];
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? vars[name] : whole));
}

/** ` voice="..." language="..."` for a <Say>. */
export function voiceAttributes(language: PromptLanguage): string {
  const v = PROMPT_VOICES[language] ?? PROMPT_VOICES[DEFAULT_PROMPT_LANGUAGE];
  return ` voice="${v.voice}" language="${v.language}"`;
}

/**
 * The attributes the provider's markup generators put on a <Say>. English (and no language at all) keeps the plain
 * <Say> of before R137, spoken in the account's default English voice; every other language names its voice, because
 * the default voice would read Dutch with an English accent.
 */
export function sayAttributes(language: PromptLanguage | undefined): string {
  return language && language !== DEFAULT_PROMPT_LANGUAGE ? voiceAttributes(language) : '';
}

/** A complete <Say> element with the language's voice, text escaped. */
export function sayElement(language: PromptLanguage, text: string): string {
  return `<Say${voiceAttributes(language)}>${escapeXml(text)}</Say>`;
}
