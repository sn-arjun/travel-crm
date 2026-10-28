import { app, ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';

export const DEFAULT_API_URL = 'http://localhost:8787/api/v1';

export interface RuntimeConfig {
  /** Absent in development so the web app's own NEXT_PUBLIC_API_URL fallback applies. */
  apiUrl?: string;
}

function configPath(): string {
  return path.join(app.getPath('userData'), 'config.json');
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** True for an http(s) URL whose path ends in /api/v1. */
export function isValidApiUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const u = new URL(value);
    return (u.protocol === 'http:' || u.protocol === 'https:') && /\/api\/v1\/?$/.test(u.pathname);
  } catch {
    return false;
  }
}

/** userData/config.json, then the build-time default (electron/dist/build-config.json), then localhost. */
export function loadRuntimeConfig(): RuntimeConfig {
  const user = readJson(configPath());
  if (user && isValidApiUrl(user.apiUrl)) return { apiUrl: user.apiUrl.replace(/\/+$/, '') };
  const build = readJson(path.join(__dirname, 'build-config.json'));
  if (build && isValidApiUrl(build.apiUrl)) return { apiUrl: build.apiUrl.replace(/\/+$/, '') };
  return app.isPackaged ? { apiUrl: DEFAULT_API_URL } : {};
}

export function setupRuntimeConfigIpc(relaunch: () => void): void {
  // Synchronous: the preload needs the value before any page script runs.
  ipcMain.on('config:get', (event) => {
    event.returnValue = loadRuntimeConfig();
  });

  ipcMain.handle('config:setApiUrl', (_event, url: unknown) => {
    if (!isValidApiUrl(url)) {
      return { ok: false, error: 'Enter an http(s) address ending in /api/v1' };
    }
    try {
      const existing = readJson(configPath()) ?? {};
      fs.mkdirSync(path.dirname(configPath()), { recursive: true });
      fs.writeFileSync(configPath(), JSON.stringify({ ...existing, apiUrl: url.replace(/\/+$/, '') }, null, 2));
    } catch (err) {
      return { ok: false, error: `Could not save: ${(err as Error).message}` };
    }
    setTimeout(relaunch, 100);
    return { ok: true };
  });
}
