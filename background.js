const SKIPPED_SCHEMES = ['chrome://', 'chrome-extension://', 'about:', 'edge://'];

// ── Macro recording state (in-memory; cleared on service worker restart) ───
const rec = { active: false, tabId: null, startTime: null, buffer: [] };

// ── Macro storage helpers ──────────────────────────────────────────────────
async function getMacros() {
  const result = await chrome.storage.local.get('macros');
  return result.macros ?? [];
}

async function saveMacros(macros) {
  await chrome.storage.local.set({ macros });
}

function isSkippedUrl(url) {
  if (!url) return true;
  return SKIPPED_SCHEMES.some((scheme) => url.startsWith(scheme));
}

async function getSourceTabId() {
  const result = await chrome.storage.session.get('sourceTabId');
  return result.sourceTabId ?? null;
}

async function setSourceTabId(tabId) {
  await chrome.storage.session.set({ sourceTabId: tabId });
}

async function clearSourceTabId() {
  await chrome.storage.session.remove('sourceTabId');
}

// null = mirror all eligible tabs; number[] = only these tab IDs
async function getMirrorTabIds() {
  const result = await chrome.storage.session.get('mirrorTabIds');
  return result.mirrorTabIds ?? null;
}

async function setMirrorTabIds(ids) {
  await chrome.storage.session.set({ mirrorTabIds: ids });
}

// Inject content.js into a tab that was open before the extension loaded.
// content.js guards against double-injection with window.__mirrortabLoaded.
async function injectContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    return true;
  } catch {
    return false;
  }
}

// Try sending a message; if no content script is present yet, return false.
async function trySendMessage(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
    return true;
  } catch {
    return false;
  }
}

async function broadcastToMirrors(sourceTabId, message) {
  const [tabs, mirrorTabIds] = await Promise.all([
    chrome.tabs.query({}),
    getMirrorTabIds(),
  ]);
  const targets = tabs.filter((tab) => {
    if (tab.id === sourceTabId) return false;
    if (isSkippedUrl(tab.url)) return false;
    if (mirrorTabIds !== null && !mirrorTabIds.includes(tab.id)) return false;
    return true;
  });
  await Promise.allSettled(targets.map((tab) => trySendMessage(tab.id, message)));
}

async function broadcastToAll(message) {
  const tabs = await chrome.tabs.query({});
  const targets = tabs.filter((tab) => !isSkippedUrl(tab.url));
  await Promise.allSettled(targets.map((tab) => trySendMessage(tab.id, message)));
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // MIRROR_EVENT is fire-and-forget from content.js — the message port is
  // already closed by the time we finish broadcasting. Handle it synchronously
  // (kick off the async work, return false so the port is released immediately).
  if (message.type === 'MIRROR_EVENT') {
    (async () => {
      try {
        const sourceTabId = await getSourceTabId();
        if (sourceTabId === null) return;
        await broadcastToMirrors(sourceTabId, { type: 'MIRROR_EVENT', event: message.event, payload: message.payload });
      } catch (err) {
        console.error('[mirrortab] MIRROR_EVENT broadcast error:', err);
      }
    })();
    return false;
  }

  // RECORD_EVENT is fire-and-forget — accumulate into recording buffer
  if (message.type === 'RECORD_EVENT') {
    if (rec.active && sender.tab?.id === rec.tabId) {
      rec.buffer.push({ t: Date.now() - rec.startTime, event: message.event, payload: message.payload });
    }
    return false;
  }

  const handle = async () => {
    try {
      if (message.type === 'SET_SOURCE') {
        const tabId = sender.tab?.id ?? message.tabId;
        await setSourceTabId(tabId);
        // Try to reach the content script. If it isn't there yet (tab was open before
        // the extension loaded), inject it first, then retry.
        if (!await trySendMessage(tabId, { type: 'BECOME_SOURCE' })) {
          await injectContentScript(tabId);
          await trySendMessage(tabId, { type: 'BECOME_SOURCE' });
        }
        const tab = await chrome.tabs.get(tabId);
        sendResponse({ ok: true, tab: { id: tab.id, title: tab.title, favIconUrl: tab.favIconUrl } });
      }

      else if (message.type === 'CLEAR_SOURCE') {
        await clearSourceTabId();
        await broadcastToAll({ type: 'SOURCE_CLEARED' });
        sendResponse({ ok: true });
      }

      else if (message.type === 'INJECT_ALL') {
        const tabs = await chrome.tabs.query({});
        const results = await Promise.allSettled(
          tabs.filter((t) => !isSkippedUrl(t.url)).map((t) => injectContentScript(t.id))
        );
        const injected = results.filter((r) => r.status === 'fulfilled' && r.value).length;
        sendResponse({ ok: true, injected });
      }

      else if (message.type === 'SET_MIRROR_TABS') {
        await setMirrorTabIds(message.ids);
        sendResponse({ ok: true });
      }

      else if (message.type === 'START_RECORDING') {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab || isSkippedUrl(activeTab.url)) {
          sendResponse({ ok: false, error: 'No recordable tab active' });
          return;
        }
        rec.active = true;
        rec.tabId = activeTab.id;
        rec.startTime = Date.now();
        rec.buffer = [];
        if (!await trySendMessage(activeTab.id, { type: 'BECOME_RECORDER' })) {
          await injectContentScript(activeTab.id);
          await trySendMessage(activeTab.id, { type: 'BECOME_RECORDER' });
        }
        sendResponse({ ok: true, tabId: activeTab.id });
      }

      else if (message.type === 'STOP_RECORDING') {
        rec.active = false;
        await trySendMessage(rec.tabId, { type: 'RECORDING_DONE' });
        const duration = rec.buffer.at(-1)?.t ?? 0;
        sendResponse({ ok: true, duration, eventCount: rec.buffer.length });
      }

      else if (message.type === 'SAVE_MACRO') {
        const macro = {
          id: Date.now().toString(),
          name: message.name || 'Untitled macro',
          events: rec.buffer,
          duration: rec.buffer.at(-1)?.t ?? 0,
          eventCount: rec.buffer.length,
          recordedAt: Date.now(),
        };
        rec.buffer = [];
        const macros = await getMacros();
        await saveMacros([macro, ...macros]);
        sendResponse({ ok: true, macro });
      }

      else if (message.type === 'GET_MACROS') {
        const macros = await getMacros();
        sendResponse({ ok: true, macros });
      }

      else if (message.type === 'PLAY_MACRO') {
        const macros = await getMacros();
        const macro = macros.find((m) => m.id === message.id);
        if (!macro) { sendResponse({ ok: false, error: 'Macro not found' }); return; }
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab || isSkippedUrl(activeTab.url)) {
          sendResponse({ ok: false, error: 'No playable tab active' }); return;
        }
        if (!await trySendMessage(activeTab.id, { type: 'PLAY_EVENTS', events: macro.events })) {
          await injectContentScript(activeTab.id);
          await trySendMessage(activeTab.id, { type: 'PLAY_EVENTS', events: macro.events });
        }
        sendResponse({ ok: true });
      }

      else if (message.type === 'DELETE_MACRO') {
        const macros = await getMacros();
        await saveMacros(macros.filter((m) => m.id !== message.id));
        sendResponse({ ok: true });
      }

      else if (message.type === 'GET_STATE') {
        const [sourceTabId, mirrorTabIds] = await Promise.all([
          getSourceTabId(),
          getMirrorTabIds(),
        ]);
        if (sourceTabId === null) {
          sendResponse({ sourceTab: null, mirrorTabIds });
          return;
        }
        try {
          const tab = await chrome.tabs.get(sourceTabId);
          sendResponse({ sourceTab: { id: tab.id, title: tab.title, favIconUrl: tab.favIconUrl }, mirrorTabIds });
        } catch {
          await clearSourceTabId();
          sendResponse({ sourceTab: null, mirrorTabIds });
        }
      }
    } catch (err) {
      console.error('[mirrortab] message handler error:', message.type, err);
      try { sendResponse({ ok: false, error: err.message }); } catch {}
    }
  };

  handle();
  return true; // keep message channel open for async response
});

// Re-establish source capture after the source tab navigates to a new URL.
// Navigation tears down the old content script and injects a fresh one, so
// isSource resets to false. Sending BECOME_SOURCE again restores capture.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  // Ignore non-completion events cheaply, before any async work.
  if (changeInfo.status !== 'complete') return;

  try {
    const sourceTabId = await getSourceTabId();
    if (tabId !== sourceTabId) return;

    const ok = await trySendMessage(tabId, { type: 'BECOME_SOURCE' });
    if (!ok) {
      // Content script may still be initialising — retry once after a short wait
      await new Promise((r) => setTimeout(r, 300));
      await trySendMessage(tabId, { type: 'BECOME_SOURCE' });
    }
  } catch (err) {
    console.warn('[mirrortab] onUpdated error:', err.message);
  }
});

// Inject content.js into all tabs already open at install/reload time.
// Tabs that loaded after the extension was installed already receive the
// content script via the manifest declaration — this only handles pre-existing tabs.
chrome.runtime.onInstalled.addListener(async () => {
  try {
    const tabs = await chrome.tabs.query({});
    await Promise.allSettled(
      tabs
        .filter((tab) => !isSkippedUrl(tab.url))
        .map((tab) => injectContentScript(tab.id))
    );
  } catch (err) {
    console.warn('[mirrortab] onInstalled injection error:', err.message);
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  try {
    const [sourceTabId, mirrorTabIds] = await Promise.all([
      getSourceTabId(),
      getMirrorTabIds(),
    ]);

    if (tabId === sourceTabId) {
      await clearSourceTabId();
      await broadcastToAll({ type: 'SOURCE_CLEARED' });
      return;
    }

    // Remove closed tab from the explicit mirror list if present
    if (mirrorTabIds !== null) {
      const updated = mirrorTabIds.filter((id) => id !== tabId);
      await setMirrorTabIds(updated.length ? updated : null);
    }
  } catch (err) {
    console.warn('[mirrortab] onRemoved error:', err.message);
  }
});
