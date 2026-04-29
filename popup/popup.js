const TOGGLE_KEYS = ['mirrorMouse', 'mirrorKeyboard', 'mirrorScroll', 'mirrorInput'];
const SKIPPED_SCHEMES = ['chrome://', 'chrome-extension://', 'about:', 'edge://'];

const $ = (id) => document.getElementById(id);

// ── DOM refs ───────────────────────────────────────────────────────────────
const btnStart      = $('btn-start');
const btnStop       = $('btn-stop');
const btnInject     = $('btn-inject');
const injectStatus  = $('inject-status');
const statusEl      = $('status');
const statusText    = $('status-text');
const sourceInfo    = $('source-info');
const sourceFavicon = $('source-favicon');
const sourceTitle   = $('source-title');
const tabListEl     = $('tab-list');
const selectAllEl   = $('select-all-tabs');
const mirrorCountEl = $('mirror-count');

const toggleEls = {
  mirrorMouse:    $('toggle-mouse'),
  mirrorKeyboard: $('toggle-keyboard'),
  mirrorScroll:   $('toggle-scroll'),
  mirrorInput:    $('toggle-input'),
};

// ── Session state ──────────────────────────────────────────────────────────
let currentSourceTabId = null;  // null when not mirroring
let currentMirrorTabIds = null; // null = all tabs
let allTabs = [];               // non-source eligible tabs

// ── Helpers ────────────────────────────────────────────────────────────────
function isSkipped(url) {
  if (!url) return true;
  return SKIPPED_SCHEMES.some((s) => url.startsWith(s));
}

function eligibleTabs(tabs, sourceTabId) {
  return tabs.filter((t) => t.id !== sourceTabId && !isSkipped(t.url));
}

function checkedTabIds() {
  return allTabs
    .filter((tab) => {
      const cb = tabListEl.querySelector(`input[data-tab-id="${tab.id}"]`);
      return cb?.checked;
    })
    .map((t) => t.id);
}

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

function updateMirrorCount() {
  const total = allTabs.length;
  if (total === 0) {
    mirrorCountEl.classList.add('hidden');
    return;
  }
  const ids = checkedTabIds();
  const count = ids.length;
  mirrorCountEl.classList.remove('hidden');

  if (currentSourceTabId !== null) {
    mirrorCountEl.textContent = count === 0
      ? 'Mirroring paused — no targets selected'
      : `Mirroring to ${count} of ${total} tab${total !== 1 ? 's' : ''}`;
    mirrorCountEl.className = `mirror-count ${count === 0 ? 'mirror-count--warn' : 'mirror-count--active'}`;
  } else {
    mirrorCountEl.textContent = count === total
      ? `Will mirror to all ${total} tab${total !== 1 ? 's' : ''}`
      : `Will mirror to ${count} of ${total} tab${total !== 1 ? 's' : ''}`;
    mirrorCountEl.className = 'mirror-count';
  }
}

function syncSelectAll() {
  const ids = checkedTabIds();
  selectAllEl.checked = ids.length === allTabs.length;
  selectAllEl.indeterminate = ids.length > 0 && ids.length < allTabs.length;
}

// ── Tab list rendering ─────────────────────────────────────────────────────
function renderTabList(tabs, mirrorTabIds, sourceTabId) {
  allTabs = tabs;

  if (tabs.length === 0) {
    tabListEl.innerHTML = '<div class="tab-list-empty">No other tabs open</div>';
    selectAllEl.checked = false;
    selectAllEl.indeterminate = false;
    mirrorCountEl.classList.add('hidden');
    return;
  }

  tabListEl.innerHTML = '';

  for (const tab of tabs) {
    const isActive = sourceTabId !== null && (mirrorTabIds === null || mirrorTabIds.includes(tab.id));
    const isChecked = mirrorTabIds === null || mirrorTabIds.includes(tab.id);

    const row = document.createElement('label');
    row.className = `tab-row${isActive ? ' tab-row--active' : ''}`;
    row.title = tab.title ?? '';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.dataset.tabId = String(tab.id);
    cb.checked = isChecked;
    cb.addEventListener('change', onTabCheckboxChange);

    const dot = document.createElement('span');
    dot.className = 'tab-live-dot';

    const favicon = document.createElement('img');
    favicon.className = 'tab-favicon';
    favicon.src = tab.favIconUrl ?? '';
    favicon.alt = '';
    favicon.width = 14;
    favicon.height = 14;

    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = tab.title ?? tab.url ?? 'Untitled';

    row.append(cb, dot, favicon, title);
    tabListEl.appendChild(row);
  }

  syncSelectAll();
  updateMirrorCount();
}

// ── Tab selection persistence ──────────────────────────────────────────────
async function persistMirrorSelection() {
  const ids = checkedTabIds();
  // null when all tabs are checked (mirror all)
  const value = ids.length === allTabs.length ? null : ids;
  currentMirrorTabIds = value;
  await chrome.runtime.sendMessage({ type: 'SET_MIRROR_TABS', ids: value });
  syncSelectAll();
  updateMirrorCount();
}

function onTabCheckboxChange() {
  persistMirrorSelection();
}

selectAllEl.addEventListener('change', () => {
  const checks = tabListEl.querySelectorAll('input[type="checkbox"]');
  checks.forEach((cb) => { cb.checked = selectAllEl.checked; });
  persistMirrorSelection();
});

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

  const [{ sourceTab, mirrorTabIds }, allOpenTabs] = await Promise.all([
    chrome.runtime.sendMessage({ type: 'GET_STATE' }),
    chrome.tabs.query({}),
  ]);

  currentSourceTabId = sourceTab?.id ?? null;
  currentMirrorTabIds = mirrorTabIds ?? null;

  if (sourceTab) {
    showActiveState(sourceTab);
  } else {
    showIdleState();
  }

  const tabs = eligibleTabs(allOpenTabs, currentSourceTabId);
  renderTabList(tabs, currentMirrorTabIds, currentSourceTabId);
}

// ── Button handlers ────────────────────────────────────────────────────────
btnStart.addEventListener('click', async () => {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab) return;

  const response = await chrome.runtime.sendMessage({ type: 'SET_SOURCE', tabId: activeTab.id });
  if (!response?.ok) return;

  currentSourceTabId = response.tab.id;
  showActiveState(response.tab);

  // Refresh tab list now that source is known
  const allOpenTabs = await chrome.tabs.query({});
  const tabs = eligibleTabs(allOpenTabs, currentSourceTabId);
  renderTabList(tabs, currentMirrorTabIds, currentSourceTabId);
});

btnStop.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'CLEAR_SOURCE' });
  currentSourceTabId = null;
  showIdleState();

  // Re-render to remove active indicators
  const allOpenTabs = await chrome.tabs.query({});
  const tabs = eligibleTabs(allOpenTabs, null);
  renderTabList(tabs, currentMirrorTabIds, null);
});

// ── Inject handler ─────────────────────────────────────────────────────────
btnInject.addEventListener('click', async () => {
  btnInject.disabled = true;
  injectStatus.textContent = 'Injecting…';
  const res = await chrome.runtime.sendMessage({ type: 'INJECT_ALL' });
  injectStatus.textContent = res?.ok ? `↑ ${res.injected} tab${res.injected !== 1 ? 's' : ''} reached` : 'Error';
  setTimeout(() => {
    btnInject.disabled = false;
    injectStatus.textContent = '';
  }, 2500);
});

// ── Toggle handlers ────────────────────────────────────────────────────────
for (const el of Object.values(toggleEls)) {
  el.addEventListener('change', saveToggles);
}

// ── Macro UI ───────────────────────────────────────────────────────────────
const btnRecord     = $('btn-record');
const macroTimer    = $('macro-timer');
const macroSaveRow  = $('macro-save-row');
const macroNameInput = $('macro-name');
const btnSaveMacro  = $('btn-save-macro');
const macroListEl   = $('macro-list');

let macroRecording = false;
let timerInterval = null;
let timerStart = 0;

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}:${String(s % 60).padStart(2, '0')}` : `0:${String(s % 60).padStart(2, '0')}`;
}

function renderMacros(macros) {
  if (!macros.length) {
    macroListEl.innerHTML = '<div class="tab-list-empty">No macros saved</div>';
    return;
  }
  macroListEl.innerHTML = '';
  for (const macro of macros) {
    const row = document.createElement('div');
    row.className = 'macro-row';

    const name = document.createElement('span');
    name.className = 'macro-row-name';
    name.textContent = macro.name;
    name.title = macro.name;

    const meta = document.createElement('span');
    meta.className = 'macro-row-meta';
    meta.textContent = formatDuration(macro.duration);

    const btnPlay = document.createElement('button');
    btnPlay.className = 'btn--icon btn--play';
    btnPlay.title = 'Play';
    btnPlay.textContent = '▶';
    btnPlay.addEventListener('click', async () => {
      btnPlay.disabled = true;
      await chrome.runtime.sendMessage({ type: 'PLAY_MACRO', id: macro.id });
      setTimeout(() => { btnPlay.disabled = false; }, macro.duration + 500);
    });

    const btnDel = document.createElement('button');
    btnDel.className = 'btn--icon btn--delete';
    btnDel.title = 'Delete';
    btnDel.textContent = '✕';
    btnDel.addEventListener('click', async () => {
      await chrome.runtime.sendMessage({ type: 'DELETE_MACRO', id: macro.id });
      const { macros: updated } = await chrome.runtime.sendMessage({ type: 'GET_MACROS' });
      renderMacros(updated);
    });

    row.append(name, meta, btnPlay, btnDel);
    macroListEl.appendChild(row);
  }
}

btnRecord.addEventListener('click', async () => {
  if (!macroRecording) {
    const res = await chrome.runtime.sendMessage({ type: 'START_RECORDING' });
    if (!res?.ok) return;
    macroRecording = true;
    timerStart = Date.now();
    btnRecord.textContent = '■ Stop';
    btnRecord.classList.add('is-recording');
    macroSaveRow.classList.add('hidden');
    macroTimer.classList.remove('hidden');
    macroTimer.textContent = '0.0s';
    timerInterval = setInterval(() => {
      macroTimer.textContent = ((Date.now() - timerStart) / 1000).toFixed(1) + 's';
    }, 100);
  } else {
    clearInterval(timerInterval);
    timerInterval = null;
    const res = await chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
    macroRecording = false;
    btnRecord.textContent = '● Record';
    btnRecord.classList.remove('is-recording');
    macroTimer.classList.add('hidden');
    if (res?.ok && res.eventCount > 0) {
      macroNameInput.value = '';
      macroSaveRow.classList.remove('hidden');
      macroNameInput.focus();
    }
  }
});

btnSaveMacro.addEventListener('click', async () => {
  const name = macroNameInput.value.trim() || 'Untitled macro';
  const res = await chrome.runtime.sendMessage({ type: 'SAVE_MACRO', name });
  if (!res?.ok) return;
  macroSaveRow.classList.add('hidden');
  const { macros } = await chrome.runtime.sendMessage({ type: 'GET_MACROS' });
  renderMacros(macros);
});

macroNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btnSaveMacro.click();
});

// ── Init ───────────────────────────────────────────────────────────────────
async function initMacros() {
  const res = await chrome.runtime.sendMessage({ type: 'GET_MACROS' });
  renderMacros(res?.macros ?? []);

  // Popup is destroyed and recreated on every open — restore recording UI if
  // the background was still recording when the popup was last closed.
  if (res?.recording) {
    macroRecording = true;
    timerStart = res.recording.startTime;
    btnRecord.textContent = '■ Stop';
    btnRecord.classList.add('is-recording');
    macroSaveRow.classList.add('hidden');
    macroTimer.classList.remove('hidden');
    macroTimer.textContent = ((Date.now() - timerStart) / 1000).toFixed(1) + 's';
    timerInterval = setInterval(() => {
      macroTimer.textContent = ((Date.now() - timerStart) / 1000).toFixed(1) + 's';
    }, 100);
  }
}

// ── Start ──────────────────────────────────────────────────────────────────
init();
initMacros();
