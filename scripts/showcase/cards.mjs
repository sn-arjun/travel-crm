// HTML templates + Playwright renderer for every still the compositor needs (STORYBOARD D.4 / D.7):
// intro, outro, scene card, phone background (blurred desktop frame + inset + labels), device frame,
// rounded mask, caption PNGs (transparent) and the in-phone time-skip card (transparent).
//
// Fonts: if E2E_BASE_URL is reachable the page is rendered inside the app origin so the app's DM Sans/Geist
// faces are already loaded; otherwise a system sans-serif is used.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from './ffmpeg.mjs';

const FONT = `'DM Sans','Geist',ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif`;
const BG = 'linear-gradient(135deg,#1E1B4B 0%,#312E81 55%,#4F46E5 100%)';
const DOTS = `radial-gradient(rgba(255,255,255,.06) 1.5px,transparent 1.5px)`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mono = (n = 40) => `<div style="width:${n}px;height:${n}px;border-radius:${n / 4}px;background:#4F46E5;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${n * 0.4}px">SH</div>`;
const brandFoot = `<div style="position:absolute;left:64px;bottom:56px;display:flex;align-items:center;gap:14px;font-size:16px;color:#C7D2FE">${mono()}<div>Sahyadri Holidays · powered by TravelCRM Pro</div></div>`;

const page = (inner, bg = 'transparent') =>
  `<div id="root" style="position:relative;width:1920px;height:1080px;overflow:hidden;background:${bg};font-family:${FONT};color:#fff">${inner}</div>`;

const centred = (kicker, title, sub, titleSize = 72) =>
  `<div style="position:absolute;inset:0;background-image:${DOTS};background-size:32px 32px"></div>
   <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
     ${kicker ? `<div style="font-size:18px;letter-spacing:.32em;text-transform:uppercase;color:#C7D2FE;margin-bottom:22px;font-weight:600">${esc(kicker)}</div>` : ''}
     <div style="font-size:${titleSize}px;font-weight:700;letter-spacing:-.02em;line-height:1.1;max-width:1500px">${esc(title)}</div>
     ${sub ? `<div style="font-size:28px;color:#E0E7FF;margin-top:20px;max-width:60ch;line-height:1.4">${esc(sub)}</div>` : ''}
   </div>`;

export const templates = {
  intro: () => page(`<div style="position:absolute;inset:0;background-image:${DOTS};background-size:32px 32px"></div>
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
      <div style="font-size:96px;font-weight:700;letter-spacing:-.03em">TravelCRM Pro</div>
      <div style="font-size:32px;color:#E0E7FF;margin-top:22px">The all-in-one CRM for tours &amp; travels agencies</div>
      <div style="font-size:20px;color:#C7D2FE;margin-top:34px;letter-spacing:.06em">A day at Sahyadri Holidays, Bengaluru</div>
    </div>${brandFoot}`, BG),
  outro: () => page(`<div style="position:absolute;inset:0;background-image:${DOTS};background-size:32px 32px"></div>
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
      <div style="font-size:40px;font-weight:700;letter-spacing:-.01em;max-width:1500px;line-height:1.3">Leads · Itineraries · Invoicing · Fleet · Driver app — one platform</div>
      <div style="font-size:28px;color:#C7D2FE;margin-top:30px">travelcrm.pro</div>
    </div>${brandFoot}`, BG),
  scene: ({ kicker, title, subtitle }) => page(centred(kicker, title, subtitle) + brandFoot, BG),
  /** Phone background: desktop still blurred to cover, indigo wash, framed desktop inset, labels. */
  phoneBg: ({ desktopPng, phoneLabel = 'Ravi Kumar · TravelCRM Driver', deskLabel = 'Dispatch desk · Sahyadri Holidays' }) => page(`
    <img src="${desktopPng}" style="position:absolute;inset:-40px;width:2000px;height:1160px;object-fit:cover;filter:blur(18px)">
    <div style="position:absolute;inset:0;background:rgba(30,27,75,.55)"></div>
    <div style="position:absolute;inset:0;background:${BG};opacity:.40"></div>
    <div style="position:absolute;left:80px;top:150px;font-size:18px;color:#C7D2FE;font-weight:600;letter-spacing:.02em">${esc(deskLabel)}</div>
    <img src="${desktopPng}" style="position:absolute;left:80px;top:208px;width:1180px;height:664px;border-radius:16px;border:1px solid rgba(255,255,255,.25);box-shadow:0 24px 70px rgba(0,0,0,.45);object-fit:cover">
    <div style="position:absolute;left:1363px;width:437px;top:1018px;text-align:center;font-size:18px;color:#C7D2FE;font-weight:600">${esc(phoneLabel)}</div>
    <div style="position:absolute;left:64px;bottom:40px;display:flex;align-items:center;gap:12px;font-size:15px;color:#C7D2FE">${mono(32)}<div>Sahyadri Holidays · powered by TravelCRM Pro</div></div>`, '#1E1B4B'),
  /** 437x932 bezel with a transparent screen hole and a punch-hole camera (transparent PNG). */
  deviceFrame: () => `<div id="root" style="position:relative;width:437px;height:932px;font-family:${FONT}">
    <div style="position:absolute;inset:0;border-radius:56px;box-sizing:border-box;border:16px solid #0B0B10;box-shadow:inset 0 0 0 1px #3A3A44, 0 0 0 1px #3A3A44"></div>
    <div style="position:absolute;left:50%;top:30px;width:14px;height:14px;margin-left:-7px;border-radius:50%;background:#050508;box-shadow:0 0 0 2px #14141a"></div></div>`,
  /** 405x900 white rounded rect on black: used as the alpha mask for the phone video. */
  mask: () => `<div id="root" style="width:405px;height:900px;background:#000"><div style="width:405px;height:900px;border-radius:44px;background:#fff"></div></div>`,
  /** Transparent 1920x1080 lower-third caption (left 80, bottom 72, max-width 1180). */
  caption: ({ text }) => page(`<div style="position:absolute;left:80px;bottom:72px;max-width:1180px;background:rgba(17,17,23,.86);border-radius:14px;padding:14px 28px 16px 24px;border-left:6px solid #4F46E5;box-shadow:0 12px 40px rgba(0,0,0,.35)">
    <div style="font-size:28px;line-height:1.35;font-weight:600">${esc(text)}</div></div>`),
  /** Transparent 1920x1080 overlay that dims only the phone screen area and shows centred text. */
  phoneCard: ({ text }) => page(`<div style="position:absolute;left:1379px;top:90px;width:405px;height:900px;border-radius:44px;background:rgba(30,27,75,.88);display:flex;align-items:center;justify-content:center;text-align:center;padding:0 36px;box-sizing:border-box;font-size:30px;font-weight:600;line-height:1.3">${esc(text)}</div>`),
};

async function launch() {
  const req = createRequire(path.join(repoRoot, 'desktop/package.json'));
  const { chromium } = req('playwright-core');
  return chromium.launch();
}

async function reachable(url) {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(2000) }); return r.status < 500; } catch { return false; }
}

/** Render [{html, out, w, h, transparent}] to PNG files. */
export async function renderAll(jobs) {
  const browser = await launch();
  const base = process.env.E2E_BASE_URL;
  const inApp = base && (await reachable(base));
  try {
    for (const j of jobs) {
      const ctx = await browser.newContext({ viewport: { width: j.w ?? 1920, height: j.h ?? 1080 }, deviceScaleFactor: 1 });
      const pg = await ctx.newPage();
      const wrap = (h) => `<html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent}*{box-sizing:border-box}</style></head><body>${h}</body></html>`;
      if (inApp) {
        await pg.goto(`${base}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {});
        await pg.evaluate((h) => { document.head.insertAdjacentHTML('beforeend', '<style>html,body{margin:0;padding:0;background:transparent!important}body{display:none!important}*{box-sizing:border-box}</style>'); const host = document.createElement('div'); host.id = 'sc-host'; host.style.cssText = 'position:absolute;left:0;top:0'; host.innerHTML = h; document.documentElement.appendChild(host); }, j.html);
      } else {
        await pg.setContent(wrap(j.html), { waitUntil: 'load' });
      }
      await pg.evaluate(() => document.fonts.ready).catch(() => {});
      await pg.waitForTimeout(250);
      fs.mkdirSync(path.dirname(j.out), { recursive: true });
      await pg.locator('#root').screenshot({ path: j.out, omitBackground: !!j.transparent });
      await ctx.close();
    }
  } finally { await browser.close(); }
}
