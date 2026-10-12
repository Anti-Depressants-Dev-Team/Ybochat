const { app, BrowserWindow, desktopCapturer, ipcMain, Menu, nativeImage, nativeTheme, session, shell, Tray } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('node:path');
const fs = require('node:fs');
const zlib = require('node:zlib');
const { ensureVencordExtension } = require('./scripts/vencord-extension');
const themes = require('./themes.js');

let mainWin = null;
let settingsWin = null;
let shareWin = null;
let tray = null;
let isQuitting = false;

// The picker request currently waiting on the user, and the sources it listed.
let pendingShare = null;
let shareSources = [];

const defaultSettings = {
  accounts: [],
  horizontalTabs: false,
  streamerMode: false,
  closeToTray: true,
  autoStart: true,
  startMinimized: false,
  ...themes.DEFAULTS
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
  // Starting hidden needs a tray icon too, or there is no way back to the app.
  if (!settings.closeToTray && !settings.startMinimized) {
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
    { label: 'Settings', click: createSettingsWindow },
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

// ── Links and screen sharing ───────────────────────────────────────────────

// Anything outside these is never handed to the OS: a page could otherwise use
// a registered protocol to launch another application behind a harmless link.
const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

function openExternal(rawUrl) {
  let target;
  try { target = new URL(rawUrl); } catch { return; }
  if (!EXTERNAL_PROTOCOLS.has(target.protocol)) return;
  shell.openExternal(target.href);
}

const shareReadySessions = new WeakSet();

// Chat apps ask for a screen through getDisplayMedia, which Electron leaves
// unanswered unless a handler picks the source for them.
function enableScreenSharing(sess) {
  if (shareReadySessions.has(sess)) return;
  shareReadySessions.add(sess);

  sess.setDisplayMediaRequestHandler(async (_, callback) => {
    const choice = await pickShareSource();
    // An empty response is how a declined request is reported to the page.
    if (!choice) return callback({});
    callback({
      video: { id: choice.id, name: choice.name },
      ...(choice.audio ? { audio: 'loopback' } : {})
    });
  });
}

app.on('web-contents-created', (_, contents) => {
  // Links in chat apps open with target=_blank. With no handler Electron just
  // swallows them, which is why clicking a link appeared to do nothing.
  contents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });

  if (contents.getType() === 'webview') enableScreenSharing(contents.session);
});

// ── Windows ────────────────────────────────────────────────────────────────

// The native minimize/maximize/close buttons are drawn by the OS, so their
// background has to be told about the theme. The main window uses the page
// background; the settings and share windows sit on the slightly raised panel.
function windowColors(surface) {
  const theme = themes.THEMES[themes.normalizeAppearance(settings).theme];
  const color = surface === 'main' ? theme.bg : theme.panel;
  return { background: color, overlay: { color, symbolColor: theme.fg, height: 32 } };
}

function syncWindowColors() {
  const theme = themes.THEMES[themes.normalizeAppearance(settings).theme];
  // Native context menus and scrollbars follow this.
  nativeTheme.themeSource = theme.scheme;
  for (const [win, surface] of [[mainWin, 'main'], [settingsWin, 'panel'], [shareWin, 'panel']]) {
    if (!win || win.isDestroyed()) continue;
    const { background, overlay } = windowColors(surface);
    win.setBackgroundColor(background);
    try { win.setTitleBarOverlay(overlay); } catch { /* not every platform draws an overlay */ }
  }
}

const createWindow = ({ startHidden = false } = {}) => {
  const colors = windowColors('main');
  mainWin = new BrowserWindow({
    width: 1000, height: 700, minWidth: 600, minHeight: 400,
    icon: path.join(__dirname, 'chat.png'),
    show: !startHidden,
    backgroundColor: colors.background,
    titleBarStyle: 'hidden',
    titleBarOverlay: colors.overlay,
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

  const colors = windowColors('panel');
  settingsWin = new BrowserWindow({
    width: 460, height: 720, minWidth: 380, minHeight: 360,
    title: 'Ybochat Settings',
    icon: path.join(__dirname, 'chat.png'),
    // Parenting to a hidden window would hide the settings window with it, so
    // only attach when there is something to float above.
    parent: mainWin?.isVisible() ? mainWin : undefined,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: colors.background,
    titleBarStyle: 'hidden',
    titleBarOverlay: colors.overlay,
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

function createSharePicker() {
  const colors = windowColors('panel');
  shareWin = new BrowserWindow({
    width: 780, height: 620, minWidth: 520, minHeight: 420,
    title: 'Share your screen',
    icon: path.join(__dirname, 'chat.png'),
    parent: mainWin?.isVisible() ? mainWin : undefined,
    show: false,
    autoHideMenuBar: true,
    alwaysOnTop: true,
    backgroundColor: colors.background,
    titleBarStyle: 'hidden',
    titleBarOverlay: colors.overlay,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  });
  shareWin.loadFile('share-picker.html');
  shareWin.once('ready-to-show', () => {
    shareWin.setContentProtection(settings.streamerMode);
    shareWin.show();
    shareWin.focus();
  });
  shareWin.on('closed', () => {
    shareWin = null;
    // Closing the window without picking counts as declining the request.
    resolveShare(null);
  });
}

function resolveShare(choice) {
  const resolve = pendingShare;
  pendingShare = null;
  shareSources = [];
  resolve?.(choice);
  if (shareWin && !shareWin.isDestroyed()) shareWin.close();
}

function pickShareSource() {
  // One prompt at a time; anything asking while it is open is declined.
  if (pendingShare) return Promise.resolve(null);
  return new Promise(resolve => {
    pendingShare = resolve;
    createSharePicker();
  });
}

const liveWindows = () => [mainWin, settingsWin, shareWin].filter(win => win && !win.isDestroyed());

app.whenReady().then(() => {
  createWindow({ startHidden: settings.startMinimized });
  syncWindowColors();
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
    // Merge rather than replace: the main window only sends what it changed
    // (e.g. tab order), and that must not reset everything else to defaults.
    settings = { ...defaultSettings, ...settings, ...s };
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    syncTray();
    syncAutoStart();
    syncWindowColors();
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

// ── Tab context menu ───────────────────────────────────────────────────────

// A tiny solid-color circle as a PNG, so each tag color can show its swatch in
// the native menu. Built by hand to avoid relying on platform pixel order.
const swatchCache = new Map();
function colorSwatch(hex) {
  if (swatchCache.has(hex)) return swatchCache.get(hex);
  const size = 16;
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const rows = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    const row = y * (1 + size * 4);
    for (let x = 0; x < size; x++) {
      // Soft edge: alpha falls off over the last pixel of the radius.
      const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2);
      const alpha = Math.max(0, Math.min(1, size / 2 - 2 - d + 0.5));
      rows.set([r, g, b, Math.round(alpha * 255)], row + 1 + x * 4);
    }
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(zlib.crc32(body), 8 + data.length);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA, no interlace
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0))
  ]);
  const image = nativeImage.createFromBuffer(png);
  swatchCache.set(hex, image);
  return image;
}

// The renderer describes the tab; the menu reports the picked action back,
// and the renderer owns applying it.
ipcMain.on('tab:menu', (event, info) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || !info?.uid) return;
  const act = (action, value) => () => {
    if (!event.sender.isDestroyed()) event.sender.send('tab:menu-action', { uid: info.uid, action, value });
  };
  const zoom = Math.round((Number(info.zoom) || 1) * 100);
  const color = themes.isHex(info.color) ? info.color.toLowerCase() : null;

  Menu.buildFromTemplate([
    { label: String(info.name || 'Tab'), enabled: false },
    { type: 'separator' },
    { label: 'Reload', click: act('reload') },
    { label: info.muted ? 'Unmute' : 'Mute', click: act('mute', !info.muted) },
    {
      label: `Zoom (${zoom}%)`,
      submenu: [
        { label: 'Zoom in', enabled: zoom < 200, click: act('zoom', 1) },
        { label: 'Zoom out', enabled: zoom > 50, click: act('zoom', -1) },
        { label: 'Reset to 100%', enabled: zoom !== 100, click: act('zoom', 0) }
      ]
    },
    {
      label: 'Color tag',
      // One unbroken radio group: a separator here would split None into a
      // group of its own, and Electron always checks something in each group.
      submenu: [
        { label: 'None', type: 'radio', checked: !color, click: act('color', null) },
        ...themes.TAG_COLORS.map(([name, hex]) => ({
          label: name, type: 'radio', checked: color === hex, icon: colorSwatch(hex), click: act('color', hex)
        }))
      ]
    },
    { label: 'Rename…', click: act('rename') },
    { type: 'separator' },
    { label: info.horizontal ? 'Move left' : 'Move up', enabled: info.index > 0, click: act('move', -1) },
    { label: info.horizontal ? 'Move right' : 'Move down', enabled: info.index < info.count - 1, click: act('move', 1) },
    { type: 'separator' },
    { label: 'Remove from Ybochat', click: act('remove') }
  ]).popup({ window: win });
});

ipcMain.handle('screenshare:sources', async () => {
  // The picker is on screen by now, so keep it out of its own window list.
  const pickerId = shareWin && !shareWin.isDestroyed() ? shareWin.getMediaSourceId() : null;

  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: true
  });

  shareSources = sources
    .filter(source => source.name && source.id !== pickerId)
    .map(source => ({
      id: source.id,
      name: source.name,
      kind: source.id.startsWith('screen:') ? 'screen' : 'window',
      thumbnail: source.thumbnail.isEmpty() ? null : source.thumbnail.toDataURL(),
      icon: source.appIcon?.isEmpty() === false ? source.appIcon.toDataURL() : null
    }));
  return shareSources;
});

ipcMain.handle('screenshare:choose', (_, id, audio) => {
  const source = shareSources.find(s => s.id === id);
  if (!source) return false;
  resolveShare({ id: source.id, name: source.name, audio: !!audio });
  return true;
});

ipcMain.handle('screenshare:cancel', () => {
  resolveShare(null);
  return true;
});

ipcMain.handle('screenshare:loopback-supported', () => process.platform === 'win32');

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
