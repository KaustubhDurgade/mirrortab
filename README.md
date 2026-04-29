# Tab Mirror

A Chrome extension (MV3) that mirrors every user interaction from one tab to any number of other tabs in real time — no server required, fully browser-local.

## What it mirrors

- Mouse clicks, right-clicks, mousedown/up
- Mouse movement (rAF-throttled)
- Keyboard input
- Text field typing (React/Vue compatible)
- Scroll position (any scrollable element)
- Pointer events (drag, touch)

## Install (unpacked)

1. Clone or download this repo
2. Open `chrome://extensions` (or `comet://extensions`, `edge://extensions`, etc.)
3. Enable **Developer mode**
4. Click **Load unpacked** and select this folder
5. The Tab Mirror icon appears in your toolbar

## Usage

1. Click the **Tab Mirror** toolbar icon while on the tab you want to use as the source
2. Click **Start Mirroring** — that tab is now the source
3. Switch to any other open tab — it's now a mirror (a green banner appears at the top)
4. Anything you do on the source tab is replayed on all mirror tabs

**Selecting specific mirror targets:** The popup lists all open tabs with checkboxes. Uncheck any tab to exclude it.

**Stop mirroring:** Click **Stop Mirroring** in the popup.

## Troubleshooting (Comet / pre-existing tabs)

Content scripts only auto-inject when a page loads. Tabs that were already open when you installed the extension won't have the script yet, so events won't reach them.

**Fix:** Click **↺ Re-inject into all tabs** at the bottom of the popup. It injects the content script into every currently-open tab in one shot and shows how many tabs were reached. You only need to do this once per browser session after installing.

## Testing

```bash
npm install
node test-extension.js
```

Launches a real Chromium instance with the extension loaded and runs 7 end-to-end tests: popup UI, click/input/scroll mirroring, navigation resilience, and stop-mirroring.

## File overview

| File | Purpose |
|---|---|
| `manifest.json` | MV3 extension config |
| `background.js` | Service worker — message bus, tab routing, session state |
| `content.js` | Injected into every tab — event capture and replay |
| `popup/popup.html` | Control panel |
| `popup/popup.js` | Popup logic |
| `popup/popup.css` | Dark theme styles |
| `test-extension.js` | Playwright end-to-end test suite |
