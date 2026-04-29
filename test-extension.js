/**
 * End-to-end test for the Tab Mirror extension.
 *
 * Key insight on testing the popup:
 *   Opening the popup URL as a *new* tab makes that new tab the active tab,
 *   so chrome.tabs.query({ active:true, currentWindow:true }) returns the
 *   popup tab — wrong ID, everything fails.
 *   Fix: navigate the *source* tab to the popup URL so the active tab IS the
 *   source tab, click "Start Mirroring", then navigate back. onUpdated then
 *   re-sends BECOME_SOURCE to the fresh content script.
 *
 * Usage:  node test-extension.js
 */
const { chromium } = require('playwright');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');

const EXT_PATH = path.resolve(__dirname);

const TEST_HTML = `<!DOCTYPE html>
<html><head><title>Mirror Test</title><style>
  body{font-family:sans-serif;padding:20px}
  #log{margin-top:12px;padding:8px;background:#f5f5f5;font-size:11px;min-height:40px}
  #log p{margin:1px 0}
  #scrollable{height:80px;overflow:auto;border:1px solid #ccc;margin-top:8px}
  .inner{height:500px;padding:8px}
</style></head>
<body>
  <h2>Mirror Test</h2>
  <button id="btn">Click Me</button>
  <input id="input" type="text" placeholder="type here"
         style="margin-left:8px;padding:4px;width:180px"/>
  <div id="scrollable"><div class="inner">scrollable</div></div>
  <div id="log"></div>
  <script>
    window._ev = [];
    const logEl = document.getElementById('log');
    function rec(msg){
      window._ev.push(msg);
      const p = document.createElement('p');
      p.textContent = new Date().toISOString().slice(11,23) + ' ' + msg;
      logEl.prepend(p);
    }
    document.addEventListener('click', e => rec('click:' + (e.target.id || e.target.tagName)), true);
    document.getElementById('input').addEventListener('input', e => rec('input:' + e.target.value));
    document.addEventListener('keydown', e => rec('keydown:' + e.key), true);
    document.getElementById('scrollable').addEventListener('scroll',
      e => rec('scroll:' + e.target.scrollTop));
  </script>
</body></html>`;

// ── Helpers ──────────────────────────────────────────────────────────────────
const results = [];
function log(msg)  { console.log('    ' + msg); }
function pass(msg) { console.log('  \x1b[32m✓\x1b[0m ' + msg); results.push({ ok: true,  msg }); }
function fail(msg) { console.log('  \x1b[31m✗\x1b[0m ' + msg); results.push({ ok: false, msg }); }
const wait = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  // ── Local HTTP server so <all_urls> content script injection fires ────────
  const server = http.createServer((_, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(TEST_HTML);
  });
  await new Promise(r => server.listen(9988, '127.0.0.1', r));
  const BASE = 'http://localhost:9988';
  log('Test server: ' + BASE);

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mirrortab-'));
  let context;

  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${EXT_PATH}`,
        `--load-extension=${EXT_PATH}`,
      ],
    });
    log('Browser launched');

    let sw = context.serviceWorkers()[0];
    if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 20000 });
    const extId = sw.url().split('/')[2];
    log('Extension ID: ' + extId);
    const POPUP_URL = `chrome-extension://${extId}/popup/popup.html`;
    await wait(1200);

    // ── Open source + mirror tabs ─────────────────────────────────────────
    const source = context.pages()[0];
    await source.goto(BASE + '/?tab=source');
    await source.waitForLoadState('domcontentloaded');

    const mirror = await context.newPage();
    await mirror.goto(BASE + '/?tab=mirror');
    await mirror.waitForLoadState('domcontentloaded');
    await wait(600);

    // ════════════════════════════════════════════════════════════════════════
    // TEST 1 — Popup "Start Mirroring" via real popup UI
    //
    // Navigate the *source* tab to the popup URL so that
    // chrome.tabs.query({ active, currentWindow }) returns the source tab's
    // real ID.  Click the button, wait for it to flip to active, then
    // navigate back.  onUpdated fires → BECOME_SOURCE re-sent to the new
    // content script on the test page.
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n── Test 1: "Start Mirroring" via real popup UI');
    await source.goto(POPUP_URL);
    await source.waitForLoadState('domcontentloaded');
    await wait(300);

    await source.click('#btn-start');
    try {
      await source.waitForFunction(
        () => document.getElementById('status')?.classList.contains('status--active'),
        { timeout: 5000 }
      );
      pass('Popup "Start Mirroring" button activates mirroring');
    } catch {
      fail('Popup button did not flip status to active');
    }

    // Navigate source back to test page; onUpdated re-sends BECOME_SOURCE
    await source.goto(BASE + '/?tab=source');
    await source.waitForLoadState('domcontentloaded');
    await wait(900);  // let onUpdated fire + content script settle

    // ════════════════════════════════════════════════════════════════════════
    // TEST 2 — Click is mirrored
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n── Test 2: Click mirroring');
    const clicksBefore = await mirror.evaluate(() => window._ev.filter(e => e.startsWith('click')).length);
    await source.click('#btn');
    await wait(500);
    const clicksAfter = await mirror.evaluate(() => window._ev.filter(e => e.startsWith('click')).length);
    clicksAfter > clicksBefore
      ? pass('Click replayed on mirror')
      : fail('Click not replayed. Mirror events: ' + JSON.stringify(await mirror.evaluate(() => window._ev)));

    // ════════════════════════════════════════════════════════════════════════
    // TEST 3 — Typing is mirrored
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n── Test 3: Input mirroring');
    await source.click('#input');
    await source.type('#input', 'hello', { delay: 60 });
    await wait(500);
    const v1 = await source.evaluate(() => document.getElementById('input').value);
    const v2 = await mirror.evaluate(() => document.getElementById('input').value);
    log('source="' + v1 + '"  mirror="' + v2 + '"');
    v2 === v1 && v1.length > 0
      ? pass('Input mirrored: "' + v2 + '"')
      : fail('Input not mirrored. source="' + v1 + '" mirror="' + v2 + '"');

    // ════════════════════════════════════════════════════════════════════════
    // TEST 4 — Scroll is mirrored
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n── Test 4: Scroll mirroring');
    await source.evaluate(() =>
      document.getElementById('scrollable').scrollTo({ top: 150, behavior: 'instant' })
    );
    await wait(600);
    const scrollMirror = await mirror.evaluate(() => document.getElementById('scrollable').scrollTop);
    Math.abs(scrollMirror - 150) < 15
      ? pass('Scroll mirrored: scrollTop=' + scrollMirror)
      : fail('Scroll not mirrored. Mirror scrollTop=' + scrollMirror);

    // ════════════════════════════════════════════════════════════════════════
    // TEST 5 — Navigation resilience: mirroring survives source tab redirect
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n── Test 5: Navigation resilience');
    await source.goto(BASE + '/?tab=source&v=2');
    await source.waitForLoadState('domcontentloaded');
    await wait(900);  // onUpdated fires → BECOME_SOURCE re-sent

    const navClicksBefore = await mirror.evaluate(() => window._ev.filter(e => e.startsWith('click')).length);
    await source.click('#btn');
    await wait(500);
    const navClicksAfter = await mirror.evaluate(() => window._ev.filter(e => e.startsWith('click')).length);
    navClicksAfter > navClicksBefore
      ? pass('Mirroring survived source tab navigation')
      : fail('Mirroring stopped after source navigated');

    // ════════════════════════════════════════════════════════════════════════
    // TEST 6 — Popup shows "Mirroring active" after navigation
    // Open popup in a separate page (state check only — no tab query needed)
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n── Test 6: Popup state after navigation');
    const popupCheck = await context.newPage();
    await popupCheck.goto(POPUP_URL);
    await popupCheck.waitForLoadState('domcontentloaded');
    await wait(500);
    const isActive = await popupCheck.evaluate(
      () => document.getElementById('status')?.classList.contains('status--active')
    );
    isActive
      ? pass('Popup shows "Mirroring active" after source navigated')
      : fail('Popup shows "Not mirroring" after navigation — state was lost');

    // ════════════════════════════════════════════════════════════════════════
    // TEST 7 — "Stop Mirroring" button stops forwarding
    // Reuse the popup page from test 6 (still open, still shows active)
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n── Test 7: Stop Mirroring button');
    const stopVisible = await popupCheck.evaluate(
      () => !document.getElementById('btn-stop')?.classList.contains('hidden')
    );
    if (!stopVisible) {
      fail('Stop button not visible (popup not in active state)');
    } else {
      await popupCheck.click('#btn-stop');
      await wait(400);

      const evBefore = await mirror.evaluate(() => window._ev.length);
      await source.click('#btn');
      await wait(400);
      const evAfter = await mirror.evaluate(() => window._ev.length);
      evAfter === evBefore
        ? pass('Stop Mirroring — no events forwarded after stop')
        : fail('Events still forwarded after Stop Mirroring');
    }
    await popupCheck.close();

    log('\nHolding browser open 3 s for visual inspection…');
    await wait(3000);

  } catch (err) {
    fail('Uncaught: ' + err.message);
    console.error(err);
  } finally {
    server.close();
    if (context) await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n\x1b[1m══════════════════════════════════\x1b[0m');
  console.log('\x1b[1m  RESULTS\x1b[0m');
  console.log('\x1b[1m══════════════════════════════════\x1b[0m');
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  results.forEach(r => console.log(`  ${r.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${r.msg}`));
  console.log('──────────────────────────────────');
  console.log(`  ${passed} passed  ${failed} failed`);
  console.log('\x1b[1m══════════════════════════════════\x1b[0m\n');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
