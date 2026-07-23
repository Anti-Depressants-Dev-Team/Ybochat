const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Settings
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),

  // Telegram - native launch
  telegramLaunch: () => ipcRenderer.invoke('telegram:launch'),

  // Telegram - HWND embed
  telegramEmbed: () => ipcRenderer.invoke('telegram:embed'),
  telegramShowEmbedded: () => ipcRenderer.invoke('telegram:show-embedded'),
  telegramHideEmbedded: () => ipcRenderer.invoke('telegram:hide-embedded'),
  telegramDetach: () => ipcRenderer.invoke('telegram:detach'),
  telegramIsEmbedded: () => ipcRenderer.invoke('telegram:is-embedded'),
});
