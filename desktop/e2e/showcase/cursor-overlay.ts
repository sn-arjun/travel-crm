/**
 * Init script injected into every page of a showcase context (STORYBOARD D.3 / D.4).
 *
 * Self-contained on purpose: Playwright serialises the function and runs it in the page before any app script.
 * Everything lives under <html> (not <body>) so React hydration never touches it, and a MutationObserver
 * re-attaches it if anything removes it. No overlay element ever takes pointer events.
 *
 * Exposes window.__sc = { card(opts), hideCard(), say(text, kicker?), clearSay(), hide(), show() }.
 */
export function cursorOverlayInit(): void {
  const w = window as any;
  if (w.__scInstalled) return;
  w.__scInstalled = true;

  const CSS = `
#sc-root{position:fixed;inset:0;pointer-events:none;z-index:2147483647}
#sc-root *{pointer-events:none!important}
html[data-sc-hidden] #sc-root{visibility:hidden}
#sc-cursor{position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;will-change:transform;
  filter:drop-shadow(0 2px 4px rgba(0,0,0,.35));display:none}
html[data-sc-card] #sc-cursor{display:none!important}
.sc-ripple{position:fixed;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;box-sizing:border-box;
  border:2px solid #4F46E5;background:rgba(79,70,229,.25);animation:scRipple .45s ease-out forwards}
@keyframes scRipple{from{transform:scale(1);opacity:.9}to{transform:scale(3.2);opacity:0}}
#sc-caption{position:fixed;left:64px;bottom:64px;max-width:1100px;box-sizing:border-box;
  background:rgba(17,17,23,.86);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
  border-radius:14px;padding:14px 28px 16px 24px;border-left:6px solid #4F46E5;
  box-shadow:0 12px 40px rgba(0,0,0,.35);font-family:'DM Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;
  opacity:0;transform:translateY(8px);transition:opacity .25s ease,transform .25s ease;z-index:2147483646}
#sc-caption.on{opacity:1;transform:none}
#sc-caption.off{opacity:0;transition:opacity .2s ease}
#sc-caption .k{font-size:14px;letter-spacing:.2em;text-transform:uppercase;color:#A5B4FC;font-weight:600;margin-bottom:6px}
#sc-caption .t{font-size:28px;line-height:1.35;font-weight:600;color:#fff}
#sc-card{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
  background:linear-gradient(135deg,#1E1B4B 0%,#312E81 55%,#4F46E5 100%);color:#fff;text-align:center;
  font-family:'DM Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;opacity:0;transition:opacity .3s ease;z-index:2147483645}
#sc-card::before{content:'';position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.06) 1.5px,transparent 1.5px);background-size:32px 32px}
#sc-card.on{opacity:1}
#sc-card .k{position:relative;font-size:18px;letter-spacing:.32em;text-transform:uppercase;color:#C7D2FE;margin-bottom:22px;font-weight:600}
#sc-card .t{position:relative;font-size:72px;font-weight:700;letter-spacing:-.02em;line-height:1.1;max-width:1400px}
#sc-card .s{position:relative;font-size:28px;color:#E0E7FF;margin-top:20px;max-width:60ch;line-height:1.4}
#sc-card .brand{position:absolute;left:64px;bottom:56px;display:flex;align-items:center;gap:14px;font-size:16px;color:#C7D2FE}
#sc-card .mono{width:40px;height:40px;border-radius:10px;background:#4F46E5;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px}
`;

  const ARROW =
    '<svg width="26" height="26" viewBox="0 0 26 26" xmlns="http://www.w3.org/2000/svg"><path d="M3 2 L3 20 L8 15.5 L11.6 23 L14.6 21.7 L11 14.3 L18 14.3 Z" fill="#FFFFFF" stroke="#111117" stroke-width="1.5" stroke-linejoin="round"/></svg>';

  let root: HTMLElement | null = null;
  let cursor: HTMLElement | null = null;
  let last = { x: -100, y: -100, seen: false };
  try {
    const raw = sessionStorage.getItem('__sc_xy');
    if (raw) { const p = JSON.parse(raw); last = { x: p.x, y: p.y, seen: true }; }
  } catch { /* storage may be unavailable */ }

  function place() {
    if (!cursor) return;
    cursor.style.transform = `translate(${last.x - 3}px, ${last.y - 2}px)`;
    cursor.style.display = last.seen ? 'block' : 'none';
  }

  function ensure() {
    const html = document.documentElement;
    if (!html) return;
    if (!document.getElementById('sc-style')) {
      const st = document.createElement('style');
      st.id = 'sc-style';
      st.textContent = CSS;
      html.appendChild(st);
    }
    if (!root || !root.isConnected) {
      root = document.createElement('div');
      root.id = 'sc-root';
      cursor = document.createElement('div');
      cursor.id = 'sc-cursor';
      cursor.innerHTML = ARROW;
      root.appendChild(cursor);
      html.appendChild(root);
      place();
    }
  }

  function boot() {
    if (!document.documentElement) {
      // init scripts can run before the root element exists
      const early = new MutationObserver(() => { if (document.documentElement) { early.disconnect(); boot(); } });
      early.observe(document, { childList: true });
      return;
    }
    ensure();
    new MutationObserver(() => {
      if (!root || !root.isConnected || !document.getElementById('sc-style')) ensure();
    }).observe(document.documentElement, { childList: true });
  }
  boot();
  document.addEventListener('DOMContentLoaded', ensure);

  document.addEventListener('mousemove', (e) => {
    last = { x: e.clientX, y: e.clientY, seen: true };
    place();
    try { sessionStorage.setItem('__sc_xy', JSON.stringify({ x: last.x, y: last.y })); } catch { /* ignore */ }
  }, true);

  document.addEventListener('mousedown', (e) => {
    ensure();
    const r = document.createElement('div');
    r.className = 'sc-ripple';
    r.style.left = `${e.clientX}px`;
    r.style.top = `${e.clientY}px`;
    root!.appendChild(r);
    setTimeout(() => r.remove(), 500);
  }, true);

  function mk(id: string, cls: string): HTMLElement {
    ensure();
    let el = document.getElementById(id);
    if (!el) { el = document.createElement('div'); el.id = id; document.documentElement.appendChild(el); }
    el.className = cls;
    return el;
  }
  function esc(s: string): string {
    return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
  }

  w.__sc = {
    say(text: string, kicker?: string) {
      const el = mk('sc-caption', '');
      el.innerHTML = (kicker ? `<div class="k">${esc(kicker)}</div>` : '') + `<div class="t">${esc(text)}</div>`;
      void el.offsetWidth;
      el.className = 'on';
    },
    clearSay() {
      const el = document.getElementById('sc-caption');
      if (!el) return;
      el.className = 'off';
      setTimeout(() => { if (el.className === 'off') el.remove(); }, 260);
    },
    card(o: { kicker?: string; title: string; subtitle?: string }) {
      const el = mk('sc-card', '');
      el.innerHTML =
        (o.kicker ? `<div class="k">${esc(o.kicker)}</div>` : '') + `<div class="t">${esc(o.title)}</div>` +
        (o.subtitle ? `<div class="s">${esc(o.subtitle)}</div>` : '') +
        '<div class="brand"><div class="mono">SH</div><div>Sahyadri Holidays · powered by TravelCRM Pro</div></div>';
      document.documentElement.setAttribute('data-sc-card', '1');
      void el.offsetWidth;
      el.className = 'on';
    },
    hideCard() {
      const el = document.getElementById('sc-card');
      document.documentElement.removeAttribute('data-sc-card');
      if (!el) return;
      el.className = '';
      setTimeout(() => { if (el.className === '') el.remove(); }, 340);
    },
    hide() { document.documentElement.setAttribute('data-sc-hidden', '1'); document.getElementById('sc-caption')?.setAttribute('style', 'visibility:hidden'); document.getElementById('sc-card')?.setAttribute('style', 'visibility:hidden'); },
    show() { document.documentElement.removeAttribute('data-sc-hidden'); document.getElementById('sc-caption')?.removeAttribute('style'); document.getElementById('sc-card')?.removeAttribute('style'); },
  };
}
