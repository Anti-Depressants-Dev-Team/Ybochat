const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (s) => ipcRenderer.invoke('settings:save', s),
  setStreamerMode: (enabled) => ipcRenderer.invoke('streamer:set-mode', enabled),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateAvailable: (cb) => { const h = () => cb(); ipcRenderer.on('update:available', h); return () => ipcRenderer.removeListener('update:available', h); },
  onUpdateDownloaded: (cb) => { const h = () => cb(); ipcRenderer.on('update:downloaded', h); return () => ipcRenderer.removeListener('update:downloaded', h); },
});
