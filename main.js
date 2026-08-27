const { app, BrowserWindow, ipcMain, Menu, nativeImage, Tray } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('node:path');
const fs = require('node:fs');
const { ensureVencordExtension } = require('./scripts/vencord-extension');

let mainWin = null;
let settingsWin = null;
let tray = null;
let isQuitting = false;

const defaultSettings = {
  accounts: [],
  horizontalTabs: false,
  streamerMode: false,
  closeToTray: true,
  autoStart: true
};
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

// Settings written before multi-account support only listed enabled app ids.
// Each becomes a single account keeping its original session, so upgrading
// never signs anybody out.
function migrateAccounts(saved) {
  if (Array.isArray(saved.accounts)) return saved.accounts;
  if (!Array.isArray(saved.enabledApps)) return [];
  return saved.enabledApps.map(id => ({
    uid: id,
    app: id,
    name: null,
    partition: id === 'vencord' ? 'persist:vencord' : null
  }));
}

function loadSettings() {
  try {
    const saved = fs.existsSync(settingsPath)
      ? JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
      : {};
    return { ...defaultSettings, ...saved, accounts: migrateAccounts(saved) };
  } catch (e) {
    return { ...defaultSettings };
  }
}

let settings = loadSettings();

// Prevent embedded sites from opening the Windows Security passkey dialog.
app.commandLine.appendSwitch('disable-features', 'WebAuthentication');

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) app.quit();

function showMainWindow() {
  if (!mainWin) createWindow();
  if (mainWin.isMinimized()) mainWin.restore();
  mainWin.show();
  mainWin.focus();
}

function syncTray() {
  if (!settings.closeToTray) {
    tray?.destroy();
    tray = null;
    return;
  }

  if (tray) return;

  const trayIcon = nativeImage.createFromPath(path.join(__dirname, 'chat.png')).resize({ width: 16, height: 16 });
  tray = new Tray(trayIcon);
  tray.setToolTip('Ybochat');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show Ybochat', click: showMainWindow },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]));
  tray.on('double-click', showMainWindow);
}

function syncAutoStart() {
  // Avoid registering electron.exe as a startup app during local development.
  if (!app.isPackaged || !['win32', 'darwin'].includes(process.platform)) return;
  app.setLoginItemSettings({
    openAtLogin: settings.autoStart,
    path: process.execPath
  });
}

// ── Auto update ─────────────────────────────────────────────────────────────

autoUpdater.autoDownload = false;

autoUpdater.on('update-available', () => {
  mainWin?.webContents.send('update:available');
  autoUpdater.downloadUpdate();
});

autoUpdater.on('update-downloaded', () => {
  mainWin?.webContents.send('update:downloaded');
});

autoUpdater.on('error', (err) => {
  console.error('Update error:', err.message);
});

// ── Windows ────────────────────────────────────────────────────────────────
const createWindow = () => {
  mainWin = new BrowserWindow({
    width: 1000, height: 700, minWidth: 600, minHeight: 400,
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
  mainWin.on('close', (event) => {
    if (settings.closeToTray && !isQuitting) {
      event.preventDefault();
      mainWin.hide();
    }
  });
  mainWin.on('closed', () => { mainWin = null; });
};

function createSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    if (settingsWin.isMinimized()) settingsWin.restore();
    settingsWin.show();
    settingsWin.focus();
    return;
  }

  settingsWin = new BrowserWindow({
    width: 460, height: 720, minWidth: 380, minHeight: 360,
    title: 'Ybochat Settings',
    icon: path.join(__dirname, 'chat.png'),
    parent: mainWin ?? undefined,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#161616',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#161616', symbolColor: '#ffffff', height: 32 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  });
  settingsWin.loadFile('settings.html');
  settingsWin.once('ready-to-show', () => {
    settingsWin.setContentProtection(settings.streamerMode);
    settingsWin.show();
  });
  settingsWin.on('closed', () => { settingsWin = null; });
}

const liveWindows = () => [mainWin, settingsWin].filter(win => win && !win.isDestroyed());

app.whenReady().then(() => {
  createWindow();
  syncTray();
  syncAutoStart();
  // Check for updates after a few seconds
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000);
  app.on('activate', showMainWindow);
});
app.on('second-instance', showMainWindow);
app.on('before-quit', () => { isQuitting = true; });
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !settings.closeToTray) app.quit();
});

ipcMain.handle('settings:load', () => ({ ...settings }));
ipcMain.handle('settings:save', (event, s) => {
  try {
    settings = { ...defaultSettings, ...s };
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    syncTray();
    syncAutoStart();
    // Keep the other window in step with whichever one made the change.
    for (const win of liveWindows()) {
      if (win.webContents.id !== event.sender.id) win.webContents.send('settings:changed', { ...settings });
    }
    return true;
  }
  catch (e) { return false; }
});

ipcMain.handle('settings:open', () => {
  createSettingsWindow();
  return true;
});

ipcMain.handle('vencord:ensure', async (_, partition) => {
  try {
    await ensureVencordExtension(partition);
    return { ok: true };
  } catch (error) {
    console.error('Could not load Vencord Web:', error);
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('streamer:set-mode', (_, enabled) => {
  const windows = liveWindows();
  if (!windows.length) return false;
  for (const win of windows) win.setContentProtection(enabled);
  return true;
});

ipcMain.handle('update:check', () => {
  autoUpdater.checkForUpdates();
});

ipcMain.handle('update:install', () => {
  autoUpdater.quitAndInstall();
});
