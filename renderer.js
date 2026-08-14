const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const apps = [
  { id: 'discord',       name: 'Discord',           url: 'https://discord.com/app',           initial: 'D'  },
  { id: 'vencord',       name: 'Vencord',           url: 'https://discord.com/app',           initial: 'V', partition: 'persist:vencord' },
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
let closeToTray = true;
let autoStart = true;
let settingsOpen = false;
let activeTabId = null;

function setVencordStatus(message, isError = false) {
  const status = document.getElementById('vencord-status');
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('error', isError);
  status.hidden = !message;
}

async function ensureVencord() {
  setVencordStatus('Preparing the Vencord Web extension...');
  const result = await window.electronAPI.ensureVencord();
  if (!result?.ok) {
    setVencordStatus(`Vencord could not be loaded: ${result?.error || 'Unknown error'}`, true);
    return false;
  }
  setVencordStatus('Vencord Web is ready.');
  return true;
}

async function loadSettings() {
  const s = await window.electronAPI.loadSettings();
  enabledApps    = s.enabledApps    || [];
  horizontalTabs = s.horizontalTabs || false;
  streamerMode   = s.streamerMode   || false;
  closeToTray    = s.closeToTray    !== false;
  autoStart      = s.autoStart      !== false;
}

async function saveSettings(rerenderApps = true) {
  await window.electronAPI.saveSettings({ enabledApps, horizontalTabs, streamerMode, closeToTray, autoStart });
  if (rerenderApps) renderApps();
}

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

function renderSettings() {
  apps.forEach(a => {
    const cb = document.querySelector(`.app-toggle[data-app="${a.id}"]`);
    if (!cb) return;
    cb.checked = enabledApps.includes(a.id);
    cb.addEventListener('change', async e => {
      if (e.target.checked && a.id === 'vencord') {
        e.target.disabled = true;
        const ready = await ensureVencord();
        e.target.disabled = false;
        if (!ready) {
          e.target.checked = false;
          return;
        }
      }

      if (e.target.checked) enabledApps.push(a.id);
      else {
        enabledApps = enabledApps.filter(id => id !== a.id);
        if (a.id === 'vencord') setVencordStatus('');
      }
      saveSettings();
    });
  });
  const h = document.getElementById('toggle-horizontal-tabs');
  if (h) { h.checked = horizontalTabs; h.addEventListener('change', e => { horizontalTabs = e.target.checked; applyLayout(); saveSettings(false); }); }
  const s = document.getElementById('toggle-streamer-mode');
  if (s) { s.checked = streamerMode; s.addEventListener('change', async e => { streamerMode = e.target.checked; await window.electronAPI.setStreamerMode(streamerMode); saveSettings(false); }); }
  const c = document.getElementById('toggle-close-to-tray');
  if (c) { c.checked = closeToTray; c.addEventListener('change', e => { closeToTray = e.target.checked; saveSettings(false); }); }
  const a = document.getElementById('toggle-auto-start');
  if (a) { a.checked = autoStart; a.addEventListener('change', e => { autoStart = e.target.checked; saveSettings(false); }); }
}

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
    if (cfg.partition) wv.setAttribute('partition', cfg.partition);
    wv.setAttribute('useragent', UA);
    wv.src = cfg.url;
    mainContent.appendChild(wv);
  });

  apps.forEach(a => { const cb = document.querySelector(`.app-toggle[data-app="${a.id}"]`); if (cb) cb.checked = enabledApps.includes(a.id); });
  document.getElementById('toggle-horizontal-tabs').checked = horizontalTabs;
  document.getElementById('toggle-streamer-mode').checked = streamerMode;
  document.getElementById('toggle-close-to-tray').checked = closeToTray;
  document.getElementById('toggle-auto-start').checked = autoStart;

  if (enabledApps.length) switchTab(`wv-${enabledApps[0]}`);
  else toggleSettings(true);
}

settingsBtn.addEventListener('click', () => toggleSettings());
document.getElementById('close-settings')?.addEventListener('click', () => toggleSettings(false));

const horizontalTabsContainer = document.getElementById('horizontal-tabs-container');
horizontalTabsContainer.addEventListener('wheel', event => {
  if (horizontalTabsContainer.scrollWidth <= horizontalTabsContainer.clientWidth) return;

  const wheelDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
    ? event.deltaX
    : event.deltaY;
  const deltaScale = event.deltaMode === WheelEvent.DOM_DELTA_LINE
    ? 32
    : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
      ? horizontalTabsContainer.clientWidth
      : 1;

  horizontalTabsContainer.scrollLeft += wheelDelta * deltaScale;
  event.preventDefault();
}, { passive: false });

// Auto-update notification
window.electronAPI.onUpdateDownloaded(() => {
  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:var(--accent-color);color:#fff;padding:10px 20px;text-align:center;z-index:9999;cursor:pointer;font-size:14px';
  bar.textContent = 'Update ready — click to restart and install';
  bar.addEventListener('click', () => window.electronAPI.installUpdate());
  document.body.appendChild(bar);
});

async function init() {
  await loadSettings();
  if (enabledApps.includes('vencord') && !(await ensureVencord())) {
    enabledApps = enabledApps.filter(id => id !== 'vencord');
    await saveSettings(false);
  }
  await window.electronAPI.setStreamerMode(streamerMode);
  applyLayout();
  renderSettings();
  renderApps();
}
init();
