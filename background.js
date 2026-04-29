const SKIPPED_SCHEMES = ['chrome://', 'chrome-extension://', 'about:', 'edge://'];

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

async function broadcastToMirrors(sourceTabId, message) {
  const [tabs, mirrorTabIds] = await Promise.all([
    chrome.tabs.query({}),
    getMirrorTabIds(),
  ]);
  for (const tab of tabs) {
    if (tab.id === sourceTabId) continue;
    if (isSkippedUrl(tab.url)) continue;
    if (mirrorTabIds !== null && !mirrorTabIds.includes(tab.id)) continue;
    try {
      await chrome.tabs.sendMessage(tab.id, message);
    } catch {
      // Tab may not have content script loaded yet — skip silently
    }
  }
}

async function broadcastToAll(message) {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (isSkippedUrl(tab.url)) continue;
    try {
      await chrome.tabs.sendMessage(tab.id, message);
    } catch {
      // Skip tabs without content script
    }
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handle = async () => {
    if (message.type === 'SET_SOURCE') {
      const tabId = sender.tab?.id ?? message.tabId;
      await setSourceTabId(tabId);
      await chrome.tabs.sendMessage(tabId, { type: 'BECOME_SOURCE' });
      const tab = await chrome.tabs.get(tabId);
      sendResponse({ ok: true, tab: { id: tab.id, title: tab.title, favIconUrl: tab.favIconUrl } });
    }

    else if (message.type === 'CLEAR_SOURCE') {
      await clearSourceTabId();
      await broadcastToAll({ type: 'SOURCE_CLEARED' });
      sendResponse({ ok: true });
    }

    else if (message.type === 'MIRROR_EVENT') {
      const sourceTabId = await getSourceTabId();
      if (sourceTabId === null) return;
      await broadcastToMirrors(sourceTabId, { type: 'MIRROR_EVENT', event: message.event, payload: message.payload });
      sendResponse({ ok: true });
    }

    else if (message.type === 'SET_MIRROR_TABS') {
      // ids: number[] | null — null means mirror all
      await setMirrorTabIds(message.ids);
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
  };

  handle();
  return true; // keep message channel open for async response
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
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
});
