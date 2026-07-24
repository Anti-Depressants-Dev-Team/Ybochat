const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

let mainWin = null;
let venWin = null;
let venReady = false;

// ── Vencord BrowserWindow ──────────────────────────────────────────────────

function createVencordWindow() {
  if (venWin && !venWin.isDestroyed()) return;

  const ses = session.fromPartition('persist:vencord');
  ses.webRequest.onHeadersReceived((details, cb) => {
    if (details.url.includes('discord.com') || details.url.includes('jsdelivr.net')) {
      const h = { ...details.responseHeaders };
      delete h['content-security-policy'];
      delete h['content-security-policy-report-only'];
      cb({ responseHeaders: h });
    } else {
      cb({ responseHeaders: details.responseHeaders });
    }
  });

  venWin = new BrowserWindow({
    parent: mainWin,
    frame: false,
    show: false,
    backgroundColor: '#313338',
    webPreferences: {
      preload: path.join(__dirname, 'vencord-preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
    },
  });

  venWin.loadURL('https://discord.com/app', { userAgent: UA });

  venWin.on('closed', () => {
    venWin = null;
    venReady = false;
  });
}

function syncVenBounds() {
  if (!venWin || venWin.isDestroyed() || !mainWin) return;
  const [cw, ch] = mainWin.getContentSize();
  venWin.setBounds({ x: 68, y: 32, width: Math.max(0, cw - 68), height: Math.max(0, ch - 32) });
}

function showVencord() {
  if (!venWin || venWin.isDestroyed()) createVencordWindow();
  if (!venWin || venWin.isDestroyed()) return;
  syncVenBounds();
  venWin.show();
  venReady = true;
}

function hideVencord() {
  if (venWin && !venWin.isDestroyed()) venWin.hide();
}

// ── Main window ─────────────────────────────────────────────────────────────

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

  mainWin.on('resize', syncVenBounds);
  mainWin.on('move', syncVenBounds);

  mainWin.on('closed', () => {
    if (venWin && !venWin.isDestroyed()) venWin.close();
    venWin = null;
    mainWin = null;
  });
};

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ── IPC ─────────────────────────────────────────────────────────────────────

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

ipcMain.handle('vencord:show', () => { showVencord(); });
ipcMain.handle('vencord:hide', () => { hideVencord(); });
ipcMain.handle('vencord:ready', () => { return venReady; });
