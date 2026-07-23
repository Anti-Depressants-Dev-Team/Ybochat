const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn, exec } = require('node:child_process');
const os = require('node:os');

let mainWin = null;
let embeddedTgHWND = null; // tracks the embedded Telegram HWND

// ── Helpers ────────────────────────────────────────────────────────────────

function findTelegramExe() {
  const candidates = [
    path.join(os.homedir(), 'AppData', 'Roaming', 'Telegram Desktop', 'Telegram.exe'),
    path.join(os.homedir(), 'AppData', 'Local', 'Telegram Desktop', 'Telegram.exe'),
    'C:\\Program Files\\Telegram Desktop\\Telegram.exe',
    'C:\\Program Files (x86)\\Telegram Desktop\\Telegram.exe',
  ];
  return candidates.find(p => fs.existsSync(p)) || null;
}

const psScript = path.join(__dirname, 'embed-helper.ps1');

function runPS(args) {
  return new Promise((resolve) => {
    // Use -File so the script path is handled correctly with spaces
    const cmd = `powershell -ExecutionPolicy Bypass -NonInteractive -File "${psScript}" ${args}`;
    exec(cmd, (err, stdout, stderr) => {
      // Always resolve with stdout — PowerShell may exit non-zero for expected cases (NOT_FOUND)
      const out = (stdout || '').trim();
      if (out) {
        resolve(out);
      } else if (err) {
        resolve('PS_ERROR: ' + (stderr || err.message).trim());
      } else {
        resolve('');
      }
    });
  });
}

// ── Window ─────────────────────────────────────────────────────────────────

const createWindow = () => {
  mainWin = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 600,
    minHeight: 400,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#121212',
      symbolColor: '#ffffff',
      height: 32
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      contextIsolation: true
    }
  });

  mainWin.loadFile('index.html');

  // When window resizes, reposition embedded Telegram if active
  mainWin.on('resize', () => {
    if (!embeddedTgHWND) return;
    const [w, h] = mainWin.getContentSize();
    const titlebarH = 32;
    runPS(`-Action resize -ParentHWND "${embeddedTgHWND}" -X 0 -Y ${titlebarH} -W ${w} -H ${h - titlebarH}`)
      .catch(() => {});
  });

  mainWin.on('closed', async () => {
    // Detach Telegram before closing so it doesn't get orphaned
    if (embeddedTgHWND) {
      await runPS(`-Action detach -ParentHWND "${embeddedTgHWND}"`).catch(() => {});
      embeddedTgHWND = null;
    }
    mainWin = null;
  });
};

// ── App lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── Settings IPC ────────────────────────────────────────────────────────────

const settingsPath = path.join(app.getPath('userData'), 'settings.json');

ipcMain.handle('settings:load', () => {
  try {
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    }
  } catch (e) { console.error('Failed to load settings:', e); }
  return {};
});

ipcMain.handle('settings:save', (event, settings) => {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    return true;
  } catch (e) { console.error('Failed to save settings:', e); return false; }
});

// ── Telegram IPC ────────────────────────────────────────────────────────────

ipcMain.handle('telegram:check-installed', () => {
  const exe = findTelegramExe();
  return { installed: !!exe, path: exe };
});

ipcMain.handle('telegram:launch', async () => {
  const exe = findTelegramExe();
  if (!exe) return { success: false, error: 'Telegram Desktop not found on this machine.' };
  try {
    spawn(exe, [], { detached: true, stdio: 'ignore' }).unref();
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('telegram:embed', async () => {
  if (!mainWin) return { success: false, error: 'No window' };

  const exe = findTelegramExe();

  // Launch Telegram if we can find the exe
  if (exe) {
    spawn(exe, [], { detached: true, stdio: 'ignore' }).unref();
  } else {
    // Try launching via shell as a last resort (might work if it's in PATH or registered)
    exec('start telegram://', (e) => {});
  }

  // Get Electron window HWND
  const hwndBuf = mainWin.getNativeWindowHandle();
  const electronHWND = hwndBuf.readBigUInt64LE(0).toString();

  // Calculate content area
  const [w, h] = mainWin.getContentSize();
  const titlebarH = 32;

  const result = await runPS(
    `-Action embed -ParentHWND "${electronHWND}" -X 0 -Y ${titlebarH} -W ${w} -H ${h - titlebarH}`
  );

  if (!result || result === 'NOT_FOUND') {
    const hint = exe
      ? 'Telegram was launched but its window did not appear in time. Try again after Telegram has fully loaded.'
      : 'Telegram Desktop could not be found. Please install it from https://desktop.telegram.org';
    return { success: false, error: hint };
  }
  if (result.startsWith('PS_ERROR:')) {
    return { success: false, error: result };
  }

  embeddedTgHWND = result;
  return { success: true, hwnd: result };
});

ipcMain.handle('telegram:show-embedded', async () => {
  if (!embeddedTgHWND || !mainWin) return;
  const [w, h] = mainWin.getContentSize();
  const titlebarH = 32;
  await runPS(`-Action resize -ParentHWND "${embeddedTgHWND}" -X 0 -Y ${titlebarH} -W ${w} -H ${h - titlebarH}`).catch(() => {});
  await runPS(`-Action show -ParentHWND "${embeddedTgHWND}"`).catch(() => {});
});

ipcMain.handle('telegram:hide-embedded', async () => {
  if (!embeddedTgHWND) return;
  await runPS(`-Action hide -ParentHWND "${embeddedTgHWND}"`).catch(() => {});
});

ipcMain.handle('telegram:detach', async () => {
  if (!embeddedTgHWND) return { success: true };
  try {
    await runPS(`-Action detach -ParentHWND "${embeddedTgHWND}"`);
    embeddedTgHWND = null;
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('telegram:is-embedded', () => {
  return !!embeddedTgHWND;
});
