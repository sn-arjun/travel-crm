// Shared (WordPress Multisite) driver, tested with a fake docker / wp-cli runner. Run: node --test "test/*.test.mjs"
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { signRequest } from '../src/signature.ts';
import { loadConfig } from '../src/config.ts';
import { createServer } from '../src/server.ts';
import { createSiteManager, SharedSiteManager } from '../src/shared-sites.ts';
import { SiteManager } from '../src/sites.ts';

const SECRET = 'unit-test-secret-0123456789abcdef';
const BASE = 'sites.example.test';

/** A fake Multisite: remembers sites, archived flags and users the way wp-cli would. */
function fakeNetwork(calls) {
  const net = { multisite: false, installed: false, sites: new Map(), archived: new Set(), users: new Map(), nextId: 2, options: new Map() };
  const runner = async (file, args) => {
    calls.push([file, ...args]);
    const a = args.filter((x) => x !== '--allow-root');
    const i = a.indexOf('wp');
    const w = a.slice(i + 1);
    const url = (w.find((x) => x.startsWith('--url=')) ?? '').slice(6);
    const arg = (n) => (w.find((x) => x.startsWith(`--${n}=`)) ?? '').slice(n.length + 3);
    const cmd = w.filter((x) => !x.startsWith('--') || x === '--info').join(' ');
    if (w[0] === '--info' || (w[0] === 'eval' && w[2] === undefined && false)) return '';
    if (w[0] === 'core' && w[1] === 'is-installed') {
      if (w.includes('--network') ? net.multisite : net.installed) return '';
      throw new Error('not installed');
    }
    if (w[0] === 'core' && w[1] === 'install') { net.installed = true; return ''; }
    if (w[0] === 'core' && w[1] === 'multisite-convert') { net.multisite = true; return ''; }
    if (w[0] === 'site' && w[1] === 'list') {
      const id = net.sites.get(arg('domain'));
      return id ? String(id) : '';
    }
    if (w[0] === 'site' && w[1] === 'create') {
      const domain = `${arg('slug')}.${BASE}`;
      const id = net.nextId++;
      net.sites.set(domain, id);
      net.users.set(arg('email'), arg('email').split('@')[0]);
      return String(id);
    }
    if (w[0] === 'site' && w[1] === 'archive') { net.archived.add(Number(w[2])); return ''; }
    if (w[0] === 'site' && w[1] === 'unarchive') { net.archived.delete(Number(w[2])); return ''; }
    if (w[0] === 'site' && w[1] === 'delete') {
      for (const [d, id] of net.sites) if (id === Number(w[2])) net.sites.delete(d);
      return '';
    }
    if (w[0] === 'user' && w[1] === 'get') {
      const login = net.users.get(w[2]);
      if (!login) throw new Error('no such user');
      return login;
    }
    if (w[0] === 'option' && w[1] === 'get') {
      const k = `${url}|${w[2]}`;
      if (!net.options.has(k)) throw new Error('no such option');
      return net.options.get(k);
    }
    if (w[0] === 'option' && w[1] === 'update') { net.options.set(`${url}|${w[2]}`, w[3]); return ''; }
    if (w[0] === 'post' && w[1] === 'list') return '7';
    if (w[0] === 'eval') return 'sent';
    return cmd && '';
  };
  return { net, runner };
}

async function start(extraEnv = {}, mode) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'prov-shared-'));
  const config = loadConfig({
    PROVISIONER_SECRET: SECRET, DATA_DIR: dataDir, WP_SITES_DOMAIN: BASE, WP_NETWORK_ADMIN_EMAIL: 'ops@example.test', MAX_SITES: '3', ...(mode ? { PROVISIONER_MODE: mode } : {}), ...extraEnv,
  });
  const calls = [];
  const { net, runner } = fakeNetwork(calls);
  const manager = createSiteManager(config, runner);
  const server = createServer(config, manager);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, p, body) => {
    const text = body === undefined ? '' : JSON.stringify(body);
    const res = await fetch(base + p, { method, headers: { ...signRequest(SECRET, { method, path: p, body: text }), 'Content-Type': 'application/json' }, body: text || undefined });
    return { status: res.status, body: await res.json() };
  };
  const close = async () => { server.close(); await rm(dataDir, { recursive: true, force: true }); };
  return { call, manager, calls, net, config, close, port: server.address().port };
}

const req = (slug = 'acme-travel', over = {}) => ({
  siteId: 'site-1', slug, domain: `${slug}.${BASE}`, companyName: 'Acme "Travel" $(rm -rf /); `id`', adminEmail: 'owner@acme.test', minimal: true, ...over,
});
const count = (calls, ...needle) => calls.filter((c) => needle.every((n) => c.includes(n))).length;

describe('shared mode', () => {
  test('shared is the default mode, and container stays selectable', async () => {
    const dataDir = '/tmp/x';
    const shared = loadConfig({ PROVISIONER_SECRET: SECRET, DATA_DIR: dataDir });
    assert.equal(shared.mode, 'shared');
    assert.ok(createSiteManager(shared) instanceof SharedSiteManager);
    const container = loadConfig({ PROVISIONER_SECRET: SECRET, PROVISIONER_MODE: 'container' });
    assert.equal(container.mode, 'container');
    assert.ok(!(createSiteManager(container) instanceof SharedSiteManager));
    assert.ok(createSiteManager(container) instanceof SiteManager);
  });

  test('MAX_SITES for the shared shape: 12 GB gives 88, 24 GB gives 280; an explicit value wins', () => {
    const gb = 1024 ** 3;
    assert.equal(loadConfig({ PROVISIONER_SECRET: SECRET }, 12 * gb).maxSites, 88); // (12288 - 2048 - 4608) / 64
    assert.equal(loadConfig({ PROVISIONER_SECRET: SECRET }, 24 * gb).maxSites, 280); // (24576 - 2048 - 4608) / 64
    assert.equal(loadConfig({ PROVISIONER_SECRET: SECRET, MAX_SITES: '40' }, 12 * gb).maxSites, 40);
  });

  test('create builds the network once, then one site; the answer is the usual state document', async () => {
    const t = await start();
    try {
      const first = await t.call('POST', '/sites', req());
      assert.ok([200, 202].includes(first.status));
      assert.equal(first.body.created, true);
      await t.manager.settled('acme-travel');
      const got = await t.call('GET', '/sites/acme-travel');
      assert.equal(got.status, 200);
      assert.equal(got.body.status, 'active');
      assert.equal(got.body.siteUrl, `https://acme-travel.${BASE}`);
      assert.equal(got.body.adminUrl, `https://acme-travel.${BASE}/wp-admin/`);
      assert.equal(got.body.siteId, 'site-1');
      assert.equal(got.body.mode, 'shared');
      assert.equal(got.body.resetEmailSent, true);
      assert.equal(got.body.error, null);
      assert.equal(count(t.calls, 'multisite-convert'), 1);
      assert.equal(count(t.calls, 'site', 'create'), 1);
      assert.equal(count(t.calls, 'core', 'install'), 1);
      assert.equal(count(t.calls, 'docker', 'run'), 0, 'no container is started per site');
    } finally { await t.close(); }
  });

  test('create is idempotent per slug: a repeat and a second site do not rebuild the network or the site', async () => {
    const t = await start();
    try {
      await t.call('POST', '/sites', req());
      await t.manager.settled('acme-travel');
      const again = await t.call('POST', '/sites', req());
      assert.equal(again.status, 200);
      assert.equal(again.body.created, false);
      assert.equal(count(t.calls, 'site', 'create'), 1);
      await t.call('POST', '/sites', req('beta-tours', { siteId: 'site-2', adminEmail: 'b@beta.test' }));
      await t.manager.settled('beta-tours');
      assert.equal(count(t.calls, 'site', 'create'), 2);
      assert.equal(count(t.calls, 'multisite-convert'), 1);
      assert.equal(count(t.calls, 'core', 'install'), 1);
    } finally { await t.close(); }
  });

  test('a failed build is retried by the next POST and does not duplicate the site or its pages', async () => {
    const t = await start();
    try {
      const inner = t.manager.run;
      let fail = true;
      t.manager.run = async (f, a) => {
        if (fail && a.includes('post') && a.includes('create')) throw new Error('boom');
        return inner(f, a);
      };
      await t.call('POST', '/sites', req());
      await t.manager.settled('acme-travel');
      assert.equal((await t.call('GET', '/sites/acme-travel')).body.status, 'failed');
      fail = false;
      const retry = await t.call('POST', '/sites', req());
      assert.equal(retry.body.created, true);
      await t.manager.settled('acme-travel');
      assert.equal((await t.call('GET', '/sites/acme-travel')).body.status, 'active');
      assert.equal(count(t.calls, 'site', 'create'), 1, 'the site made by the first attempt is reused');
    } finally { await t.close(); }
  });

  test('stop archives the site, start unarchives it, both are repeatable', async () => {
    const t = await start();
    try {
      await t.call('POST', '/sites', req());
      await t.manager.settled('acme-travel');
      const id = t.net.sites.get(`acme-travel.${BASE}`);
      const stopped = await t.call('POST', '/sites/acme-travel/stop');
      assert.equal(stopped.body.status, 'stopped');
      assert.ok(t.net.archived.has(id));
      await t.call('POST', '/sites/acme-travel/stop');
      assert.equal(count(t.calls, 'site', 'archive'), 1);
      // a create while stopped changes nothing
      assert.equal((await t.call('POST', '/sites', req())).body.status, 'stopped');
      const started = await t.call('POST', '/sites/acme-travel/start');
      assert.equal(started.body.status, 'active');
      assert.ok(!t.net.archived.has(id));
      assert.equal((await t.call('POST', '/sites/none-here/stop')).status, 404);
    } finally { await t.close(); }
  });

  test('delete removes the site from the network and its state; a second delete is 404', async () => {
    const t = await start();
    try {
      await t.call('POST', '/sites', req());
      await t.manager.settled('acme-travel');
      const del = await t.call('DELETE', '/sites/acme-travel');
      assert.equal(del.status, 200);
      assert.equal(t.net.sites.size, 0);
      assert.equal((await t.call('GET', '/sites/acme-travel')).status, 404);
      assert.equal((await t.call('DELETE', '/sites/acme-travel')).status, 404);
      // the slug can be used again afterwards
      assert.ok([200, 202].includes((await t.call('POST', '/sites', req('acme-travel', { siteId: 'site-9' }))).status));
      await t.manager.settled('acme-travel');
    } finally { await t.close(); }
  });

  test('/tls-check (Caddy on-demand TLS) says yes only for the network host and known sites', async () => {
    const t = await start();
    try {
      await t.call('POST', '/sites', req());
      await t.manager.settled('acme-travel');
      const ask = async (d) => (await fetch(`http://127.0.0.1:${t.port}/tls-check?domain=${encodeURIComponent(d)}`)).status;
      assert.equal(await ask(`acme-travel.${BASE}`), 200);
      assert.equal(await ask(`network.${BASE}`), 200);
      assert.equal(await ask(`unknown.${BASE}`), 404);
      assert.equal(await ask(`acme-travel.evil.test`), 404);
      assert.equal(await ask(''), 404);
    } finally { await t.close(); }
  });

  test('a slug that belongs to another site is a 409; a wrong domain is a 400; the limit is a 503', async () => {
    const t = await start();
    try {
      await t.call('POST', '/sites', req());
      await t.manager.settled('acme-travel');
      assert.equal((await t.call('POST', '/sites', req('acme-travel', { siteId: 'other' }))).status, 409);
      assert.equal((await t.call('POST', '/sites', req('gamma-trips', { siteId: 'g', domain: 'gamma-trips.evil.test' }))).status, 400);
      await t.call('POST', '/sites', req('one-tours', { siteId: 'a' }));
      await t.call('POST', '/sites', req('two-tours', { siteId: 'b' }));
      assert.equal((await t.call('POST', '/sites', req('three-tours', { siteId: 'c' }))).status, 503);
      await t.manager.settled('one-tours');
      await t.manager.settled('two-tours');
    } finally { await t.close(); }
  });

  test('no password is returned, logged in a command, or stored in the state document', async () => {
    const t = await start();
    try {
      const first = await t.call('POST', '/sites', req());
      await t.manager.settled('acme-travel');
      const got = await t.call('GET', '/sites/acme-travel');
      for (const body of [first.body, got.body]) {
        assert.equal(body.dbPassword, undefined);
        assert.ok(!JSON.stringify(body).toLowerCase().includes('password'));
      }
      // the only password handed to wp-cli is the network owner's one-time install value; the agency admin never gets one from us
      const agencyCalls = t.calls.filter((c) => c.some((x) => x.includes('site-1') || x.includes('acme')));
      assert.ok(agencyCalls.every((c) => !c.some((x) => x.startsWith('--admin_password') || x.startsWith('--user_pass'))));
      assert.equal(t.calls.filter((c) => c.some((x) => x.includes('retrieve_password'))).length, 1, 'WordPress sends the password e-mail itself');
    } finally { await t.close(); }
  });

  test('arguments are never joined into a shell string: hostile names stay one argument each', async () => {
    const t = await start();
    try {
      await t.call('POST', '/sites', req());
      await t.manager.settled('acme-travel');
      const create = t.calls.find((c) => c.includes('create') && c.includes('site'));
      assert.ok(create.includes('--title=Acme "Travel" $(rm -rf /); `id`'));
      assert.ok(t.calls.every((c) => c[0] === 'docker'), 'only docker is executed, never a shell');
      assert.ok(t.calls.every((c) => !['sh', 'bash', '-c'].some((s) => c.includes(s))));
      // hostile identifiers are refused before anything runs
      const before = t.calls.length;
      for (const bad of [{ slug: 'a;rm -rf' }, { slug: '$(id)abc' }, { adminEmail: '-oProxyCommand=x@y.z' }, { slug: '../etc' }]) {
        const r = await t.call('POST', '/sites', req('zeta-tours', { siteId: 'z', ...bad }));
        assert.equal(r.status, 400, JSON.stringify(bad));
      }
      assert.equal(t.calls.length, before);
      // the login reaches PHP through the environment, not through the PHP text
      const evalCall = t.calls.find((c) => c.some((x) => x.includes('retrieve_password')));
      assert.ok(evalCall.includes('-e') && evalCall.some((x) => x.startsWith('PROV_LOGIN=')));
      assert.ok(!evalCall.find((x) => x.includes('retrieve_password')).includes('owner'));
    } finally { await t.close(); }
  });
});
