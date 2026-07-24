const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const apps = [
  { id: 'discord',       name: 'Discord',           url: 'https://discord.com/app',           initial: 'D'  },
  { id: 'cinny',         name: 'Cinny',             url: 'https://app.cinny.in/',              initial: 'C'  },
  { id: 'stoat',         name: 'Stoat',             url: 'https://stoat.chat/app',             initial: 'S'  },
  { id: 'fluxer',        name: 'Fluxer',            url: 'https://web.fluxer.app',             initial: 'F'  },
  { id: 'element',       name: 'Element',           url: 'https://app.element.io/',            initial: 'E'  },
  { id: 'threema',       name: 'Threema',           url: 'https://web.threema.ch/',            initial: 'TH' },
  { id: 'slack',         name: 'Slack',             url: 'https://app.slack.com/',             initial: 'SL' },
  { id: 'steamchat',     name: 'Steam Chat',        url: 'https://steamcommunity.com/chat/',   initial: 'SC' },
  { id: 'telegram_k',    name: 'Telegram K',        url: 'https://web.telegram.org/k/',        initial: 'TK' },
  { id: 'telegram_a',    name: 'Telegram A',        url: 'https://web.telegram.org/a/',        initial: 'TA' },
  { id: 'whatsapp',      name: 'WhatsApp',          url: 'https://web.whatsapp.com/',          initial: 'WA' },
  { id: 'wire',          name: 'Wire',              url: 'https://app.wire.com/',              initial: 'WI' },
];

const sidebar = document.getElementById('sidebar');
const mainContent = document.getElementById('main-content');
const settingsBtn = document.getElementById('settings-btn');
const settingsView = document.getElementById('settings-view');

let enabledApps = [];
let horizontalTabs = false;
let streamerMode = false;
let settingsOpen = false;
let activeTabId = null;

// ── Settings ─────────────────────────────────────────────────────────────────

async function loadSettings() {
  const s = await window.electronAPI.loadSettings();
  enabledApps    = s.enabledApps    || [];
  horizontalTabs = s.horizontalTabs || false;
  streamerMode   = s.streamerMode   || false;
}

async function saveSettings() {
  await window.electronAPI.saveSettings({ enabledApps, horizontalTabs, streamerMode });
  renderApps();
}

// ── Layout ───────────────────────────────────────────────────────────────────

function applyLayout() {
  const layout = document.querySelector('.app-layout');
  const hc = document.getElementById('horizontal-tabs-container');
  const tabs = document.querySelectorAll('.app-tab');
  if (horizontalTabs) {
    layout.classList.add('horizontal-tabs');
    sidebar.style.display = 'none';
    tabs.forEach(t => hc.appendChild(t));
  } else {
    layout.classList.remove('horizontal-tabs');
    sidebar.style.display = 'flex';
    tabs.forEach(t => sidebar.appendChild(t));
  }
}

// ── Settings UI ──────────────────────────────────────────────────────────────

function renderSettings() {
  apps.forEach(a => {
    const cb = document.querySelector(`.app-toggle[data-app="${a.id}"]`);
    if (!cb) return;
    cb.checked = enabledApps.includes(a.id);
    cb.addEventListener('change', e => {
      if (e.target.checked) enabledApps.push(a.id);
      else enabledApps = enabledApps.filter(id => id !== a.id);
      saveSettings();
    });
  });
  const h = document.getElementById('toggle-horizontal-tabs');
  if (h) { h.checked = horizontalTabs; h.addEventListener('change', e => { horizontalTabs = e.target.checked; applyLayout(); saveSettings(); }); }
  const s = document.getElementById('toggle-streamer-mode');
  if (s) { s.checked = streamerMode; s.addEventListener('change', async e => { streamerMode = e.target.checked; await window.electronAPI.setStreamerMode(streamerMode); saveSettings(); }); }
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

async function switchTab(viewId) {
  activeTabId = viewId;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const tab = document.querySelector(`.tab[data-target="${viewId}"]`);
  const view = document.getElementById(viewId);
  if (tab) tab.classList.add('active');
  if (view) view.classList.add('active');
}

function toggleSettings(force) {
  settingsOpen = force !== undefined ? force : !settingsOpen;
  settingsView.classList.toggle('active', settingsOpen);
}

// ── Render ───────────────────────────────────────────────────────────────────

function renderApps() {
  document.querySelectorAll('.app-tab').forEach(t => t.remove());
  document.querySelectorAll('.app-view').forEach(v => v.remove());

  enabledApps.forEach(id => {
    const cfg = apps.find(a => a.id === id);
    if (!cfg) return;

    const tab = document.createElement('div');
    tab.className = 'tab app-tab';
    tab.dataset.target = `wv-${id}`;
    tab.title = cfg.name;
    const icon = document.createElement('span'); icon.className = 'tab-icon'; icon.innerText = cfg.initial;
    const label = document.createElement('span'); label.className = 'tab-text'; label.innerText = cfg.name;
    tab.appendChild(icon); tab.appendChild(label);
    tab.addEventListener('click', () => switchTab(`wv-${id}`));
    (horizontalTabs ? document.getElementById('horizontal-tabs-container') : sidebar).appendChild(tab);

    const wv = document.createElement('webview');
    wv.id = `wv-${id}`;
    wv.className = 'view app-view';
    wv.src = cfg.url;
    wv.setAttribute('useragent', UA);
    mainContent.appendChild(wv);
  });

  apps.forEach(a => { const cb = document.querySelector(`.app-toggle[data-app="${a.id}"]`); if (cb) cb.checked = enabledApps.includes(a.id); });
  document.getElementById('toggle-horizontal-tabs').checked = horizontalTabs;
  document.getElementById('toggle-streamer-mode').checked = streamerMode;

  if (enabledApps.length) switchTab(`wv-${enabledApps[0]}`);
  else toggleSettings(true);
}

// ── Wire up ──────────────────────────────────────────────────────────────────

settingsBtn.addEventListener('click', () => toggleSettings());
document.getElementById('close-settings')?.addEventListener('click', () => toggleSettings(false));

async function init() {
  await loadSettings();
  await window.electronAPI.setStreamerMode(streamerMode);
  applyLayout();
  renderSettings();
  renderApps();
}
init();
