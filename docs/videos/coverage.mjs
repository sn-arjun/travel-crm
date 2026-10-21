#!/usr/bin/env node
/**
 * Coverage check for the video catalogue (docs/videos/CATALOGUE.md).
 *
 *   node docs/videos/coverage.mjs            check; exit 1 on any problem
 *   node docs/videos/coverage.mjs --write    also rewrite docs/videos/COVERAGE.md (feature -> film + chapter table)
 *
 * Fails when:
 *  - a feature with status works or partial in docs/features.json has no chapter in any clip (studio/clips/*.json) and is not
 *    listed with a reason in docs/videos/not-filmed.json;
 *  - a clip names a feature id that does not exist;
 *  - a screen scene's `step` has no matching beat(page, '<step>', ...) in desktop/e2e/showcase/films/<recording>.spec.ts;
 *  - a film in docs/videos/films.json has no clip (or, if it is recorded with Playwright, no spec).
 * Warns (no failure) on stubs or removed features named in a clip, and on not-filmed entries that a clip now covers.
 * Read-only: touches nothing but COVERAGE.md with --write.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const features = JSON.parse(fs.readFileSync(path.join(root, 'docs/features.json'), 'utf8'));
const notFilmed = JSON.parse(fs.readFileSync(path.join(here, 'not-filmed.json'), 'utf8')).features;
const films = JSON.parse(fs.readFileSync(path.join(here, 'films.json'), 'utf8')).films;
const clipsDir = path.join(root, 'studio/clips');
const specsDir = path.join(root, 'desktop/e2e/showcase/films');

const byId = new Map(features.map((f) => [f.id, f]));
const want = features.filter((f) => f.status === 'works' || f.status === 'partial');
const failures = []; const warnings = [];
const where = new Map(); // id -> [{film, chapter}]
const filmTitle = new Map(films.map((f) => [f.id, f.title]));
const specText = new Map();
const spec = (rec) => {
  if (!specText.has(rec)) { const p = path.join(specsDir, `${rec}.spec.ts`); specText.set(rec, fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null); }
  return specText.get(rec);
};

const clipFiles = fs.readdirSync(clipsDir).filter((f) => f.endsWith('.json') && f !== 'master.json');
for (const file of clipFiles) {
  const id = file.replace(/\.json$/, '');
  const clip = JSON.parse(fs.readFileSync(path.join(clipsDir, file), 'utf8'));
  if (!Array.isArray(clip.scenes)) continue;
  let chapter = 'Introduction';
  clip.scenes.forEach((s, i) => {
    if (s.chapter) chapter = s.chapter;
    for (const fid of s.features ?? []) {
      const f = byId.get(fid);
      if (!f) { failures.push(`${file} scene ${i}: unknown feature id "${fid}"`); continue; }
      if (f.status === 'stub' || f.status === 'removed') warnings.push(`${file} scene ${i}: ${fid} is ${f.status}`);
      if (!where.has(fid)) where.set(fid, []);
      where.get(fid).push({ film: id, chapter });
    }
    if ((s.type === 'screen' || s.type === 'phone') && s.step) {
      const rec = s.recording ?? clip.recording;
      if (!rec) { failures.push(`${file} scene ${i}: step "${s.step}" without a recording`); return; }
      const text = spec(rec);
      if (text === null) failures.push(`${file} scene ${i}: no spec desktop/e2e/showcase/films/${rec}.spec.ts for step "${s.step}"`);
      else if (!new RegExp(`beat\\(page,\\s*'${s.step.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`).test(text)) failures.push(`${file} scene ${i}: step "${s.step}" is never played by ${rec}.spec.ts`);
    }
  });
}
for (const f of films) {
  if (f.id === 'master') { if (!fs.existsSync(path.join(clipsDir, 'master.json'))) failures.push('studio/clips/master.json missing'); continue; }
  if (!fs.existsSync(path.join(clipsDir, `${f.id}.json`))) failures.push(`film ${f.id}: no studio/clips/${f.id}.json`);
  if (!['cut', 'driver'].includes(f.stack) && !fs.existsSync(path.join(specsDir, `${f.id}.spec.ts`))) failures.push(`film ${f.id}: no desktop/e2e/showcase/films/${f.id}.spec.ts`);
}
const missing = [];
for (const f of want) {
  if (where.has(f.id)) { if (notFilmed[f.id]) warnings.push(`${f.id} is in not-filmed.json but a clip covers it now`); continue; }
  if (notFilmed[f.id]) continue;
  missing.push(f.id);
}
for (const id of Object.keys(notFilmed)) if (!byId.has(id)) failures.push(`not-filmed.json: unknown feature id "${id}"`);
if (missing.length) failures.push(`${missing.length} works/partial feature(s) without a chapter: ${missing.join(', ')}`);

const covered = want.filter((f) => where.has(f.id)).length;
const nf = want.filter((f) => !where.has(f.id) && notFilmed[f.id]).length;
const stubs = features.filter((f) => f.status === 'stub' || f.status === 'removed');
console.log(`[coverage] ${want.length} works/partial features: ${covered} in a chapter, ${nf} not filmed with a reason, ${missing.length} missing`);
console.log(`[coverage] ${stubs.length} stub/removed (never filmed): ${stubs.map((f) => f.id).join(', ')}`);
for (const w of warnings) console.log(`[coverage] warn: ${w}`);

if (process.argv.includes('--write')) {
  const esc = (s) => String(s).replace(/\|/g, '\\|');
  const lines = [
    '# Video coverage: feature to film and chapter',
    '',
    'Generated by `node docs/videos/coverage.mjs --write` from `docs/features.json`, `studio/clips/*.json` and `docs/videos/not-filmed.json`. Do not edit by hand.',
    '',
    `${want.length} features work or partly work: **${covered}** are in a film chapter, **${nf}** are not filmed (reason given), **${missing.length}** missing. ${stubs.length} stubs or removed features are never filmed.`,
    '',
  ];
  let area = '';
  for (const f of features) {
    if (f.area !== area) { area = f.area; lines.push('', `## ${area}`, '', '| Feature | Status | Film | Chapter |', '|---|---|---|---|'); }
    const w = where.get(f.id);
    const film = w ? [...new Set(w.map((x) => x.film))].map((x) => `${esc(filmTitle.get(x) ?? x)} (\`${x}\`)`).join('<br>') : f.status === 'stub' || f.status === 'removed' ? `not filmed: ${f.status}` : notFilmed[f.id] ? `not filmed: ${esc(notFilmed[f.id])}` : '**MISSING**';
    const ch = w ? [...new Set(w.map((x) => x.chapter))].map(esc).join('<br>') : '';
    lines.push(`| \`${f.id}\` ${esc(f.name)} | ${f.status} | ${film} | ${ch} |`);
  }
  fs.writeFileSync(path.join(here, 'COVERAGE.md'), lines.join('\n') + '\n');
  console.log('[coverage] wrote docs/videos/COVERAGE.md');
}
if (failures.length) { for (const f of failures) console.error(`[coverage] FAIL: ${f}`); process.exit(1); }
console.log('[coverage] OK');
