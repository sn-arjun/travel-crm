import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  shell,
  ipcMain,
  globalShortcut,
  dialog,
  session,
} from 'electron';
import path from 'path';
import { startNextServer, nextServerLogPath, type NextServer } from './next-server';
import { setupRuntimeConfigIpc } from './runtime-config';
import { setupUpdater } from './updater';
import { allowPermission } from './permissions';

// ─── Constants ──────────────────────────────────────────────
const DEV_URL = 'http://localhost:3100';
const isProd = app.isPackaged;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let nextServer: NextServer | null = null;
let appUrl = DEV_URL;

// Tests (and portable setups) can pin the profile directory; this also scopes the single-instance lock.
if (process.env.TRAVELCRM_USER_DATA) {
  app.setPath('userData', process.env.TRAVELCRM_USER_DATA);
}

function stopNextServer(): void {
  nextServer?.stop();
  nextServer = null;
}

function relaunchApp(): void {
  stopNextServer();
  app.relaunch();
  app.exit(0);
}

// ─── Permissions ────────────────────────────────────────────
// The softphone needs the microphone, for the app's own loopback origin only; everything else is refused (R307).
function installPermissionHandlers(): void {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, permission, callback, details) => {
    callback(allowPermission(permission, details.requestingUrl, appUrl, { mediaTypes: (details as { mediaTypes?: Array<'audio' | 'video' | 'unknown'> }).mediaTypes }));
  });
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin, details) => {
    return allowPermission(permission, requestingOrigin, appUrl, { mediaType: (details as { mediaType?: 'audio' | 'video' | 'unknown' }).mediaType });
  });
}

// ─── Window Creation ────────────────────────────────────────
function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'TravelCRM Pro',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    frame: process.platform !== 'darwin',
    backgroundColor: '#F9FAFB',
    show: false, // Show after ready-to-show to prevent flash
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Load the app: the bundled Next server in production, the dev server otherwise
  void mainWindow.loadURL(appUrl);

  // Show window when ready (prevents white flash)
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  // Open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open DevTools in development
  if (!isProd) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// ─── System Tray ────────────────────────────────────────────
function createTray(): void {
  const trayPng = isProd
    ? path.join(process.resourcesPath, 'tray.png')
    : path.join(__dirname, '..', '..', 'build-resources', 'tray.png');
  let icon = nativeImage.createFromPath(trayPng);
  if (!icon.isEmpty()) icon = icon.resize({ width: 16, height: 16 });
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open TravelCRM Pro',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createMainWindow();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'New Lead',
      accelerator: 'CmdOrCtrl+Shift+L',
      click: () => {
        mainWindow?.webContents.send('quick-action', 'new-lead');
        mainWindow?.show();
      },
    },
    {
      label: 'New Contact',
      accelerator: 'CmdOrCtrl+Shift+C',
      click: () => {
        mainWindow?.webContents.send('quick-action', 'new-contact');
        mainWindow?.show();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      accelerator: 'CmdOrCtrl+Q',
      click: () => app.quit(),
    },
  ]);

  tray.setToolTip('TravelCRM Pro');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    }
  });
}

// ─── App Menu (macOS) ───────────────────────────────────────
function createAppMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(process.platform === 'darwin'
          ? [{ type: 'separator' as const }, { role: 'front' as const }]
          : [{ role: 'close' as const }]),
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── IPC Handlers ───────────────────────────────────────────
function setupIPC(): void {
  // Window controls (for custom title bar)
  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.handle('window:close', () => mainWindow?.close());
  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized());

  // App info
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('app:platform', () => process.platform);

  // Runtime config (server address) and updates
  setupRuntimeConfigIpc(relaunchApp);
}

// ─── Global Shortcuts ───────────────────────────────────────
function registerGlobalShortcuts(): void {
  // Command palette
  globalShortcut.register('CmdOrCtrl+K', () => {
    mainWindow?.webContents.send('shortcut', 'command-palette');
    mainWindow?.show();
    mainWindow?.focus();
  });
}

// ─── App Lifecycle ──────────────────────────────────────────
// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    setupIPC(); // config:get must be registered before the preload runs

    if (isProd) {
      try {
        nextServer = await startNextServer({ serverDir: path.join(process.resourcesPath, 'app-server') });
        appUrl = nextServer.url;
        process.env.TRAVELCRM_SERVER_URL = nextServer.url;
        process.env.TRAVELCRM_SERVER_PID = String(nextServer.pid);
      } catch (err) {
        stopNextServer();
        dialog.showErrorBox(
          'TravelCRM Pro could not start',
          `${(err as Error).message}

Details: ${nextServerLogPath()}`,
        );
        app.exit(1);
        return;
      }
    }

    createMainWindow();
    createTray();
    createAppMenu();
    registerGlobalShortcuts();
    setupUpdater(() => mainWindow);

    app.on('activate', () => {
      // macOS: re-create window when dock icon clicked
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    stopNextServer();
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('before-quit', stopNextServer);

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    stopNextServer();
  });

  process.on('exit', stopNextServer);
  process.on('uncaughtException', (err) => {
    console.error(err);
    stopNextServer();
  });
}
