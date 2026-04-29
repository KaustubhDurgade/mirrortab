;(function () {
// Guard: if this tab already has the content script (injected by manifest on page load),
// a programmatic re-injection via chrome.scripting.executeScript must not add duplicate
// event listeners. Bail out immediately if we've already initialised.
if (window.__mirrortabLoaded) return;
window.__mirrortabLoaded = true;

// ── State ──────────────────────────────────────────────────────────────────
let isSource = false;
let isMirror = false;
let isRecording = false;
let isReplaying = false; // guard: stop replayed events from re-capturing

// ── Mirror Banner ──────────────────────────────────────────────────────────
let bannerHost = null;
let bannerDismissed = false;

function showMirrorBanner() {
  if (bannerHost || bannerDismissed) return;

  const host = document.createElement('div');
  host.style.cssText = 'all:initial;position:fixed;top:0;left:0;width:100%;z-index:2147483647;pointer-events:none;';
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    .banner {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 14px;
      background: rgba(22, 33, 62, 0.93);
      border-bottom: 1px solid rgba(76,175,80,0.5);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 12px;
      font-weight: 600;
      color: #4caf50;
      pointer-events: auto;
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
    }
    .dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: #4caf50; box-shadow: 0 0 5px #4caf50;
      flex-shrink: 0;
      animation: pulse 1.4s ease-in-out infinite;
    }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
    .label { flex: 1; }
    .close {
      cursor: pointer; color: rgba(136,146,164,0.8);
      font-size: 15px; line-height: 1; padding: 0 2px;
    }
    .close:hover { color: #eaeaea; }
  `;

  const banner = document.createElement('div');
  banner.className = 'banner';
  banner.innerHTML = '<span class="dot"></span><span class="label">Tab Mirror — mirroring active</span><span class="close" title="Dismiss">✕</span>';
  banner.querySelector('.close').addEventListener('click', () => {
    bannerDismissed = true;
    hideMirrorBanner();
  });

  shadow.append(style, banner);
  document.documentElement.appendChild(host);
  bannerHost = host;
}

function hideMirrorBanner() {
  if (bannerHost) { bannerHost.remove(); bannerHost = null; }
}

// ── CSS Path Helper ────────────────────────────────────────────────────────
function getCssPath(el) {
  if (!el || el === document.body || el === document.documentElement) return 'body';
  if (el.id) return `#${CSS.escape(el.id)}`;

  const parts = [];
  let current = el;
  while (current && current !== document.body && current !== document.documentElement) {
    let selector = current.tagName.toLowerCase();
    if (current.id) {
      selector = `#${CSS.escape(current.id)}`;
      parts.unshift(selector);
      break;
    }
    const siblings = Array.from(current.parentElement?.children ?? []).filter(
      (c) => c.tagName === current.tagName
    );
    if (siblings.length > 1) {
      const idx = siblings.indexOf(current) + 1;
      selector += `:nth-of-type(${idx})`;
    }
    parts.unshift(selector);
    current = current.parentElement;
  }
  return parts.join(' > ') || 'body';
}

// ── Throttle Helpers ───────────────────────────────────────────────────────
function rafThrottle(fn) {
  let pending = false;
  return (...args) => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      fn(...args);
      pending = false;
    });
  };
}

// ── Coordinate Helpers ─────────────────────────────────────────────────────
function normX(clientX) { return clientX / window.innerWidth; }
function normY(clientY) { return clientY / window.innerHeight; }
function denormX(xPct) { return xPct * window.innerWidth; }
function denormY(yPct) { return yPct * window.innerHeight; }

// ── Send Helper ────────────────────────────────────────────────────────────
function sendEvent(event, payload) {
  if (isSource) chrome.runtime.sendMessage({ type: 'MIRROR_EVENT', event, payload }).catch(() => {});
  if (isRecording) chrome.runtime.sendMessage({ type: 'RECORD_EVENT', event, payload }).catch(() => {});
}

// ── Capture Handlers ───────────────────────────────────────────────────────
function onMouseEvent(e) {
  if (!isSource || isReplaying) return;
  sendEvent(e.type, {
    xPct: normX(e.clientX),
    yPct: normY(e.clientY),
    button: e.button,
    selector: getCssPath(e.target),
  });
}

const onMouseMove = rafThrottle((e) => {
  if (!isSource || isReplaying) return;
  sendEvent('mousemove', { xPct: normX(e.clientX), yPct: normY(e.clientY) });
});

function onKeyEvent(e) {
  if (!isSource || isReplaying) return;
  sendEvent(e.type, {
    key: e.key,
    code: e.code,
    ctrlKey: e.ctrlKey,
    shiftKey: e.shiftKey,
    altKey: e.altKey,
    metaKey: e.metaKey,
  });
}

function onInputEvent(e) {
  if (!isSource || isReplaying) return;
  sendEvent('input', {
    selector: getCssPath(e.target),
    value: e.target.value,
  });
}

function onScrollEvent(e) {
  if (!isSource || isReplaying) return;
  const el = e.target === document ? document.documentElement : e.target;
  const scrollXPct = el.scrollWidth > el.clientWidth
    ? el.scrollLeft / (el.scrollWidth - el.clientWidth)
    : 0;
  const scrollYPct = el.scrollHeight > el.clientHeight
    ? el.scrollTop / (el.scrollHeight - el.clientHeight)
    : 0;
  sendEvent('scroll', {
    selector: el === document.documentElement ? 'html' : getCssPath(el),
    scrollXPct,
    scrollYPct,
  });
}

const onScrollThrottled = rafThrottle(onScrollEvent);

function onPointerEvent(e) {
  if (!isSource || isReplaying) return;
  sendEvent(e.type, {
    xPct: normX(e.clientX),
    yPct: normY(e.clientY),
    pointerId: e.pointerId,
    button: e.button,
    buttons: e.buttons,
  });
}

const onPointerMove = rafThrottle((e) => {
  if (!isSource || isReplaying) return;
  sendEvent('pointermove', {
    xPct: normX(e.clientX),
    yPct: normY(e.clientY),
    pointerId: e.pointerId,
    buttons: e.buttons,
  });
});

// ── Capture Listener Attach / Detach ──────────────────────────────────────
const MOUSE_EVENTS = ['click', 'contextmenu', 'mousedown', 'mouseup'];
const KEY_EVENTS = ['keydown', 'keyup'];
const POINTER_EVENTS = ['pointerdown', 'pointerup'];

function attachCaptureListeners() {
  MOUSE_EVENTS.forEach((ev) => window.addEventListener(ev, onMouseEvent, { capture: true }));
  window.addEventListener('mousemove', onMouseMove, { capture: true });
  KEY_EVENTS.forEach((ev) => window.addEventListener(ev, onKeyEvent, { capture: true }));
  window.addEventListener('input', onInputEvent, { capture: true });
  window.addEventListener('scroll', onScrollThrottled, { capture: true });
  POINTER_EVENTS.forEach((ev) => window.addEventListener(ev, onPointerEvent, { capture: true }));
  window.addEventListener('pointermove', onPointerMove, { capture: true });
}

function detachCaptureListeners() {
  MOUSE_EVENTS.forEach((ev) => window.removeEventListener(ev, onMouseEvent, { capture: true }));
  window.removeEventListener('mousemove', onMouseMove, { capture: true });
  KEY_EVENTS.forEach((ev) => window.removeEventListener(ev, onKeyEvent, { capture: true }));
  window.removeEventListener('input', onInputEvent, { capture: true });
  window.removeEventListener('scroll', onScrollThrottled, { capture: true });
  POINTER_EVENTS.forEach((ev) => window.removeEventListener(ev, onPointerEvent, { capture: true }));
  window.removeEventListener('pointermove', onPointerMove, { capture: true });
}

// ── Replay ─────────────────────────────────────────────────────────────────
function replayEvent(event, payload) {
  isReplaying = true;
  try {
    if (['click', 'contextmenu', 'mousedown', 'mouseup', 'mousemove'].includes(event)) {
      const clientX = denormX(payload.xPct);
      const clientY = denormY(payload.yPct);
      const el = document.elementFromPoint(clientX, clientY) ?? document.body;
      el.dispatchEvent(new MouseEvent(event, {
        clientX,
        clientY,
        button: payload.button ?? 0,
        buttons: payload.button === 2 ? 2 : 1,
        bubbles: true,
        composed: true,
        cancelable: true,
      }));
    }

    else if (['keydown', 'keyup'].includes(event)) {
      document.activeElement?.dispatchEvent(new KeyboardEvent(event, {
        key: payload.key,
        code: payload.code,
        ctrlKey: payload.ctrlKey,
        shiftKey: payload.shiftKey,
        altKey: payload.altKey,
        metaKey: payload.metaKey,
        bubbles: true,
        composed: true,
        cancelable: true,
      }));
    }

    else if (event === 'input') {
      const el = document.querySelector(payload.selector);
      if (!el) return;
      // React/Vue compatible value setter
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
        ?? Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(el, payload.value);
      } else {
        el.value = payload.value;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    else if (event === 'scroll') {
      const el = payload.selector === 'html'
        ? document.documentElement
        : document.querySelector(payload.selector) ?? document.documentElement;
      const targetX = payload.scrollXPct * (el.scrollWidth - el.clientWidth);
      const targetY = payload.scrollYPct * (el.scrollHeight - el.clientHeight);
      el.scrollTo({ left: targetX, top: targetY, behavior: 'instant' });
    }

    else if (['pointerdown', 'pointerup', 'pointermove'].includes(event)) {
      const clientX = denormX(payload.xPct);
      const clientY = denormY(payload.yPct);
      const el = document.elementFromPoint(clientX, clientY) ?? document.body;
      el.dispatchEvent(new PointerEvent(event, {
        clientX,
        clientY,
        pointerId: payload.pointerId ?? 1,
        button: payload.button ?? 0,
        buttons: payload.buttons ?? 1,
        bubbles: true,
        composed: true,
        cancelable: true,
      }));
    }
  } finally {
    isReplaying = false;
  }
}

// ── Message Listener ───────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'BECOME_SOURCE') {
    isMirror = false;
    hideMirrorBanner();
    bannerDismissed = false;
    // Detach first so navigation-triggered re-sends don't stack duplicate listeners
    if (isSource) detachCaptureListeners();
    isSource = true;
    attachCaptureListeners();
  }

  else if (message.type === 'SOURCE_CLEARED') {
    if (isSource) {
      isSource = false;
      detachCaptureListeners();
    }
    isMirror = false;
    hideMirrorBanner();
    bannerDismissed = false;
  }

  else if (message.type === 'MIRROR_EVENT') {
    if (!isMirror) showMirrorBanner();
    isMirror = true;
    replayEvent(message.event, message.payload);
  }

  else if (message.type === 'BECOME_RECORDER') {
    if (!isSource) attachCaptureListeners();
    isRecording = true;
  }

  else if (message.type === 'RECORDING_DONE') {
    isRecording = false;
    if (!isSource) detachCaptureListeners();
  }

  else if (message.type === 'PLAY_EVENTS') {
    // t values are absolute ms from recording start — setTimeout recreates exact timing + pauses
    message.events.forEach(({ t, event, payload }) =>
      setTimeout(() => replayEvent(event, payload), t)
    );
  }
});

})();
