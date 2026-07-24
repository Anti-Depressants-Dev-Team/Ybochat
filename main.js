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

// Settings
const settingsPath = path.join(app.getPath('userData'), 'settings.json');
ipcMain.handle('settings:load', () => {
  try { return fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) : {}; }
  catch (e) { return {}; }
});
ipcMain.handle('settings:save', (_, s) => {
  try { fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2), 'utf-8'); return true; }
  catch (e) { return false; }
});

// Streamer mode
ipcMain.handle('streamer:set-mode', (_, enabled) => {
  if (!mainWin) return false;
  mainWin.setContentProtection(enabled);
  return true;
});

// Fetch URL from main process (bypasses renderer CSP)
ipcMain.handle('fetch-url', async (_, url) => {
  const https = require('node:https');
  const http = require('node:http');
  const mod = url.startsWith('https') ? https : http;
  return new Promise((resolve, reject) => {
    mod.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow redirect
        mod.get(res.headers.location, (r2) => {
          let data = '';
          r2.on('data', c => data += c);
          r2.on('end', () => resolve(data));
        }).on('error', reject);
        return;
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
});
