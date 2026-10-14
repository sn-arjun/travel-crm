#!/usr/bin/env node
/**
 * Refuses a deploy unless the generated Worker config is present, fresh and free of placeholder ids.
 *   node scripts/predeploy-guard.mjs <dev|staging|production>
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.argv[2];
const problems = [];

if (!['dev', 'staging', 'production'].includes(env ?? '')) {
  console.error('predeploy-guard: usage: predeploy-guard.mjs <dev|staging|production>');
  process.exit(1);
}

const generated = path.join(backendDir, `.wrangler.${env}.toml`);
const base = path.join(backendDir, 'wrangler.base.toml');
const hint = `Run: node scripts/gen-wrangler.mjs --env ${env} --registry <registry.json>   (set CF_D1_MASTER_ID, CF_KV_CACHE_ID, CF_KV_SESSIONS_ID, CF_KV_REPORT_CACHE_ID first)`;

if (!existsSync(generated)) {
  problems.push(`${path.basename(generated)} is missing.`);
} else {
  if (statSync(generated).mtimeMs < statSync(base).mtimeMs) {
    problems.push(`${path.basename(generated)} is older than wrangler.base.toml; regenerate it.`);
  }
  const lines = readFileSync(generated, 'utf8')
    .split(/\r?\n/)
    .filter((l) => !/^\s*#/.test(l));
  const placeholders = lines.filter((l) => l.includes('a0000000-'));
  if (placeholders.length) {
    problems.push(`${placeholders.length} placeholder id(s) (a0000000-...) remain; set the CF_* id variables and regenerate.`);
  }
}

if (problems.length) {
  console.error(`predeploy-guard: refusing to deploy ${env}:\n  - ${problems.join('\n  - ')}\n${hint}`);
  process.exit(1);
}
console.log(`predeploy-guard: ${path.basename(generated)} is fresh and has no placeholder ids.`);
