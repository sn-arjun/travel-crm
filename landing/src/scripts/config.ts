/** Owner values from /config.js (window.TRAVELCRM_CONFIG) and the cookie notice. Empty values switch a feature off. */
export interface SiteConfig {
  domain?: string; apiBase?: string; siteUrl?: string; contactEmail?: string; whatsappNumber?: string; demoVideoUrl?: string;
  appDownloadUrl?: string; turnstileSiteKey?: string; city?: string; legalEntity?: string; senderEmail?: string;
}
export const CONFIG: SiteConfig = (window as unknown as { TRAVELCRM_CONFIG?: SiteConfig }).TRAVELCRM_CONFIG || {};
export const apiBase = () => String(CONFIG.apiBase || '').replace(/\/+$/, '');

export function initConfig() {
  const C = CONFIG as Record<string, string | undefined>;
  document.querySelectorAll<HTMLElement>('[data-config]').forEach((el) => {
    const v = C[el.dataset.config!];
    if (v) { el.textContent = v; el.classList.remove('todo'); }
  });
  document.querySelectorAll<HTMLElement>('[data-config-show]').forEach((el) => {
    const key = el.dataset.configShow!;
    if (!C[key]) return;
    if (el instanceof HTMLAnchorElement && key === 'demoVideoUrl') { el.href = C[key]!; el.target = '_blank'; el.rel = 'noopener'; }
    el.hidden = false;
  });
  document.querySelectorAll<HTMLElement>('[data-config-mailto]').forEach((el) => {
    const v = C[el.dataset.configMailto!];
    if (v) el.setAttribute('href', 'mailto:' + v);
  });
  const wa = document.getElementById('whatsapp-btn') as HTMLAnchorElement | null;
  if (wa && /^\d{8,15}$/.test(String(CONFIG.whatsappNumber || ''))) {
    wa.href = 'https://wa.me/' + CONFIG.whatsappNumber + '?text=' + encodeURIComponent('Hi, I would like a demo of TravelCRM Pro');
    wa.hidden = false;
  }

  // Cookie notice (R208): the site sets no tracking cookies. Shown until dismissed; the choice lives in localStorage.
  const KEY = 'cookie-notice-dismissed';
  const box = document.getElementById('cookie-notice');
  const btn = document.getElementById('cookie-notice-dismiss');
  if (box && btn) {
    let dismissed = false;
    try { dismissed = localStorage.getItem(KEY) === '1'; } catch { /* storage blocked: show the notice each visit */ }
    if (!dismissed) {
      box.hidden = false;
      btn.addEventListener('click', () => {
        box.hidden = true;
        try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ }
      });
    }
  }
}
