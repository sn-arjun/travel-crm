/**
 * i18n check for the converted scope (shell, navigation, auth screens, shared components).
 *
 *   node scripts/i18n-check.mjs [--json]
 *
 * Fails (exit 1) when
 *   1. a key used in code (t('x'), titleKey: 'x', ...) is missing from the English catalogue,
 *   2. a file in SCOPE still has a hard-coded user-visible string (JSX text, text props such as
 *      placeholder / aria-label / title, toast and setError messages),
 *   3. a catalogue entry has no English key, or uses different {placeholders} than English,
 *   4. a COMPLETE language (en, nl) lacks a key the English catalogue has,
 *   5. a key sits in the wrong catalogue file (a key lives in <lang>/<first dot segment>.json).
 * Always prints the coverage of every language against English (hi and ar may be partial: they fall back to English).
 * --json prints the result object instead of the text report (same exit codes).
 *
 * The catalogues are src/messages/<lang>/<namespace>.json. SCOPE comes from scripts/i18n-scope/*.json (each an array of
 * paths relative to desktop/), so a batch that converts more screens adds its own scope file and never edits this script.
 *
 * A string that is deliberately not translatable (an example value, a brand) is marked with `i18n-ignore`
 * in a comment on the same line or the line above.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(desktopDir, 'src');

const scopeDir = path.join(desktopDir, 'scripts', 'i18n-scope');
const messagesDir = path.join(srcDir, 'messages');

/** Languages that must have every English key. The others may be partial (missing keys fall back to English). */
export const COMPLETE_LANGUAGES = ['en', 'nl'];
const ALL_LANGUAGES = ['en', 'nl', 'hi', 'ar'];

/** Files and folders (relative to desktop/) whose strings must all come from the catalogue, from scripts/i18n-scope/*.json. */
export function loadScope(dir = scopeDir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith('.json')) continue;
    const list = JSON.parse(readFileSync(path.join(dir, name), 'utf8'));
    if (!Array.isArray(list)) throw new Error(`i18n-scope/${name} must be an array of paths`);
    for (const p of list) if (typeof p === 'string' && !out.includes(p)) out.push(p);
  }
  return out;
}

export const SCOPE = loadScope();

const TEXT_PROPS = new Set([
  'placeholder', 'aria-label', 'aria-description', 'title', 'alt', 'label', 'description',
  'emptyTitle', 'emptyDescription', 'confirmLabel', 'cancelLabel', 'searchPlaceholder', 'tooltip', 'helperText',
]);
const MESSAGE_CALLS = new Set(['setError', 'setErrorMessage', 'setFormError']);
const TOAST_METHODS = new Set(['success', 'error', 'info', 'warning', 'message', 'loading']);
const DATA_TEXT_PROPS = new Set(['title', 'label', 'description', 'message', 'placeholder', 'emptyText']);
const KEY_CALLEES = new Set(['t', 'tEn']);
const KEY_PROPS = new Set(['titleKey', 'labelKey', 'nounKey', 'i18nKey']);

function listFiles(rel) {
  const abs = path.join(desktopDir, rel);
  if (!existsSync(abs)) return [];
  if (statSync(abs).isFile()) return [rel];
  const out = [];
  for (const name of readdirSync(abs)) {
    const child = `${rel}/${name}`;
    const st = statSync(path.join(desktopDir, child));
    if (st.isDirectory()) out.push(...listFiles(child));
    else if (/\.(tsx?)$/.test(name) && !/\.(test|spec|stories)\.tsx?$/.test(name)) out.push(child);
  }
  return out;
}

const hasLetters = (s) => /[A-Za-zÀ-ɏऀ-ॿ؀-ۿ]{2,}/.test(s);
/** Example values, URLs, e-mail addresses, codes: not prose. */
function looksLikeData(s) {
  const t = s.trim();
  if (!hasLetters(t)) return true;
  if (/\s/.test(t)) return false;
  return /[@/]|^[A-Z0-9+._-]+$/.test(t);
}

function stringOf(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map((s) => '\u0000' + s.literal.text).join('');
  return null;
}

/** String literals reachable through ?:, ||, ?? and && branches (the ways JSX picks between two texts). */
function branchStrings(node, acc = []) {
  if (ts.isParenthesizedExpression(node)) return branchStrings(node.expression, acc);
  if (ts.isConditionalExpression(node)) {
    branchStrings(node.whenTrue, acc);
    branchStrings(node.whenFalse, acc);
  } else if (ts.isBinaryExpression(node) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(node.operatorToken.kind)) {
    branchStrings(node.left, acc);
    branchStrings(node.right, acc);
  } else if (ts.isAsExpression(node)) {
    branchStrings(node.expression, acc);
  } else {
    const s = stringOf(node);
    if (s !== null) acc.push({ node, text: s });
  }
  return acc;
}

export function scanFile(rel) {
  const text = readFileSync(path.join(desktopDir, rel), 'utf8');
  const lines = text.split(/\r?\n/);
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, rel.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const findings = [];
  const usedKeys = [];

  const lineOf = (node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
  const ignored = (node) => {
    const l = lineOf(node);
    return /i18n-ignore/.test(lines[l] ?? '') || /i18n-ignore/.test(lines[l - 1] ?? '');
  };
  const flag = (node, what, value) => {
    if (ignored(node)) return;
    findings.push({ file: rel, line: lineOf(node) + 1, what, value: value.replace(/\s+/g, ' ').trim().slice(0, 70) });
  };
  const flagString = (node, what, text) => {
    if (hasLetters(text) && !looksLikeData(text)) flag(node, what, text);
  };

  function visit(node) {
    if (ts.isJsxText(node)) {
      const t = node.text.replace(/\s+/g, ' ').trim();
      if (t && hasLetters(t)) flag(node, 'JSX text', t);
    } else if (ts.isJsxAttribute(node) && node.initializer) {
      const name = node.name.getText(sf);
      if (TEXT_PROPS.has(name)) {
        const init = node.initializer;
        if (ts.isStringLiteral(init)) flagString(init, `prop ${name}`, init.text);
        else if (ts.isJsxExpression(init) && init.expression) {
          for (const b of branchStrings(init.expression)) flagString(b.node, `prop ${name}`, b.text);
        }
      }
    } else if (ts.isJsxExpression(node) && node.expression && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      for (const b of branchStrings(node.expression)) flagString(b.node, 'JSX expression text', b.text);
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const first = node.arguments[0];
      if (ts.isIdentifier(callee) && KEY_CALLEES.has(callee.text) && first) {
        const s = stringOf(first);
        if (s !== null && !s.includes('\u0000')) usedKeys.push({ key: s, line: lineOf(first) + 1 });
      }
      if (ts.isIdentifier(callee) && MESSAGE_CALLS.has(callee.text) && first) {
        for (const b of branchStrings(first)) flagString(b.node, `${callee.text}()`, b.text);
      }
      const isToast =
        (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === 'toast' && TOAST_METHODS.has(callee.name.text)) ||
        (ts.isIdentifier(callee) && callee.text === 'toast');
      if (isToast && first) {
        for (const b of branchStrings(first)) flagString(b.node, 'toast message', b.text);
      }
    } else if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && KEY_PROPS.has(node.name.text)) {
      const s = stringOf(node.initializer);
      if (s !== null) usedKeys.push({ key: s, line: lineOf(node) + 1 });
    } else if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && DATA_TEXT_PROPS.has(node.name.text)) {
      for (const b of branchStrings(node.initializer)) flagString(b.node, `property ${node.name.text}`, b.text);
    } else if ((ts.isParameter(node) || ts.isBindingElement(node)) && node.initializer && ts.isIdentifier(node.name)) {
      const str = stringOf(node.initializer);
      if (str !== null && /label|placeholder|title|description|text|message/i.test(node.name.text)) flagString(node.initializer, `default for ${node.name.text}`, str);
    } else if (ts.isThrowStatement(node) && node.expression && ts.isNewExpression(node.expression)) {
      // Thrown errors are developer-facing: not scanned.
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return { findings, usedKeys };
}

function placeholdersOf(s) {
  return [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
}

/**
 * One language: every <lang>/*.json merged into a flat catalogue. A key must live in the file named after its first
 * dot segment; keys that start with an underscore are notes and may sit anywhere (they are not text).
 */
export function loadCatalogue(lang, dir = messagesDir, problems = []) {
  const langDir = path.join(dir, lang);
  const merged = {};
  if (!existsSync(langDir)) return merged;
  for (const name of readdirSync(langDir).sort()) {
    if (!name.endsWith('.json')) continue;
    const ns = name.slice(0, -5);
    const cat = JSON.parse(readFileSync(path.join(langDir, name), 'utf8'));
    for (const [k, v] of Object.entries(cat)) {
      if (!k.startsWith('_') && k.split('.')[0] !== ns) {
        problems.push(`key "${k}" is in ${lang}/${name}; it belongs in ${lang}/${k.split('.')[0]}.json`);
      }
      if (k in merged) problems.push(`key "${k}" appears twice in ${lang}`);
      merged[k] = v;
    }
  }
  return merged;
}

export function run({ dir = messagesDir, scope = SCOPE } = {}) {
  const problems = [];
  const en = loadCatalogue('en', dir, problems);
  const files = [...new Set(scope.flatMap(listFiles))];
  let usedCount = 0;

  const has = (key) => key in en || `${key}_other` in en;
  for (const rel of files) {
    const { findings, usedKeys } = scanFile(rel);
    for (const f of findings) problems.push(`hard-coded ${f.what}: ${f.file}:${f.line}  "${f.value}"`);
    for (const u of usedKeys) {
      usedCount++;
      if (!has(u.key)) problems.push(`missing key "${u.key}" (en): ${rel}:${u.line}`);
    }
  }

  const enKeys = Object.keys(en).filter((k) => !k.startsWith('_'));
  const coverage = {};
  for (const lang of ALL_LANGUAGES.filter((l) => l !== 'en')) {
    const cat = loadCatalogue(lang, dir, problems);
    let translated = 0;
    for (const k of enKeys) if (k in cat && String(cat[k]).trim() !== '') translated++;
    coverage[lang] = {
      translated,
      total: enKeys.length,
      percent: enKeys.length ? Math.round((translated / enKeys.length) * 1000) / 10 : 100,
    };
    if (COMPLETE_LANGUAGES.includes(lang)) {
      for (const k of enKeys) {
        if (!(k in cat) || String(cat[k]).trim() === '') problems.push(`${lang} is missing key "${k}" (${lang} must be complete)`);
      }
    }
    for (const k of Object.keys(cat)) {
      if (k.startsWith('_')) continue; // notes (for example a native-review flag), not text
      if (!(k in en)) problems.push(`${lang} has key "${k}" that en does not`);
      else if (placeholdersOf(cat[k]) !== placeholdersOf(en[k])) problems.push(`${lang} "${k}" uses different {placeholders} than en`);
    }
  }
  return { problems, coverage, fileCount: files.length, usedCount, keyCount: enKeys.length };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const r = run();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.problems.length ? 1 : 0);
  }
  for (const p of r.problems) console.error(`FAIL ${p}`);
  console.log(`i18n-check: ${r.fileCount} files in scope, ${r.usedCount} key uses, ${r.keyCount} English keys`);
  for (const [lang, c] of Object.entries(r.coverage)) console.log(`  ${lang}: ${c.translated}/${c.total} keys (${c.percent}%)`);
  if (r.problems.length) {
    console.error(`i18n-check: FAIL (${r.problems.length} problems)`);
    process.exit(1);
  }
  console.log('i18n-check: PASS');
}
