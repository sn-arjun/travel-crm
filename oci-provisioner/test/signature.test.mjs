// Run with: node --test test/   (Node 22.18+ strips the TypeScript types itself; no install or build needed)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { signRequest, verifyRequest, computeSignature, canonicalString, MAX_SKEW_SECONDS } from '../src/signature.ts';
import { loadConfig, deriveMaxSites, ConfigError } from '../src/config.ts';
import { createServer } from '../src/server.ts';
import { SiteManager } from '../src/sites.ts';

const SECRET = 'unit-test-secret-0123456789abcdef';
const NOW = 1_800_000_000_000; // fixed clock, ms
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('request signature', () => {
  test('fixed vector: the backend (WebCrypto) must produce the same value', () => {
    assert.equal(canonicalString('1800000000', 'post', '/sites', '{"siteId":"s1"}'), '1800000000\nPOST\n/sites\n{"siteId":"s1"}');
    assert.equal(
      computeSignature('secret-key-for-vector-test-0001', '1800000000', 'POST', '/sites', '{"siteId":"s1"}'),
      '27582f384e2d9b401e88cab1a016720f6681673946adb7b1b6cde87f2d4b2780',
    );
  });

  test('a valid signature is accepted', () => {
    const body = '{"siteId":"s1"}';
    const h = signRequest(SECRET, { method: 'POST', path: '/sites', body, nowMs: NOW });
    const r = verifyRequest(SECRET, { method: 'POST', path: '/sites', body, timestamp: h['X-Timestamp'], signature: h['X-Signature'], nowMs: NOW });
    assert.deepEqual(r, { ok: true });
  });

  test('a timestamp older than 300 seconds is rejected, and so is one from the future', () => {
    const h = signRequest(SECRET, { method: 'GET', path: '/sites/a', nowMs: NOW });
    const args = { method: 'GET', path: '/sites/a', timestamp: h['X-Timestamp'], signature: h['X-Signature'] };
    assert.deepEqual(verifyRequest(SECRET, { ...args, nowMs: NOW + (MAX_SKEW_SECONDS + 5) * 1000 }), { ok: false, reason: 'stale' });
    assert.deepEqual(verifyRequest(SECRET, { ...args, nowMs: NOW - (MAX_SKEW_SECONDS + 5) * 1000 }), { ok: false, reason: 'stale' });
    assert.deepEqual(verifyRequest(SECRET, { ...args, nowMs: NOW + (MAX_SKEW_SECONDS - 5) * 1000 }), { ok: true });
  });

  test('a signature made with another secret is rejected', () => {
    const h = signRequest('another-secret-another-secret-1', { method: 'GET', path: '/sites/a', nowMs: NOW });
    const r = verifyRequest(SECRET, { method: 'GET', path: '/sites/a', timestamp: h['X-Timestamp'], signature: h['X-Signature'], nowMs: NOW });
    assert.deepEqual(r, { ok: false, reason: 'bad-signature' });
  });

  test('changing the method, the path or the body invalidates the signature', () => {
    const h = signRequest(SECRET, { method: 'POST', path: '/sites', body: '{"a":1}', nowMs: NOW });
    const base = { timestamp: h['X-Timestamp'], signature: h['X-Signature'], nowMs: NOW };
    assert.equal(verifyRequest(SECRET, { ...base, method: 'DELETE', path: '/sites', body: '{"a":1}' }).ok, false);
    assert.equal(verifyRequest(SECRET, { ...base, method: 'POST', path: '/sites/x', body: '{"a":1}' }).ok, false);
    assert.equal(verifyRequest(SECRET, { ...base, method: 'POST', path: '/sites', body: '{"a":2}' }).ok, false);
  });

  test('missing or malformed headers are rejected without throwing', () => {
    assert.deepEqual(verifyRequest(SECRET, { method: 'GET', path: '/', nowMs: NOW }), { ok: false, reason: 'missing' });
    assert.deepEqual(verifyRequest(SECRET, { method: 'GET', path: '/', timestamp: 'abc', signature: 'zz', nowMs: NOW }), { ok: false, reason: 'malformed' });
    assert.equal(verifyRequest('', { method: 'GET', path: '/', timestamp: '1', signature: 'a'.repeat(64), nowMs: NOW }).ok, false);
  });
});

describe('configuration', () => {
  test('refuses to load without PROVISIONER_SECRET, and with a weak one', () => {
    assert.throws(() => loadConfig({}), ConfigError);
    assert.throws(() => loadConfig({ PROVISIONER_SECRET: 'change-me' }), /too weak/);
    assert.throws(() => loadConfig({ PROVISIONER_SECRET: 'short' }), ConfigError);
  });

  test('MAX_SITES comes from memory unless it is set', () => {
    const gb = 1024 ** 3;
    assert.equal(deriveMaxSites(24 * gb, 2048, 768), 29); // (24576 - 2048) / 768 = 29.3
    assert.equal(deriveMaxSites(1 * gb, 2048, 768), 0);
    assert.equal(loadConfig({ PROVISIONER_SECRET: SECRET, PROVISIONER_MODE: 'container' }, 24 * gb).maxSites, 29);
    assert.equal(loadConfig({ PROVISIONER_SECRET: SECRET, MAX_SITES: '5' }, 24 * gb).maxSites, 5);
    assert.equal(loadConfig({ PROVISIONER_SECRET: SECRET, RESERVE_MB: '4096', SITE_MEMORY_MB: '1024', PROVISIONER_MODE: 'container' }, 8 * gb).maxSites, 4);
  });

  test('the server process exits with code 1 and a message when PROVISIONER_SECRET is missing', () => {
    const env = { ...process.env };
    delete env.PROVISIONER_SECRET;
    const run = spawnSync(process.execPath, [path.join(root, 'src', 'server.ts')], { env, encoding: 'utf8', timeout: 20000 });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /PROVISIONER_SECRET is not set/);
  });

  test('no default secret is left in the sources', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    for (const f of readdirSync(path.join(root, 'src'))) {
      assert.doesNotMatch(readFileSync(path.join(root, 'src', f), 'utf8').replace(/'change-me',\s*'changeme'/, ''), /\|\|\s*['"]change-me['"]/, f);
    }
  });
});

describe('http api', () => {
  /** A fake docker/wp-cli: WordPress counts as installed once `core install` ran. */
  function fakeRunner(calls) {
    let installed = false;
    return async (file, args) => {
      calls.push([file, ...args].join(' '));
      const joined = args.join(' ');
      if (joined.includes('core is-installed')) {
        if (!installed) throw new Error('not installed');
        return '';
      }
      if (joined.includes('core install')) installed = true;
      if (joined.includes('network create')) throw new Error('already exists');
      if (joined.includes('post list')) return '7';
      if (joined.includes('retrieve_password')) return 'sent';
      if (args[0] === 'ps') return '';
      return '';
    };
  }

  async function start() {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'prov-'));
    const config = loadConfig({ PROVISIONER_SECRET: SECRET, DATA_DIR: dataDir, CADDY_SITES_DIR: path.join(dataDir, 'caddy'), MAX_SITES: '2' });
    const calls = [];
    const manager = new SiteManager(config, fakeRunner(calls));
    const server = createServer(config, manager);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = async (method, p, body, headers) => {
      const text = body === undefined ? '' : JSON.stringify(body);
      const signed = headers ?? signRequest(SECRET, { method, path: p, body: text });
      const res = await fetch(base + p, { method, headers: { ...signed, 'Content-Type': 'application/json' }, body: text || undefined });
      return { status: res.status, body: await res.json() };
    };
    const close = async () => { server.close(); await rm(dataDir, { recursive: true, force: true }); };
    return { call, manager, calls, close };
  }

  const req = (n = 'acme-travel') => ({ siteId: 'site-1', slug: n, domain: `${n}.sites.example.test`, companyName: 'Acme "Travel" $(rm -rf /)', adminEmail: 'owner@acme.test', minimal: true });

  test('unsigned, stale and wrongly signed requests get 401; /health needs no signature', async () => {
    const t = await start();
    try {
      assert.equal((await t.call('GET', '/health')).status, 200);
      assert.equal((await t.call('POST', '/sites', req(), {})).status, 401);
      const stale = signRequest(SECRET, { method: 'POST', path: '/sites', body: JSON.stringify(req()), nowMs: Date.now() - 400_000 });
      assert.equal((await t.call('POST', '/sites', req(), stale)).status, 401);
      const wrong = signRequest('x'.repeat(30), { method: 'POST', path: '/sites', body: JSON.stringify(req()) });
      assert.equal((await t.call('POST', '/sites', req(), wrong)).status, 401);
      assert.equal(t.calls.length, 0, 'nothing was run for rejected requests');
    } finally { await t.close(); }
  });

  test('POST /sites builds one site, a repeat creates no second one, GET reports active', async () => {
    const t = await start();
    try {
      const first = await t.call('POST', '/sites', req());
      assert.ok([200, 202].includes(first.status));
      assert.equal(first.body.created, true);
      assert.equal(first.body.dbPassword, undefined, 'the database password is never returned');
      await t.manager.settled('acme-travel');
      const again = await t.call('POST', '/sites', req());
      assert.equal(again.status, 200);
      assert.equal(again.body.status, 'active');
      assert.equal(again.body.created, false);
      assert.equal(again.body.adminUrl, 'https://acme-travel.sites.example.test/wp-admin/');
      assert.equal(t.calls.filter((c) => c.includes('compose') && c.includes(' up')).length, 1);
      assert.equal(t.calls.filter((c) => c.includes('core install')).length, 1);
      const got = await t.call('GET', '/sites/acme-travel');
      assert.equal(got.body.status, 'active');
      assert.equal(got.body.resetEmailSent, true);
      const other = await t.call('POST', '/sites', { ...req(), siteId: 'site-2' });
      assert.equal(other.status, 409, 'a slug belongs to one site');
    } finally { await t.close(); }
  });

  test('bad input is a 400 and the site limit is a 503', async () => {
    const t = await start();
    try {
      assert.equal((await t.call('POST', '/sites', { ...req(), slug: 'Bad Slug!' })).status, 400);
      assert.equal((await t.call('POST', '/sites', { ...req(), adminEmail: 'nope' })).status, 400);
      assert.equal((await t.call('GET', '/sites/none')).status, 404);
      await t.call('POST', '/sites', { ...req('one-travel'), siteId: 'a' });
      await t.call('POST', '/sites', { ...req('two-travel'), siteId: 'b' });
      assert.equal((await t.call('POST', '/sites', { ...req('three-travel'), siteId: 'c' })).status, 503);
      await t.manager.settled('one-travel');
      await t.manager.settled('two-travel');
    } finally { await t.close(); }
  });
});
