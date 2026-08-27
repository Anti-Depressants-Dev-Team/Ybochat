const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const { appById, createIcon, accountLabel, normalizeAccounts } = window.YboApps;

const sidebar = document.getElementById('sidebar');
const mainContent = document.getElementById('main-content');
const emptyState = document.getElementById('empty-state');
const settingsBtn = document.getElementById('settings-btn');
const horizontalTabsContainer = document.getElementById('horizontal-tabs-container');

let accounts = [];
let horizontalTabs = false;
let activeUid = null;

// Webviews are kept alive across settings changes; recreating one would reload
// the site and throw away its scroll position.
const webviews = new Map();

async function loadSettings() {
  const s = await window.electronAPI.loadSettings();
  accounts = normalizeAccounts(s.accounts);
  horizontalTabs = !!s.horizontalTabs;
  return s;
}

function switchTab(uid) {
  activeUid = uid;
  document.querySelectorAll('.app-tab').forEach(t => t.classList.toggle('active', t.dataset.uid === uid));
  webviews.forEach((view, id) => view.classList.toggle('active', id === uid));
}

function buildTab(account) {
  const tab = document.createElement('div');
  tab.className = 'tab app-tab';
  tab.dataset.uid = account.uid;
  tab.title = accountLabel(account);

  const icon = document.createElement('span');
  icon.className = 'tab-icon';
  icon.appendChild(createIcon(account.app, 22));

  const label = document.createElement('span');
  label.className = 'tab-text';
  label.textContent = accountLabel(account);

  tab.append(icon, label);
  tab.addEventListener('click', () => switchTab(account.uid));
  return tab;
}

function renderTabs() {
  const container = horizontalTabs ? horizontalTabsContainer : sidebar;
  document.querySelectorAll('.app-tab').forEach(t => t.remove());
  accounts.forEach(account => container.appendChild(buildTab(account)));
}

function applyLayout() {
  document.querySelector('.app-layout').classList.toggle('horizontal-tabs', horizontalTabs);
  sidebar.style.display = horizontalTabs ? 'none' : 'flex';
  renderTabs();
}

function createWebview(account) {
  const wv = document.createElement('webview');
  wv.id = `wv-${account.uid}`;
  wv.className = 'view app-view';
  if (account.partition) wv.setAttribute('partition', account.partition);
  wv.setAttribute('useragent', UA);
  wv.src = appById(account.app).url;
  mainContent.appendChild(wv);
  return wv;
}

function renderAccounts() {
  const wanted = new Set(accounts.map(a => a.uid));

  for (const [uid, view] of webviews) {
    if (wanted.has(uid)) continue;
    view.remove();
    webviews.delete(uid);
  }

  accounts.forEach(account => {
    if (!webviews.has(account.uid)) webviews.set(account.uid, createWebview(account));
  });

  renderTabs();
  emptyState.classList.toggle('active', accounts.length === 0);

  if (!accounts.length) {
    activeUid = null;
    return;
  }
  switchTab(wanted.has(activeUid) ? activeUid : accounts[0].uid);
}

// Every Vencord container needs the extension loaded into it before the
// webview points at Discord; drop any account we cannot prepare.
async function prepareVencordAccounts() {
  const vencord = accounts.filter(a => a.app === 'vencord');
  if (!vencord.length) return false;

  const failed = [];
  for (const account of vencord) {
    const result = await window.electronAPI.ensureVencord(account.partition);
    if (!result?.ok) failed.push(account.uid);
  }
  if (!failed.length) return false;

  accounts = accounts.filter(a => !failed.includes(a.uid));
  return true;
}

const openSettings = () => window.electronAPI.openSettings();

settingsBtn.addEventListener('click', openSettings);
settingsBtn.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSettings(); }
});
document.getElementById('open-settings-empty').addEventListener('click', openSettings);

window.electronAPI.onSettingsChanged(s => {
  accounts = normalizeAccounts(s.accounts);
  const nextHorizontal = !!s.horizontalTabs;
  if (nextHorizontal !== horizontalTabs) {
    horizontalTabs = nextHorizontal;
    applyLayout();
  }
  renderAccounts();
});

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
  bar.className = 'update-bar';
  bar.textContent = 'Update ready — click to restart and install';
  bar.addEventListener('click', () => window.electronAPI.installUpdate());
  document.body.appendChild(bar);
});

async function init() {
  const saved = await loadSettings();
  if (await prepareVencordAccounts()) {
    await window.electronAPI.saveSettings({ ...saved, accounts });
  }
  await window.electronAPI.setStreamerMode(!!saved.streamerMode);
  applyLayout();
  renderAccounts();
  if (!accounts.length) openSettings();
}
init();
