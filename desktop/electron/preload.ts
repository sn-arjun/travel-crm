import { contextBridge, ipcRenderer } from 'electron';

/**
 * Preload script: Exposes a safe subset of Electron APIs
 * to the renderer process via contextBridge.
 *
 * Access in React: window.electronAPI.minimize()
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // ─── Window Controls ────────────────────────────────
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),

  // ─── App Info ───────────────────────────────────────
  getVersion: () => ipcRenderer.invoke('app:version'),
  getPlatform: () => ipcRenderer.invoke('app:platform'),

  // ─── Event Listeners ────────────────────────────────
  onShortcut: (callback: (shortcut: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, shortcut: string) =>
      callback(shortcut);
    ipcRenderer.on('shortcut', handler);
    return () => ipcRenderer.removeListener('shortcut', handler);
  },

  onQuickAction: (callback: (action: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, action: string) =>
      callback(action);
    ipcRenderer.on('quick-action', handler);
    return () => ipcRenderer.removeListener('quick-action', handler);
  },
});
