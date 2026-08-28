const { APPS, appById, createIcon, makeAccount, accountLabel, normalizeAccounts } = window.YboApps;

const appsList = document.getElementById('apps-list');
const toggles = {
  horizontalTabs: document.getElementById('toggle-horizontal-tabs'),
  streamerMode: document.getElementById('toggle-streamer-mode'),
  closeToTray: document.getElementById('toggle-close-to-tray'),
  autoStart: document.getElementById('toggle-auto-start'),
  startMinimized: document.getElementById('toggle-start-minimized')
};
const startMinimizedNote = document.getElementById('start-minimized-note');

let settings = {
  accounts: [],
  horizontalTabs: false,
  streamerMode: false,
  closeToTray: true,
  autoStart: true,
  startMinimized: false
};

// Per-app status line, e.g. the Vencord extension download.
const notes = new Map();
let saveTimer = null;

function adopt(incoming) {
  settings = {
    accounts: normalizeAccounts(incoming.accounts),
    horizontalTabs: !!incoming.horizontalTabs,
    streamerMode: !!incoming.streamerMode,
    closeToTray: incoming.closeToTray !== false,
    autoStart: incoming.autoStart !== false,
    startMinimized: !!incoming.startMinimized
  };
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = null;
  return window.electronAPI.saveSettings(settings);
}

function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 300);
}

function setNote(appId, message, isError = false) {
  if (message) notes.set(appId, { message, isError });
  else notes.delete(appId);
}

async function ensureVencord(partition) {
  setNote('vencord', 'Preparing the Vencord Web extension...');
  renderApps();
  const result = await window.electronAPI.ensureVencord(partition);
  if (!result?.ok) {
    setNote('vencord', `Vencord could not be loaded: ${result?.error || 'Unknown error'}`, true);
    renderApps();
    return false;
  }
  setNote('vencord', 'Vencord Web is ready.');
  return true;
}

const accountsOf = appId => settings.accounts.filter(a => a.app === appId);

async function addAccount(appId, button) {
  const account = makeAccount(appId, settings.accounts);
  if (!account) return false;

  if (appId === 'vencord') {
    if (button) button.disabled = true;
    const ready = await ensureVencord(account.partition);
    if (button) button.disabled = false;
    if (!ready) return false;
  }

  // Keep an app's accounts together so its tabs stay side by side.
  const lastSibling = settings.accounts.findLastIndex(a => a.app === appId);
  const at = lastSibling === -1 ? settings.accounts.length : lastSibling + 1;
  settings.accounts.splice(at, 0, account);
  renderApps();
  await save();
  return true;
}

async function removeApp(appId) {
  settings.accounts = settings.accounts.filter(a => a.app !== appId);
  if (appId === 'vencord') setNote('vencord', '');
  renderApps();
  await save();
}

async function removeAccount(uid) {
  const account = settings.accounts.find(a => a.uid === uid);
  settings.accounts = settings.accounts.filter(a => a.uid !== uid);
  if (account?.app === 'vencord' && !accountsOf('vencord').length) setNote('vencord', '');
  renderApps();
  await save();
}

function buildAccountRow(account, appId) {
  const row = document.createElement('div');
  row.className = 'account-row';

  const branch = document.createElement('span');
  branch.className = 'account-branch';
  branch.textContent = '↳';

  const name = document.createElement('input');
  name.className = 'account-name';
  name.type = 'text';
  name.value = accountLabel(account);
  name.maxLength = 40;
  name.setAttribute('aria-label', `Name for this ${appById(appId).name} account`);
  name.addEventListener('input', () => {
    account.name = name.value;
    saveSoon();
  });
  name.addEventListener('blur', () => {
    if (account.name.trim()) return;
    account.name = appById(appId).name;
    name.value = account.name;
    save();
  });

  const remove = document.createElement('button');
  remove.className = 'icon-button remove-account';
  remove.type = 'button';
  remove.title = 'Remove this account';
  remove.setAttribute('aria-label', `Remove ${accountLabel(account)}`);
  remove.textContent = '×';
  remove.addEventListener('click', () => removeAccount(account.uid));

  row.append(branch, name, remove);
  return row;
}

function buildAppBlock(cfg) {
  const accounts = accountsOf(cfg.id);
  const block = document.createElement('div');
  block.className = 'app-block';
  if (accounts.length > 1) block.classList.add('expanded');

  const row = document.createElement('div');
  row.className = 'app-row';

  const main = document.createElement('label');
  main.className = 'app-main';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = accounts.length > 0;
  checkbox.addEventListener('change', () => {
    if (checkbox.checked) addAccount(cfg.id, null);
    else removeApp(cfg.id);
  });

  const icon = document.createElement('span');
  icon.className = 'app-icon';
  icon.appendChild(createIcon(cfg.id, 18));

  const name = document.createElement('span');
  name.className = 'app-name';
  name.textContent = cfg.note || cfg.name;

  main.append(checkbox, icon, name);
  row.appendChild(main);

  if (accounts.length > 1) {
    const count = document.createElement('span');
    count.className = 'app-count';
    count.textContent = `${accounts.length} accounts`;
    row.appendChild(count);
  }

  const add = document.createElement('button');
  add.className = 'icon-button add-account';
  add.type = 'button';
  add.title = `Add another ${cfg.name} account`;
  add.setAttribute('aria-label', `Add another ${cfg.name} account`);
  add.textContent = '+';
  add.addEventListener('click', () => addAccount(cfg.id, add));
  row.appendChild(add);

  block.appendChild(row);

  const note = notes.get(cfg.id);
  if (note) {
    const line = document.createElement('div');
    line.className = note.isError ? 'app-note error' : 'app-note';
    line.setAttribute('role', 'status');
    line.textContent = note.message;
    block.appendChild(line);
  }

  if (accounts.length > 1) {
    const list = document.createElement('div');
    list.className = 'account-list';
    accounts.forEach(account => list.appendChild(buildAccountRow(account, cfg.id)));
    block.appendChild(list);
  }

  return block;
}

function renderApps() {
  appsList.replaceChildren(...APPS.map(buildAppBlock));
}

function renderToggles() {
  for (const [key, input] of Object.entries(toggles)) input.checked = settings[key];
  startMinimizedNote.hidden = !settings.startMinimized;
}

toggles.horizontalTabs.addEventListener('change', e => {
  settings.horizontalTabs = e.target.checked;
  save();
});
toggles.streamerMode.addEventListener('change', async e => {
  settings.streamerMode = e.target.checked;
  await window.electronAPI.setStreamerMode(settings.streamerMode);
  save();
});
toggles.closeToTray.addEventListener('change', e => {
  settings.closeToTray = e.target.checked;
  save();
});
toggles.autoStart.addEventListener('change', e => {
  settings.autoStart = e.target.checked;
  save();
});
toggles.startMinimized.addEventListener('change', e => {
  settings.startMinimized = e.target.checked;
  startMinimizedNote.hidden = !settings.startMinimized;
  save();
});

window.electronAPI.onSettingsChanged(incoming => {
  adopt(incoming);
  renderToggles();
  renderApps();
});

async function init() {
  adopt(await window.electronAPI.loadSettings());
  renderToggles();
  renderApps();
}
init();
