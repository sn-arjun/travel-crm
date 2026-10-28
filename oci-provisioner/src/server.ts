import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { loadConfig, ConfigError, type ProvisionerConfig } from './config.ts';
import { verifyRequest } from './signature.ts';
import { SiteManager, SiteError, publicView, validateRequest } from './sites.ts';
import { createSiteManager } from './shared-sites.ts';

/**
 * WordPress provisioner HTTP API (R309). Plain node:http, no framework, no dependencies.
 *
 *   GET    /health               no signature; status only
 *   POST   /sites                create a site (idempotent per slug). 200 = active, 202 = being built
 *   GET    /sites/:slug          state of one site
 *   POST   /sites/:slug/stop     stop the containers
 *   POST   /sites/:slug/start    start them again
 *   DELETE /sites/:slug          remove the containers
 *
 * Every route except /health needs X-Timestamp and X-Signature (see signature.ts). The server will not
 * start without PROVISIONER_SECRET.
 */

const MAX_BODY_BYTES = 64 * 1024;

function send(res: http.ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) });
  res.end(text);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new SiteError('Request body too large', 413));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function createServer(config: ProvisionerConfig, sites: SiteManager, nowMs: () => number = Date.now): http.Server {
  return http.createServer(async (req, res) => {
    try {
      const target = req.url ?? '/';
      const method = (req.method ?? 'GET').toUpperCase();
      const pathname = target.split('?')[0];

      if (method === 'GET' && pathname === '/health') {
        return send(res, 200, { status: 'ok', uptime: process.uptime(), maxSites: config.maxSites, mode: config.mode });
      }

      // Caddy on-demand TLS asks "may I get a certificate for this host?" (internal network only; answers yes or no, nothing else).
      if (method === 'GET' && pathname === '/tls-check') {
        const domain = new URL(target, 'http://x').searchParams.get('domain') ?? '';
        return (await sites.hostKnown(domain)) ? send(res, 200, { ok: true }) : send(res, 404, { ok: false });
      }

      const body = await readBody(req);
      const check = verifyRequest(config.secret, {
        method,
        path: target,
        body,
        timestamp: req.headers['x-timestamp'] as string | undefined,
        signature: req.headers['x-signature'] as string | undefined,
        nowMs: nowMs(),
      });
      if (!check.ok) {
        console.warn(`Rejected ${method} ${pathname}: ${check.reason}`);
        return send(res, 401, { error: 'Unauthorized', reason: check.reason });
      }

      if (method === 'POST' && pathname === '/sites') {
        let parsed: unknown;
        try {
          parsed = JSON.parse(body || '{}');
        } catch {
          return send(res, 400, { error: 'Body must be JSON' });
        }
        const { state, started } = await sites.ensure(validateRequest(parsed));
        return send(res, state.status === 'active' ? 200 : 202, { ...publicView(state), created: started });
      }

      const match = /^\/sites\/([a-z0-9-]+)(?:\/(stop|start))?$/.exec(pathname);
      if (match) {
        const [, slug, action] = match;
        if (method === 'GET' && !action) {
          const state = await sites.get(slug);
          return state ? send(res, 200, publicView(state)) : send(res, 404, { error: 'No such site' });
        }
        if (method === 'POST' && action) {
          const state = action === 'stop' ? await sites.stop(slug) : await sites.start(slug);
          return state ? send(res, 200, publicView(state)) : send(res, 404, { error: 'No such site' });
        }
        if (method === 'DELETE' && !action) {
          return (await sites.destroy(slug)) ? send(res, 200, { success: true }) : send(res, 404, { error: 'No such site' });
        }
      }
      return send(res, 404, { error: 'Not found' });
    } catch (e) {
      if (e instanceof SiteError) return send(res, e.status, { error: e.message });
      console.error('Unhandled error:', e);
      return send(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
  });
}

function main(): void {
  let config: ProvisionerConfig;
  try {
    config = loadConfig(process.env);
  } catch (e) {
    if (e instanceof ConfigError) {
      console.error(`FATAL: ${e.message}`);
      process.exit(1);
    }
    throw e;
  }
  if (config.mode === 'shared' && !config.sitesDomain) {
    console.error('FATAL: WP_SITES_DOMAIN is not set (shared mode creates <slug>.<WP_SITES_DOMAIN> sites).');
    process.exit(1);
  }
  const server = createServer(config, createSiteManager(config));
  server.listen(config.port, () => {
    console.log(`WP Provisioner running on :${config.port} (mode ${config.mode}, up to ${config.maxSites} sites)`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
