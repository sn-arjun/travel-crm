/**
 * Type definitions for the Electron preload API
 * exposed via contextBridge in electron/preload.ts.
 *
 * Available in renderer as: window.electronAPI
 */
interface ElectronAPI {
  // Window controls
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;

  // App info
  getVersion: () => Promise<string>;
  getPlatform: () => Promise<string>;

  // Event listeners (return cleanup function)
  onShortcut: (callback: (shortcut: string) => void) => () => void;
  onQuickAction: (callback: (action: string) => void) => () => void;

  // Runtime server address (writes userData/config.json and relaunches the app)
  setApiUrl: (url: string) => Promise<{ ok: boolean; error?: string }>;

  // Auto-update
  onUpdateReady: (callback: (version: string) => void) => () => void;
  installUpdate: () => Promise<void>;
}

interface TravelcrmRuntimeConfig {
  apiUrl?: string;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
    travelcrmConfig?: TravelcrmRuntimeConfig;
  }
}

export {};
