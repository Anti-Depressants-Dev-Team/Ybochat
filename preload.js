const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (s) => ipcRenderer.invoke('settings:save', s),
  setStreamerMode: (enabled) => ipcRenderer.invoke('streamer:set-mode', enabled),
  fetchUrl: (url) => ipcRenderer.invoke('fetch-url', url),
});
