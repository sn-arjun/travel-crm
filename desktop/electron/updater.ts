import { app, ipcMain, type BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { resolveUpdateFeed } from './update-feed';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

interface UpdaterLike {
  logger: unknown;
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  on(event: string, listener: (...args: any[]) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(): void;
}

function fileLogger(file: string) {
  const write = (level: string, msg: unknown) => {
    try {
      fs.appendFileSync(file, `${new Date().toISOString()} [${level}] ${String(msg)}\n`);
    } catch {
      /* logging must never break the app */
    }
  };
  return {
    info: (m: unknown) => write('info', m),
    warn: (m: unknown) => write('warn', m),
    error: (m: unknown) => write('error', m),
    debug: (m: unknown) => write('debug', m),
  };
}

export function updaterLogPath(): string {
  return path.join(app.getPath('logs'), 'updater.log');
}

/**
 * Checks the generic feed on start and every 6 hours. The feed is the address baked into the installer at
 * build time (electron/dist/build-config.json, from TRAVELCRM_UPDATE_URL), so customer PCs update without
 * any environment variable; TRAVELCRM_UPDATE_URL at runtime overrides it (testing). Skipped in dev and when no
 * feed was baked in. electron-updater is loaded lazily so an unconfigured build never needs it.
 */
export function setupUpdater(getWindow: () => BrowserWindow | null): void {
  const resolved = resolveUpdateFeed(process.env, __dirname);
  const feed = resolved.url;
  fs.mkdirSync(app.getPath('logs'), { recursive: true });
  const logger = fileLogger(updaterLogPath());
  let updater: UpdaterLike | null = null;

  ipcMain.handle('update:install', () => {
    updater?.quitAndInstall();
  });

  if (!app.isPackaged || !feed) {
    logger.info(`updater disabled (packaged=${app.isPackaged}, feed=${feed ? `${resolved.source}:${feed}` : 'unset'})`);
    return;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    updater = (require('electron-updater') as { autoUpdater: UpdaterLike }).autoUpdater;
  } catch (err) {
    logger.error(`electron-updater is not available: ${(err as Error).message}`);
    return;
  }

  logger.info(`updater enabled (feed=${resolved.source}:${feed})`);
  (updater as unknown as { setFeedURL(o: { provider: 'generic'; url: string }): void }).setFeedURL({
    provider: 'generic',
    url: feed,
  });
  updater.logger = logger;
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = false;
  updater.on('checking-for-update', () => logger.info('checking-for-update'));
  updater.on('update-available', (info: { version?: string }) => logger.info(`update-available ${info?.version ?? ''}`));
  updater.on('update-not-available', () => logger.info('update-not-available'));
  updater.on('error', (err: Error) => logger.error(`update error: ${err?.message ?? err}`));
  updater.on('update-downloaded', (info: { version?: string }) => {
    logger.info(`update-downloaded ${info?.version ?? ''}`);
    getWindow()?.webContents.send('update:ready', info?.version ?? '');
  });

  const check = () => {
    updater?.checkForUpdates().catch((err: Error) => logger.error(`check failed: ${err?.message ?? err}`));
  };
  check();
  setInterval(check, SIX_HOURS_MS).unref();
}
