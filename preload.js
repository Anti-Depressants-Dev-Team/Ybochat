const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (s) => ipcRenderer.invoke('settings:save', s),
  openSettings: () => ipcRenderer.invoke('settings:open'),
  ensureVencord: (partition) => ipcRenderer.invoke('vencord:ensure', partition),
  getShareSources: () => ipcRenderer.invoke('screenshare:sources'),
  chooseShareSource: (id, audio) => ipcRenderer.invoke('screenshare:choose', id, audio),
  cancelShare: () => ipcRenderer.invoke('screenshare:cancel'),
  loopbackSupported: () => ipcRenderer.invoke('screenshare:loopback-supported'),
  setStreamerMode: (enabled) => ipcRenderer.invoke('streamer:set-mode', enabled),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onSettingsChanged: (cb) => { const h = (_, s) => cb(s); ipcRenderer.on('settings:changed', h); return () => ipcRenderer.removeListener('settings:changed', h); },
  onUpdateAvailable: (cb) => { const h = () => cb(); ipcRenderer.on('update:available', h); return () => ipcRenderer.removeListener('update:available', h); },
  onUpdateDownloaded: (cb) => { const h = () => cb(); ipcRenderer.on('update:downloaded', h); return () => ipcRenderer.removeListener('update:downloaded', h); },
});
