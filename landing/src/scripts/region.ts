/**
 * Market state for the whole page. Reads every market from #market-data, applies the chosen one to all
 * [data-bind] nodes, the region switches, the exchange board and the invoices, and remembers the choice.
 * On the home page (html[data-detect]) the first visit picks the market from the visitor's time zone.
 */
import { bindings, type MarketView } from './bind';

const KEY = 'travelcrm-market';
const listeners: ((m: MarketView) => void)[] = [];
let markets: Record<string, MarketView> = {};
let current = '';
/** Alternates between two identical keyframes so a new pick replays the flip animation. */
let alt = false;

export function onMarket(fn: (m: MarketView) => void) { listeners.push(fn); }
export function getMarket(): MarketView | undefined { return markets[current]; }
export function updateMarket(key: string, patch: Partial<MarketView>) {
  if (!markets[key]) return;
  markets[key] = { ...markets[key], ...patch };
  if (key === current) apply(key, false);
}

function fromTimeZone(): string {
  let tz = '';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { /* old browser */ }
  if (tz === 'Europe/London' || tz === 'Europe/Belfast' || tz === 'Europe/Jersey' || tz === 'Europe/Guernsey' || tz === 'Europe/Isle_of_Man') return 'UK';
  if (tz.startsWith('Europe/')) return 'EU';
  if (tz.startsWith('America/') || tz.startsWith('US/') || tz === 'Pacific/Honolulu') return 'US';
  if (tz.startsWith('Australia/') || tz === 'Pacific/Auckland' || tz === 'Pacific/Chatham') return 'AU';
  return 'IN';
}

function setTiles(el: HTMLElement, text: string, again: boolean) {
  el.textContent = '';
  [...text].forEach((c, i) => {
    const s = document.createElement('span');
    s.className = 'digit flip' + (again ? ' again' : '');
    s.style.animationDelay = i * 55 + 'ms';
    s.textContent = c;
    el.appendChild(s);
  });
}

function replay(el: Element) {
  el.classList.toggle('again');
}

function apply(key: string, animate: boolean) {
  const m = markets[key];
  if (!m) return;
  const prev = current;
  current = key;
  const b = bindings(m);
  if (animate) alt = !alt;
  const again = alt;
  document.querySelectorAll<HTMLElement>('[data-bind]').forEach((el) => {
    const v = b[el.dataset.bind!];
    if (v === undefined) return;
    if (el.hasAttribute('data-tiles')) { if (el.dataset.shown !== v) setTiles(el, v, again); el.dataset.shown = v; }
    else el.textContent = v;
  });
  document.querySelectorAll<HTMLElement>('[data-bind-label]').forEach((el) => {
    const v = b[el.dataset.bindLabel!];
    if (v !== undefined) el.setAttribute('aria-label', v);
  });
  document.querySelectorAll<HTMLElement>('[data-pick-market]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.pickMarket === key));
  });
  document.querySelectorAll<HTMLElement>('[data-market-panel]').forEach((p) => {
    const on = p.dataset.marketPanel === key;
    p.hidden = !on;
    if (on && animate && prev !== key) p.querySelectorAll('.flip, .stamp').forEach(replay);
  });
  if (animate && prev !== key) {
    document.querySelectorAll(`[data-pick-market="${key}"] .tile`).forEach((t) => {
      t.classList.remove('again'); void (t as HTMLElement).offsetWidth; t.classList.add('again');
    });
  }
  listeners.forEach((fn) => fn(m));
}

export function initRegion() {
  const data = document.getElementById('market-data');
  if (!data) return;
  try { markets = JSON.parse(data.textContent || '{}'); } catch { return; }
  const html = document.documentElement;
  const fallback = html.dataset.market || 'IN';
  let saved = '';
  try { saved = localStorage.getItem(KEY) || ''; } catch { /* storage blocked */ }
  let start = fallback;
  if (html.hasAttribute('data-detect')) start = markets[saved] ? saved : fromTimeZone();
  current = fallback;
  if (start !== fallback) apply(start, false);
  else listeners.forEach((fn) => fn(markets[fallback]));

  document.addEventListener('click', (e) => {
    const btn = (e.target as Element).closest<HTMLElement>('[data-pick-market]');
    if (!btn) return;
    const k = btn.dataset.pickMarket!;
    if (!markets[k]) return;
    apply(k, true);
    try { localStorage.setItem(KEY, k); } catch { /* storage blocked */ }
  });
}
