/**
 * i18n check for the converted scope (shell, navigation, auth screens, shared components).
 *
 *   node scripts/i18n-check.mjs [--json]
 *
 * Fails (exit 1) when
 *   1. a key used in code (t('x'), titleKey: 'x', ...) is missing from messages/en.json,
 *   2. a file in SCOPE still has a hard-coded user-visible string (JSX text, text props such as
 *      placeholder / aria-label / title, toast and setError messages),
 *   3. a hi / ar entry has no English key, or uses different {placeholders} than English.
 * Always prints the hi / ar coverage of the English catalogue (a partial catalogue is allowed: it falls back to English).
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

/** Files and folders (relative to desktop/) whose strings must all come from the catalogue. */
export const SCOPE = [
  'src/components/layout',
  'src/app/(auth)',
  'src/app/(app)/layout.tsx',
  'src/components/auth/change-password-form.tsx',
  'src/components/domain/language-switcher.tsx',
  'src/components/domain/filter-bar.tsx',
  'src/components/domain/command-palette.tsx',
  'src/components/ui/empty-state.tsx',
  'src/components/ui/confirm-dialog.tsx',
  'src/components/ui/pagination.tsx',
  'src/components/ui/form-field.tsx',
  'src/components/ui/page-header.tsx',
  'src/components/ui/combobox.tsx',
  'src/components/ui/data-table.tsx',
  'src/components/ui/file-dropzone.tsx',
  'src/components/ui/multi-step-wizard.tsx',
  'src/components/ui/dialog.tsx',
  'src/components/ui/sheet.tsx',
  'src/components/ui/date-picker.tsx',
  'src/components/ui/phone-input.tsx',
  'src/components/ui/address-autocomplete.tsx',
  'src/components/ui/rich-text-editor.tsx',
  'src/components/ui/chart.tsx',
  'src/components/ui/command.tsx',
  'src/components/ui/split-button.tsx',
  'src/components/ui/tag.tsx',
  'src/components/domain/list-page.tsx',
  'src/components/domain/data-table.tsx',
  'src/components/domain/detail-page.tsx',
  'src/components/domain/entity-form.tsx',
  'src/components/domain/relation-combobox.tsx',
  'src/components/domain/file-upload.tsx',
  'src/components/domain/kanban-board.tsx',
  'src/components/domain/stat-card.tsx',
  'src/components/domain/keyboard-shortcuts-provider.tsx',
];

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

function loadCatalogue(name) {
  return JSON.parse(readFileSync(path.join(srcDir, 'messages', `${name}.json`), 'utf8'));
}

export function run() {
  const en = loadCatalogue('en');
  const problems = [];
  const files = [...new Set(SCOPE.flatMap(listFiles))];
  let usedCount = 0;

  const has = (key) => key in en || `${key}_other` in en;
  for (const rel of files) {
    const { findings, usedKeys } = scanFile(rel);
    for (const f of findings) problems.push(`hard-coded ${f.what}: ${f.file}:${f.line}  "${f.value}"`);
    for (const u of usedKeys) {
      usedCount++;
      if (!has(u.key)) problems.push(`missing key "${u.key}" (en.json): ${rel}:${u.line}`);
    }
  }

  const coverage = {};
  for (const lang of ['hi', 'ar']) {
    const cat = loadCatalogue(lang);
    const keys = Object.keys(cat);
    let translated = 0;
    for (const k of Object.keys(en)) if (k in cat && String(cat[k]).trim() !== '') translated++;
    coverage[lang] = { translated, total: Object.keys(en).length, percent: Math.round((translated / Object.keys(en).length) * 1000) / 10 };
    for (const k of keys) {
      if (k.startsWith('_')) continue; // notes (for example a native-review flag), not text
      if (!(k in en)) problems.push(`${lang}.json has key "${k}" that en.json does not`);
      else if (placeholdersOf(cat[k]) !== placeholdersOf(en[k])) problems.push(`${lang}.json "${k}" uses different {placeholders} than en.json`);
    }
  }
  return { problems, coverage, fileCount: files.length, usedCount, keyCount: Object.keys(en).length };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const r = run();
  for (const p of r.problems) console.error(`FAIL ${p}`);
  console.log(`i18n-check: ${r.fileCount} files in scope, ${r.usedCount} key uses, ${r.keyCount} English keys`);
  for (const [lang, c] of Object.entries(r.coverage)) console.log(`  ${lang}: ${c.translated}/${c.total} keys (${c.percent}%)`);
  if (r.problems.length) {
    console.error(`i18n-check: FAIL (${r.problems.length} problems)`);
    process.exit(1);
  }
  console.log('i18n-check: PASS');
}
