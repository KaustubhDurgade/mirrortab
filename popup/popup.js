const TOGGLE_KEYS = ['mirrorMouse', 'mirrorKeyboard', 'mirrorScroll', 'mirrorInput'];

const $ = (id) => document.getElementById(id);

// ── DOM refs ───────────────────────────────────────────────────────────────
const btnStart      = $('btn-start');
const btnStop       = $('btn-stop');
const statusEl      = $('status');
const statusDot     = $('status-dot');
const statusText    = $('status-text');
const sourceInfo    = $('source-info');
const sourceFavicon = $('source-favicon');
const sourceTitle   = $('source-title');

const toggleEls = {
  mirrorMouse:    $('toggle-mouse'),
  mirrorKeyboard: $('toggle-keyboard'),
  mirrorScroll:   $('toggle-scroll'),
  mirrorInput:    $('toggle-input'),
};

// ── UI helpers ─────────────────────────────────────────────────────────────
function showActiveState(tab) {
  statusEl.className = 'status status--active';
  statusText.textContent = 'Mirroring active';
  sourceInfo.classList.remove('hidden');
  sourceFavicon.src = tab.favIconUrl ?? '';
  sourceTitle.textContent = tab.title ?? 'Unknown tab';
  btnStart.classList.add('hidden');
  btnStop.classList.remove('hidden');
}

function showIdleState() {
  statusEl.className = 'status status--idle';
  statusText.textContent = 'Not mirroring';
  sourceInfo.classList.add('hidden');
  btnStart.classList.remove('hidden');
  btnStop.classList.add('hidden');
}

// ── Toggle persistence ─────────────────────────────────────────────────────
async function loadToggles() {
  const defaults = Object.fromEntries(TOGGLE_KEYS.map((k) => [k, true]));
  const stored = await chrome.storage.session.get(TOGGLE_KEYS);
  const values = { ...defaults, ...stored };
  for (const [key, el] of Object.entries(toggleEls)) {
    el.checked = values[key] !== false;
  }
}

async function saveToggles() {
  const values = Object.fromEntries(
    Object.entries(toggleEls).map(([key, el]) => [key, el.checked])
  );
  await chrome.storage.session.set(values);
}

// ── Init ───────────────────────────────────────────────────────────────────
async function init() {
  await loadToggles();

  const { sourceTab } = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
  if (sourceTab) {
    showActiveState(sourceTab);
  } else {
    showIdleState();
  }
}

// ── Button handlers ────────────────────────────────────────────────────────
btnStart.addEventListener('click', async () => {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab) return;
  const response = await chrome.runtime.sendMessage({ type: 'SET_SOURCE', tabId: activeTab.id });
  if (response?.ok) {
    showActiveState(response.tab);
  }
});

btnStop.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'CLEAR_SOURCE' });
  showIdleState();
});

// ── Toggle handlers ────────────────────────────────────────────────────────
for (const el of Object.values(toggleEls)) {
  el.addEventListener('change', saveToggles);
}

// ── Start ──────────────────────────────────────────────────────────────────
init();
