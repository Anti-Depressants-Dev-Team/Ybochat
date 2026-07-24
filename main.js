const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

let mainWin = null;

const createWindow = () => {
  mainWin = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 600,
    minHeight: 400,
    icon: path.join(__dirname, 'chat.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#121212', symbolColor: '#ffffff', height: 32 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      contextIsolation: true
    }
  });
  mainWin.loadFile('index.html');
  mainWin.on('closed', () => { mainWin = null; });
};

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

const settingsPath = path.join(app.getPath('userData'), 'settings.json');
ipcMain.handle('settings:load', () => {
  try { return fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) : {}; }
  catch (e) { return {}; }
});
ipcMain.handle('settings:save', (_, s) => {
  try { fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2), 'utf-8'); return true; }
  catch (e) { return false; }
});

ipcMain.handle('streamer:set-mode', (_, enabled) => {
  if (!mainWin) return false;
  mainWin.setContentProtection(enabled);
  return true;
});
