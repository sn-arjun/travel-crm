// Stand-in for `npx wrangler` used by gen-wrangler.selftest.mjs (GEN_WRANGLER_BIN).
// Records its arguments and the content of the config it was pointed at, then prints canned D1 JSON.
import { appendFileSync, readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const ci = args.indexOf('-c');
const cfg = ci >= 0 ? readFileSync(args[ci + 1], 'utf8') : null;
if (process.env.FAKE_WRANGLER_LOG) {
  appendFileSync(process.env.FAKE_WRANGLER_LOG, JSON.stringify({ args, cfg }) + '\n');
}
if (process.env.FAKE_WRANGLER_FAIL) {
  console.error(process.env.FAKE_WRANGLER_FAIL);
  process.exit(1);
}
console.log(JSON.stringify([{ results: JSON.parse(process.env.FAKE_WRANGLER_ROWS || '[]'), success: true }]));
