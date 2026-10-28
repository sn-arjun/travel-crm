/**
 * The boarding pass is the demo form. It posts to POST /api/v1/public/enquiries (backend/src/routes/public-enquiries.ts,
 * enquirySchema: name and email are required) and stamps BOOKED when the API answers 202.
 * Turnstile is used only when the owner set turnstileSiteKey in /config.js.
 */
import { CONFIG, apiBase } from './config';

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, o: Record<string, unknown>) => void; reset: () => void };
    onTravelcrmTurnstile?: () => void;
  }
}

export function initPass() {
  const form = document.getElementById('enquiry-form') as HTMLFormElement | null;
  if (!form) return;
  const errorBox = document.getElementById('enquiry-error')!;
  const success = document.getElementById('enquiry-success')!;
  const stamp = document.getElementById('pass-stamp')!;
  const btn = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const nameOut = document.getElementById('pass-name')!;
  const nameIn = document.getElementById('f-name') as HTMLInputElement;
  let token = '';

  nameIn.addEventListener('input', () => { nameOut.textContent = (nameIn.value.trim() || 'Your name').toUpperCase(); });

  // Demo days: the next five weekdays, in the visitor's own language.
  const day = form.querySelector<HTMLSelectElement>('select[name="day"]');
  if (day) {
    const d = new Date();
    const opts: string[] = [];
    while (opts.length < 5) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() !== 0 && d.getDay() !== 6) opts.push(d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }));
    }
    day.innerHTML = '';
    opts.forEach((o) => day.add(new Option(o, o)));
  }

  if (CONFIG.turnstileSiteKey) {
    const slot = document.getElementById('turnstile-slot')!;
    slot.hidden = false;
    window.onTravelcrmTurnstile = () => {
      window.turnstile!.render(slot, {
        sitekey: CONFIG.turnstileSiteKey,
        callback: (t: string) => { token = t; },
        'expired-callback': () => { token = ''; },
        'error-callback': () => { token = ''; },
      });
    };
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTravelcrmTurnstile';
    s.async = true;
    s.defer = true;
    document.head.appendChild(s);
  }

  const showError = (msg: string, field?: string) => {
    errorBox.textContent = msg;
    errorBox.hidden = false;
    if (field) {
      const el = form.querySelector<HTMLElement>(`[name="${field}"]`);
      if (el) { el.setAttribute('aria-invalid', 'true'); el.focus(); }
    }
  };

  // Every "Book a demo" link scrolls here and focuses the first field.
  document.querySelectorAll<HTMLAnchorElement>('a[href$="#enquire"]').forEach((a) => {
    if (new URL(a.href).pathname !== location.pathname) return;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('enquire')!.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.setTimeout(() => { try { nameIn.focus({ preventScroll: true }); } catch { nameIn.focus(); } }, 450);
      history.replaceState?.(null, '', '#enquire');
    });
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    errorBox.hidden = true;
    errorBox.textContent = '';
    form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
    const data = new FormData(form);
    const get = (k: string) => String(data.get(k) || '').trim();
    const name = get('name');
    const email = get('email');
    if (!name) return showError('Please enter your name.', 'name');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError('Please enter a valid email address.', 'email');
    if (CONFIG.turnstileSiteKey && !token) return showError('Please complete the verification first.');

    const message = [
      get('from') && `Works today in: ${get('from')}`,
      get('day') && `Preferred demo day: ${get('day')}`,
      get('message'),
    ].filter(Boolean).join('\n');
    const body = {
      kind: 'demo',
      name,
      email,
      phone: get('phone'),
      company: get('company'),
      country: get('country'),
      agentsCount: get('agentsCount'),
      message,
      sourceUrl: location.origin + location.pathname,
      website: String(data.get('website') || ''),
      turnstileToken: token,
    };

    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    fetch(apiBase() + '/api/v1/public/enquiries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(async (res) => {
        if (res.status === 202) {
          stamp.hidden = false;
          form.classList.add('is-booked');
          btn.textContent = 'Pass issued ✓';
          success.hidden = false;
          success.focus();
          return;
        }
        const j = await res.json().catch(() => ({}));
        if (res.status === 429) return showError('Too many requests from this device or email. We already have your details and will be in touch.');
        if (res.status === 413) return showError('That message is too long. Please shorten it.');
        const field = j && j.fields ? Object.keys(j.fields)[0] : undefined;
        showError((j && j.error) || 'Something went wrong. Please try again in a moment.', field);
      })
      .catch(() => {
        showError('We could not reach the server. Please check your connection and try again, or email us at ' + (CONFIG.contactEmail || 'the address in the footer') + '.');
      })
      .finally(() => {
        if (!form.classList.contains('is-booked')) btn.disabled = false;
        btn.removeAttribute('aria-busy');
        if (window.turnstile && CONFIG.turnstileSiteKey && !form.classList.contains('is-booked')) { token = ''; try { window.turnstile.reset(); } catch { /* ignore */ } }
      });
  });
}
