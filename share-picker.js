const grid = document.getElementById('source-grid');
const stateLine = document.getElementById('state');
const audioRow = document.getElementById('audio-row');
const audioBox = document.getElementById('share-audio');
const confirmBtn = document.getElementById('confirm-share');
const cancelBtn = document.getElementById('cancel-share');
const tabButtons = [...document.querySelectorAll('.tab-button')];

let sources = [];
let kind = 'screen';
let selectedId = null;
let settled = false;

const visibleSources = () => sources.filter(s => s.kind === kind);

function setState(message) {
  stateLine.textContent = message || '';
  stateLine.hidden = !message;
}

function share() {
  if (!selectedId || settled) return;
  settled = true;
  confirmBtn.disabled = true;
  window.electronAPI.chooseShareSource(selectedId, audioBox.checked);
}

function cancel() {
  if (settled) return;
  settled = true;
  window.electronAPI.cancelShare();
}

function select(id) {
  selectedId = id;
  confirmBtn.disabled = !id;
  grid.querySelectorAll('.source').forEach(card => {
    const chosen = card.dataset.id === id;
    card.classList.toggle('selected', chosen);
    card.setAttribute('aria-selected', String(chosen));
  });
}

function buildCard(source) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'source';
  card.dataset.id = source.id;
  card.setAttribute('role', 'option');
  card.setAttribute('aria-selected', 'false');

  const thumb = document.createElement('div');
  thumb.className = 'source-thumb';
  if (source.thumbnail) {
    const img = document.createElement('img');
    img.src = source.thumbnail;
    img.alt = '';
    thumb.appendChild(img);
  }

  const label = document.createElement('span');
  label.className = 'source-label';
  if (source.icon) {
    const icon = document.createElement('img');
    icon.src = source.icon;
    icon.alt = '';
    label.appendChild(icon);
  }
  const name = document.createElement('span');
  name.className = 'source-name';
  name.textContent = source.name;
  name.title = source.name;
  label.appendChild(name);

  card.append(thumb, label);
  card.addEventListener('click', () => select(source.id));
  card.addEventListener('dblclick', () => { select(source.id); share(); });
  return card;
}

function render() {
  const shown = visibleSources();
  grid.replaceChildren(...shown.map(buildCard));

  if (!shown.length) {
    setState(kind === 'screen' ? 'No screens available.' : 'No open windows to share.');
  } else {
    setState('');
  }

  // A selection made on the other tab no longer applies.
  if (!shown.some(s => s.id === selectedId)) select(null);
  else select(selectedId);
}

tabButtons.forEach(button => {
  button.addEventListener('click', () => {
    kind = button.dataset.kind;
    tabButtons.forEach(b => b.classList.toggle('active', b === button));
    render();
  });
});

confirmBtn.addEventListener('click', share);
cancelBtn.addEventListener('click', cancel);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') cancel();
  if (e.key === 'Enter' && selectedId) share();
});
// Closing the window is handled in the main process, which declines the request.

async function init() {
  audioRow.hidden = !(await window.electronAPI.loopbackSupported());
  try {
    sources = await window.electronAPI.getShareSources();
  } catch (error) {
    setState('Could not read the list of screens and windows.');
    return;
  }
  // Fall back to the tab that actually has something in it.
  if (!sources.some(s => s.kind === 'screen') && sources.some(s => s.kind === 'window')) {
    kind = 'window';
    tabButtons.forEach(b => b.classList.toggle('active', b.dataset.kind === 'window'));
  }
  render();
  // Pre-select the primary screen so Enter works straight away.
  const first = visibleSources()[0];
  if (kind === 'screen' && first) select(first.id);
}
init();
