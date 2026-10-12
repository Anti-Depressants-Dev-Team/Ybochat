const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const { appById, createIcon, accountLabel, normalizeAccounts, ZOOM_STEPS } = window.YboApps;
const { applyAppearance } = window.YboThemes;

const SVG_NS = 'http://www.w3.org/2000/svg';
const MUTED_ICON = 'M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z';

const sidebar = document.getElementById('sidebar');
const mainContent = document.getElementById('main-content');
const emptyState = document.getElementById('empty-state');
const settingsBtn = document.getElementById('settings-btn');
const horizontalTabsContainer = document.getElementById('horizontal-tabs-container');
const renamePopover = document.getElementById('rename-popover');
const renameInput = document.getElementById('rename-input');

let accounts = [];
let horizontalTabs = false;
let activeUid = null;

// Webviews are kept alive across settings changes; recreating one would reload
// the site and throw away its scroll position.
const webviews = new Map();
// Zoom and mute can only be applied once a webview has attached.
const readyViews = new Set();

const tabContainer = () => (horizontalTabs ? horizontalTabsContainer : sidebar);
const tabsIn = container => [...container.querySelectorAll('.app-tab')];
const tabFor = uid => document.querySelector(`.app-tab[data-uid="${CSS.escape(uid)}"]`);
const findAccount = uid => accounts.find(a => a.uid === uid);

function adoptSettings(s) {
  accounts = normalizeAccounts(s.accounts);
  horizontalTabs = !!s.horizontalTabs;
  applyAppearance(s);
}

// Only the accounts change from this window; the main process merges them into
// the rest of the settings and tells the settings window.
const saveAccounts = () => window.electronAPI.saveSettings({ accounts });

// ── Tabs ────────────────────────────────────────────────────────────────────

function switchTab(uid) {
  activeUid = uid;
  document.querySelectorAll('.app-tab').forEach(t => {
    const active = t.dataset.uid === uid;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', String(active));
  });
  webviews.forEach((view, id) => view.classList.toggle('active', id === uid));
}

function mutedBadge() {
  const badge = document.createElement('span');
  badge.className = 'tab-muted';
  badge.title = 'Muted';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', MUTED_ICON);
  svg.appendChild(path);
  badge.appendChild(svg);
  return badge;
}

function buildTab(account) {
  const tab = document.createElement('div');
  tab.className = 'tab app-tab';
  tab.dataset.uid = account.uid;
  tab.title = `${accountLabel(account)}\nRight-click for options, drag to reorder`;
  tab.setAttribute('role', 'tab');
  tab.draggable = false;
  if (account.uid === activeUid) tab.classList.add('active');
  tab.setAttribute('aria-selected', String(account.uid === activeUid));

  const icon = document.createElement('span');
  icon.className = 'tab-icon';
  icon.appendChild(createIcon(account.app, 22));
  if (account.color) {
    const tag = document.createElement('span');
    tag.className = 'tab-tag';
    tag.style.setProperty('--tag', account.color);
    icon.appendChild(tag);
  }

  const label = document.createElement('span');
  label.className = 'tab-text';
  label.textContent = accountLabel(account);

  tab.append(icon, label);
  if (account.muted) tab.appendChild(mutedBadge());

  tab.addEventListener('click', () => {
    if (drag.justDropped) return;
    switchTab(account.uid);
  });
  tab.addEventListener('contextmenu', e => {
    e.preventDefault();
    openTabMenu(account.uid);
  });
  tab.addEventListener('pointerdown', onTabPointerDown);
  tab.addEventListener('pointermove', onTabPointerMove);
  tab.addEventListener('pointerup', onTabPointerUp);
  tab.addEventListener('pointercancel', () => endDrag(false));
  tab.addEventListener('dragstart', e => e.preventDefault());
  return tab;
}

function renderTabs() {
  document.querySelectorAll('.app-tab').forEach(t => t.remove());
  const container = tabContainer();
  accounts.forEach(account => container.appendChild(buildTab(account)));
}

function applyLayout() {
  document.querySelector('.app-layout').classList.toggle('horizontal-tabs', horizontalTabs);
  sidebar.style.display = horizontalTabs ? 'none' : 'flex';
  renderTabs();
}

// ── Webviews ────────────────────────────────────────────────────────────────

function applyViewPrefs(uid) {
  const view = webviews.get(uid);
  const account = findAccount(uid);
  if (!view || !account || !readyViews.has(uid)) return;
  view.setZoomFactor(account.zoom);
  view.setAudioMuted(account.muted);
}

function createWebview(account) {
  const wv = document.createElement('webview');
  wv.id = `wv-${account.uid}`;
  wv.className = 'view app-view';
  if (account.partition) wv.setAttribute('partition', account.partition);
  wv.setAttribute('useragent', UA);
  // Without this a webview drops popups before anything can see them, which is
  // why links did nothing. The main process denies every one and hands the URL
  // to the default browser instead, so no popup window is ever created.
  wv.setAttribute('allowpopups', '');
  // Navigation can reset zoom, so reapply the tab's preferences on every load.
  wv.addEventListener('dom-ready', () => {
    readyViews.add(account.uid);
    applyViewPrefs(account.uid);
  });
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
    readyViews.delete(uid);
  }

  accounts.forEach(account => {
    if (!webviews.has(account.uid)) webviews.set(account.uid, createWebview(account));
    else applyViewPrefs(account.uid);
  });

  renderTabs();
  emptyState.classList.toggle('active', accounts.length === 0);

  if (!accounts.length) {
    activeUid = null;
    return;
  }
  switchTab(wanted.has(activeUid) ? activeUid : accounts[0].uid);
}

// ── Drag to reorder ─────────────────────────────────────────────────────────

const DRAG_THRESHOLD = 5;
const EDGE_SCROLL_ZONE = 28;
const drag = { tab: null, pointerId: null, startX: 0, startY: 0, grab: 0, active: false, justDropped: false };

// Layout positions (offsetTop/Left) ignore transforms, so tabs that are still
// animating into place do not throw off the measurements.
const slotStart = (el, horizontal) => (horizontal ? el.offsetLeft : el.offsetTop);
const slotSize = (el, horizontal) => (horizontal ? el.offsetWidth : el.offsetHeight);

function pointerInContainer(e, container, horizontal) {
  const box = container.getBoundingClientRect();
  return horizontal
    ? e.clientX - box.left - container.clientLeft + container.scrollLeft
    : e.clientY - box.top - container.clientTop + container.scrollTop;
}

function translate(horizontal, px) {
  return horizontal ? `translateX(${px}px)` : `translateY(${px}px)`;
}

// Moves the dragged tab and slides its neighbours into their new slots.
function moveTab(container, tab, before, horizontal) {
  const others = tabsIn(container).filter(t => t !== tab);
  const from = new Map(others.map(t => [t, slotStart(t, horizontal)]));
  container.insertBefore(tab, before);
  for (const t of others) {
    const delta = from.get(t) - slotStart(t, horizontal);
    if (delta) t.animate([{ transform: translate(horizontal, delta) }, { transform: 'none' }], { duration: 160, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
}

function onTabPointerDown(e) {
  if (e.button !== 0 || drag.tab) return;
  const tab = e.currentTarget;
  const container = tab.parentElement;
  const horizontal = container === horizontalTabsContainer;
  Object.assign(drag, {
    tab,
    pointerId: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    grab: pointerInContainer(e, container, horizontal) - slotStart(tab, horizontal),
    active: false
  });
  tab.setPointerCapture(e.pointerId);
}

function onTabPointerMove(e) {
  if (!drag.tab || e.pointerId !== drag.pointerId) return;
  const tab = drag.tab;
  const container = tab.parentElement;
  const horizontal = container === horizontalTabsContainer;

  if (!drag.active) {
    if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < DRAG_THRESHOLD) return;
    drag.active = true;
    tab.classList.add('dragging');
    document.body.classList.add('tab-dragging');
  }

  // Keep the container scrolling while the pointer rests near either edge.
  const box = container.getBoundingClientRect();
  const along = horizontal ? e.clientX : e.clientY;
  const [lo, hi] = horizontal ? [box.left, box.right] : [box.top, box.bottom];
  if (along < lo + EDGE_SCROLL_ZONE) container[horizontal ? 'scrollLeft' : 'scrollTop'] -= 8;
  else if (along > hi - EDGE_SCROLL_ZONE) container[horizontal ? 'scrollLeft' : 'scrollTop'] += 8;

  const pos = pointerInContainer(e, container, horizontal);
  const before = tabsIn(container)
    .filter(t => t !== tab)
    .find(t => pos < slotStart(t, horizontal) + slotSize(t, horizontal) / 2) || null;
  if (before !== tab.nextElementSibling) moveTab(container, tab, before, horizontal);

  // The dragged tab follows the pointer from wherever its slot now is.
  tab.style.transform = translate(horizontal, pos - drag.grab - slotStart(tab, horizontal));
}

function onTabPointerUp(e) {
  if (e.pointerId !== drag.pointerId) return;
  endDrag(true);
}

function endDrag(commit) {
  const { tab, active } = drag;
  drag.tab = null;
  drag.pointerId = null;
  drag.active = false;
  if (!tab) return;
  document.body.classList.remove('tab-dragging');
  if (!active) return;

  // The click that follows the release must not count as selecting the tab.
  drag.justDropped = true;
  setTimeout(() => { drag.justDropped = false; }, 0);

  const settled = tab.style.transform;
  tab.style.transform = '';
  tab.classList.remove('dragging');

  if (!commit) {
    renderTabs();
    return;
  }

  // Ease the tab from where it was let go into its slot.
  if (settled) tab.animate([{ transform: settled }, { transform: 'none' }], { duration: 140, easing: 'ease-out' });

  const order = tabsIn(tab.parentElement).map(t => t.dataset.uid);
  if (order.join('\n') === accounts.map(a => a.uid).join('\n')) return;
  accounts = order.map(findAccount).filter(Boolean);
  saveAccounts();
}

window.addEventListener('keydown', e => {
  if (e.key === 'Escape' && drag.active) endDrag(false);
});

// ── Tab menu ────────────────────────────────────────────────────────────────

function openTabMenu(uid) {
  const account = findAccount(uid);
  if (!account) return;
  window.electronAPI.showTabMenu({
    uid,
    name: accountLabel(account),
    color: account.color,
    zoom: account.zoom,
    muted: account.muted,
    index: accounts.indexOf(account),
    count: accounts.length,
    horizontal: horizontalTabs
  });
}

function stepZoom(current, direction) {
  if (direction === 0) return 1;
  // Snap to the nearest step first so an odd stored value still moves sensibly.
  let index = ZOOM_STEPS.reduce((best, step, i) => (Math.abs(step - current) < Math.abs(ZOOM_STEPS[best] - current) ? i : best), 0);
  index = Math.max(0, Math.min(ZOOM_STEPS.length - 1, index + direction));
  return ZOOM_STEPS[index];
}

function handleTabAction({ uid, action, value }) {
  const account = findAccount(uid);
  if (!account) return;

  switch (action) {
    case 'reload':
      webviews.get(uid)?.reload();
      return;
    case 'mute':
      account.muted = !!value;
      applyViewPrefs(uid);
      break;
    case 'zoom':
      account.zoom = stepZoom(account.zoom, Number(value) || 0);
      applyViewPrefs(uid);
      break;
    case 'color':
      account.color = value || null;
      break;
    case 'rename':
      startRename(uid);
      return;
    case 'move': {
      const from = accounts.indexOf(account);
      const to = from + (value > 0 ? 1 : -1);
      if (to < 0 || to >= accounts.length) return;
      [accounts[from], accounts[to]] = [accounts[to], accounts[from]];
      break;
    }
    case 'remove':
      accounts = accounts.filter(a => a.uid !== uid);
      saveAccounts();
      renderAccounts();
      return;
    default:
      return;
  }

  renderTabs();
  saveAccounts();
}

// ── Rename ──────────────────────────────────────────────────────────────────

let renamingUid = null;

function startRename(uid) {
  const account = findAccount(uid);
  const tab = tabFor(uid);
  if (!account || !tab) return;

  renamingUid = uid;
  renameInput.value = accountLabel(account);
  renamePopover.hidden = false;

  // Beside a sidebar tab, or under a top tab; always kept on screen.
  const box = tab.getBoundingClientRect();
  const pop = renamePopover.getBoundingClientRect();
  let left = horizontalTabs ? box.left : box.right + 10;
  let top = horizontalTabs ? box.bottom + 6 : box.top + box.height / 2 - pop.height / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - pop.width - 8));
  top = Math.max(40, Math.min(top, window.innerHeight - pop.height - 8));
  renamePopover.style.left = `${left}px`;
  renamePopover.style.top = `${top}px`;

  renameInput.focus();
  renameInput.select();
}

function finishRename(commit) {
  if (!renamingUid) return;
  const account = findAccount(renamingUid);
  renamingUid = null;
  renamePopover.hidden = true;
  if (!commit || !account) return;

  const name = renameInput.value.trim();
  const next = name || appById(account.app).name;
  if (next === account.name) return;
  account.name = next;
  renderTabs();
  saveAccounts();
}

renameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); finishRename(true); }
  if (e.key === 'Escape') { e.preventDefault(); finishRename(false); }
});
renameInput.addEventListener('blur', () => finishRename(true));

// ── Vencord ─────────────────────────────────────────────────────────────────

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

// ── Wiring ──────────────────────────────────────────────────────────────────

const openSettings = () => window.electronAPI.openSettings();

settingsBtn.addEventListener('click', openSettings);
settingsBtn.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSettings(); }
});
document.getElementById('open-settings-empty').addEventListener('click', openSettings);

window.electronAPI.onTabMenuAction(handleTabAction);

window.electronAPI.onSettingsChanged(s => {
  if (drag.active) endDrag(false);
  finishRename(false);
  const wasHorizontal = horizontalTabs;
  adoptSettings(s);
  if (horizontalTabs !== wasHorizontal) applyLayout();
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
  const saved = await window.electronAPI.loadSettings();
  adoptSettings(saved);
  if (await prepareVencordAccounts()) await saveAccounts();
  await window.electronAPI.setStreamerMode(!!saved.streamerMode);
  applyLayout();
  renderAccounts();
  // Nothing to show yet — but not while starting hidden, or the settings
  // window would pop up on a launch the user meant to be silent.
  if (!accounts.length && !saved.startMinimized) openSettings();
}
init();
