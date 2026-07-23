const apps = [
  { id: 'discord',       name: 'Discord',           url: 'https://discord.com/app',      initial: 'D'  },
  { id: 'cinny',         name: 'Cinny',             url: 'https://app.cinny.in/',         initial: 'C'  },
  { id: 'stoat',         name: 'Stoat',             url: 'https://stoat.chat/app',        initial: 'S'  },
  { id: 'fluxer',        name: 'Fluxer',            url: 'https://web.fluxer.app',        initial: 'F'  },
  { id: 'telegram_k',    name: 'Telegram K',        url: 'https://web.telegram.org/k/',   initial: 'TK' },
  { id: 'telegram_a',    name: 'Telegram A',        url: 'https://web.telegram.org/a/',   initial: 'TA' },
  // Special entries (no URL — handled via IPC)
  { id: 'tg_native',     name: 'Telegram',          native: 'launch',   initial: 'TG' },
  { id: 'tg_embedded',   name: 'Telegram (Embed)',  native: 'embed',    initial: 'TE' },
];

const sidebar = document.getElementById('sidebar');
const mainContent = document.getElementById('main-content');
const settingsBtn = document.getElementById('settings-btn');
const settingsView = document.getElementById('settings-view');

let enabledApps = [];
let horizontalTabs = false;
let settingsOpen = false;

// ── Persistence ─────────────────────────────────────────────────────────────

async function loadSettings() {
  try {
    const saved = await window.electronAPI.loadSettings();
    enabledApps    = saved.enabledApps    || [];
    horizontalTabs = saved.horizontalTabs || false;
  } catch (e) { console.error('Could not load settings:', e); }
}

async function saveSettings() {
  try {
    await window.electronAPI.saveSettings({ enabledApps, horizontalTabs });
  } catch (e) { console.error('Could not save settings:', e); }
  renderApps();
}

// ── Layout ───────────────────────────────────────────────────────────────────

function applyLayout() {
  const appLayout = document.querySelector('.app-layout');
  const hContainer = document.getElementById('horizontal-tabs-container');
  const tabs = document.querySelectorAll('.app-tab');

  if (horizontalTabs) {
    appLayout.classList.add('horizontal-tabs');
    sidebar.style.display = 'none';
    tabs.forEach(t => hContainer.appendChild(t));
  } else {
    appLayout.classList.remove('horizontal-tabs');
    sidebar.style.display = 'flex';
    tabs.forEach(t => sidebar.appendChild(t));
  }
}

// ── Settings checkboxes ───────────────────────────────────────────────────────

function renderSettings() {
  apps.forEach(app => {
    const cb = document.querySelector(`.app-toggle[data-app="${app.id}"]`);
    if (!cb) return;
    cb.checked = enabledApps.includes(app.id);
    cb.addEventListener('change', (e) => {
      if (e.target.checked) {
        if (!enabledApps.includes(app.id)) enabledApps.push(app.id);
      } else {
        enabledApps = enabledApps.filter(id => id !== app.id);
      }
      saveSettings();
    });
  });

  const hCb = document.getElementById('toggle-horizontal-tabs');
  if (hCb) {
    hCb.checked = horizontalTabs;
    hCb.addEventListener('change', (e) => {
      horizontalTabs = e.target.checked;
      applyLayout();
      saveSettings();
    });
  }
}

// ── Tab switching ─────────────────────────────────────────────────────────────

let activeTabId = null;

async function switchTab(viewId) {
  const prev = activeTabId;
  activeTabId = viewId;

  // If leaving the embedded Telegram tab, hide its native window
  if (prev === 'wv-tg_embedded' && viewId !== 'wv-tg_embedded') {
    const isEmbedded = await window.electronAPI.telegramIsEmbedded();
    if (isEmbedded) window.electronAPI.telegramHideEmbedded();
  }

  // Update tab highlights
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

  const tab = document.querySelector(`.tab[data-target="${viewId}"]`);
  const view = document.getElementById(viewId);
  if (tab) tab.classList.add('active');
  if (view) view.classList.add('active');

  // If switching TO embedded Telegram tab, show native window
  if (viewId === 'wv-tg_embedded') {
    const isEmbedded = await window.electronAPI.telegramIsEmbedded();
    if (isEmbedded) window.electronAPI.telegramShowEmbedded();
  }
}

// ── Settings modal ────────────────────────────────────────────────────────────

function toggleSettings(forceState) {
  settingsOpen = forceState !== undefined ? forceState : !settingsOpen;
  settingsView.classList.toggle('active', settingsOpen);
}

// ── Native Telegram actions ───────────────────────────────────────────────────

async function handleNativeLaunch(placeholderEl) {
  placeholderEl.innerHTML = `<div class="native-placeholder">
    <div class="native-spinner"></div>
    <p>Launching Telegram…</p>
  </div>`;
  const result = await window.electronAPI.telegramLaunch();
  if (result.success) {
    placeholderEl.innerHTML = `<div class="native-placeholder">
      <svg viewBox="0 0 24 24" width="48" height="48"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14l-4-4 1.41-1.41L11 13.17l6.59-6.59L19 8l-8 8z"/></svg>
      <h3>Telegram is running!</h3>
      <p>It's open as a separate native window.</p>
    </div>`;
  } else {
    placeholderEl.innerHTML = `<div class="native-placeholder error">
      <h3>❌ Could not launch</h3>
      <p>${result.error}</p>
    </div>`;
  }
}

async function handleEmbed(placeholderEl) {
  placeholderEl.innerHTML = `<div class="native-placeholder">
    <div class="native-spinner"></div>
    <h3>Embedding Telegram…</h3>
    <p>Launching Telegram Desktop and waiting for its window (up to 15s)…</p>
  </div>`;

  const result = await window.electronAPI.telegramEmbed();
  if (result.success) {
    // Hide the placeholder — the native window covers this area now
    placeholderEl.innerHTML = '';
  } else {
    placeholderEl.innerHTML = `<div class="native-placeholder error">
      <h3>❌ Embed failed</h3>
      <p>${result.error}</p>
      <small>This feature requires Telegram Desktop to be installed.</small>
    </div>`;
  }
}

// ── Render apps ───────────────────────────────────────────────────────────────

function renderApps() {
  document.querySelectorAll('.app-tab').forEach(t => t.remove());
  document.querySelectorAll('.app-view').forEach(v => v.remove());

  enabledApps.forEach(appId => {
    const appConfig = apps.find(a => a.id === appId);
    if (!appConfig) return;

    // ── Tab button ──
    const tab = document.createElement('div');
    tab.className = 'tab app-tab';
    tab.dataset.target = `wv-${appId}`;
    tab.title = appConfig.name;

    const icon = document.createElement('span');
    icon.className = 'tab-icon';
    icon.innerText = appConfig.initial;
    tab.appendChild(icon);

    const label = document.createElement('span');
    label.className = 'tab-text';
    label.innerText = appConfig.name;
    tab.appendChild(label);

    tab.addEventListener('click', () => switchTab(`wv-${appId}`));
    const container = horizontalTabs
      ? document.getElementById('horizontal-tabs-container')
      : sidebar;
    container.appendChild(tab);

    // ── Content view ──
    if (appConfig.native) {
      // Special native/embed placeholder view
      const placeholder = document.createElement('div');
      placeholder.id = `wv-${appId}`;
      placeholder.className = 'view app-view native-view';
      mainContent.appendChild(placeholder);

      tab.addEventListener('click', async () => {
        if (appConfig.native === 'launch') {
          await handleNativeLaunch(placeholder);
        } else if (appConfig.native === 'embed') {
          const isEmbedded = await window.electronAPI.telegramIsEmbedded();
          if (!isEmbedded) {
            await handleEmbed(placeholder);
          } else {
            window.electronAPI.telegramShowEmbedded();
          }
        }
      }, { once: false });
    } else {
      // Regular webview
      const webview = document.createElement('webview');
      webview.id = `wv-${appId}`;
      webview.className = 'view app-view';
      webview.src = appConfig.url;
      mainContent.appendChild(webview);
    }
  });

  // Sync checkbox states
  apps.forEach(app => {
    const cb = document.querySelector(`.app-toggle[data-app="${app.id}"]`);
    if (cb) cb.checked = enabledApps.includes(app.id);
  });
  const hCb = document.getElementById('toggle-horizontal-tabs');
  if (hCb) hCb.checked = horizontalTabs;

  if (enabledApps.length > 0) {
    switchTab(`wv-${enabledApps[0]}`);
  } else {
    toggleSettings(true);
  }
}

// ── Wire up settings button ───────────────────────────────────────────────────

settingsBtn.addEventListener('click', () => toggleSettings());
document.getElementById('close-settings')
  ?.addEventListener('click', () => toggleSettings(false));

// Also detach Telegram when user closes app via settings
window.addEventListener('beforeunload', () => {
  window.electronAPI.telegramDetach().catch(() => {});
});

// ── Boot ──────────────────────────────────────────────────────────────────────

async function init() {
  await loadSettings();
  applyLayout();
  renderSettings();
  renderApps();
}

init();
