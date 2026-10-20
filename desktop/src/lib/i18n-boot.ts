/**
 * Server-safe pieces of the interface-language setup (no React, no catalogues), used by the root layout.
 * Kept apart from lib/i18n.ts, which is a client module and cannot be called while the layout renders.
 */

export const LOCALE_STORAGE_KEY = 'travelcrm.uiLanguage';

/** Languages written right to left. A test keeps this in step with LANGUAGES in lib/i18n.ts. */
export const RTL_LOCALES: readonly string[] = ['ar'];

/**
 * Inline script for <head>: copies the language saved on this device to <html lang dir> before the first paint.
 * Only right-to-left languages need it (English is the server render); everything else is the provider's job.
 */
export function bootLanguageScript(): string {
  return (
    '(function(){try{var l=window.localStorage.getItem(' +
    JSON.stringify(LOCALE_STORAGE_KEY) +
    ');if(' +
    JSON.stringify(RTL_LOCALES) +
    '.indexOf(l)>-1){var h=document.documentElement;h.lang=l;h.dir="rtl";}}catch(e){}})();'
  );
}
