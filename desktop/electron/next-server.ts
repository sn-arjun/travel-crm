import { app } from 'electron';
import { spawn, spawnSync, type ChildProcess } from 'child_process';
import fs from 'fs';
import http from 'http';
import net from 'net';
import path from 'path';

export interface NextServer {
  url: string;
  port: number;
  pid: number;
  stop: () => void;
}

/** Finds server.js inside the standalone output (Next nests it under the workspace path). */
export function findServerJs(root: string, maxDepth = 6): string | null {
  const walk = (dir: string, depth: number): string | null => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    if (entries.some((e) => e.isFile() && e.name === 'server.js')) return path.join(dir, 'server.js');
    if (depth >= maxDepth) return null;
    for (const e of entries) {
      if (e.isDirectory() && e.name !== 'node_modules' && e.name !== '.next') {
        const found = walk(path.join(dir, e.name), depth + 1);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(root, 0);
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
  });
}

function probe(port: number, urlPath: string): Promise<number> {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: urlPath, timeout: 2000 }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('error', () => resolve(0));
    req.on('timeout', () => {
      req.destroy();
      resolve(0);
    });
  });
}

export function nextServerLogPath(): string {
  return path.join(app.getPath('logs'), 'next-server.log');
}

export async function startNextServer(opts: { serverDir: string; timeoutMs?: number }): Promise<NextServer> {
  const serverJs = findServerJs(opts.serverDir);
  if (!serverJs) throw new Error(`server.js not found under ${opts.serverDir}`);

  const port = await freePort();
  fs.mkdirSync(app.getPath('logs'), { recursive: true });
  const log = fs.createWriteStream(nextServerLogPath(), { flags: 'a' });
  log.write(`\n--- ${new Date().toISOString()} starting ${serverJs} on 127.0.0.1:${port}\n`);

  const child: ChildProcess = spawn(process.execPath, [serverJs], {
    cwd: path.dirname(serverJs),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      NODE_ENV: 'production',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout?.pipe(log, { end: false });
  child.stderr?.pipe(log, { end: false });

  let exited = false;
  let exitInfo = '';
  child.once('exit', (code, signal) => {
    exited = true;
    exitInfo = `exited code=${code} signal=${signal}`;
    log.write(`--- server ${exitInfo}\n`);
  });

  const stop = (): void => {
    if (exited || !child.pid) return;
    exited = true;
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
    } else {
      child.kill('SIGTERM');
    }
  };

  const deadline = Date.now() + (opts.timeoutMs ?? 30_000);
  while (Date.now() < deadline) {
    if (exited) throw new Error(`Next server ${exitInfo}`);
    if ((await probe(port, '/login')) === 200) {
      return { url: `http://127.0.0.1:${port}`, port, pid: child.pid ?? 0, stop };
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  stop();
  throw new Error('Timed out waiting for the Next server to answer /login');
}
