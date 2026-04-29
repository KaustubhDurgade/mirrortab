const { chromium } = require('playwright');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');

const EXT_PATH = path.resolve(__dirname);

// ── Test page served locally so <all_urls> content script injection fires ──
const TEST_HTML = `<!DOCTYPE html>
<html>
<head><title>Mirror Test</title><style>
  body { font-family: sans-serif; padding: 20px; }
  #log { margin-top:16px; padding:10px; background:#f5f5f5; min-height:60px; font-size:12px; }
  #log p { margin:2px 0; }
  #scrollable { height:100px; overflow:auto; border:1px solid #ccc; margin-top:8px; }
  .inner { height:400px; padding:10px; }
</style></head>
<body>
  <h2>Mirror Test Page</h2>
  <button id="btn">Click Me</button>
  <input id="input" type="text" placeholder="Type here…" style="margin-left:8px;padding:4px;width:200px" />
  <div id="scrollable"><div class="inner">Scrollable content…</div></div>
  <div id="log"></div>
  <script>
    window._events = [];
    const logEl = document.getElementById('log');
    function record(msg) {
      window._events.push(msg);
      const p = document.createElement('p');
      p.textContent = new Date().toISOString().slice(11,23) + ' ' + msg;
      logEl.prepend(p);
    }
    document.addEventListener('click', e => record('click:' + (e.target.id || e.target.tagName)), true);
    document.getElementById('input').addEventListener('input', e => record('input:' + e.target.value));
    document.addEventListener('keydown', e => record('keydown:' + e.key), true);
    document.getElementById('scrollable').addEventListener('scroll', e => record('scroll:' + e.target.scrollTop));
    window.addEventListener('scroll', () => record('winscroll:' + window.scrollY));
  </script>
</body>
</html>`;

// ── Helpers ─────────────────────────────────────────────────────────────────
const results = [];
function log(msg)  { console.log('  ' + msg); }
function pass(msg) { console.log('  ✓ PASS  ' + msg); results.push({ ok: true,  msg }); }
function fail(msg) { console.log('  ✗ FAIL  ' + msg); results.push({ ok: false, msg }); }

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  // ── Start local HTTP server ────────────────────────────────────────────
  const server = http.createServer((_, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(TEST_HTML);
  });
  await new Promise(r => server.listen(9988, '127.0.0.1', r));
  log('Test server: http://localhost:9988');

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mirrortab-'));

  let context;
  try {
    // ── Launch Chromium with extension ────────────────────────────────────
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${EXT_PATH}`,
        `--load-extension=${EXT_PATH}`,
      ],
      viewport: { width: 1280, height: 720 },
    });
    log('Browser launched with extension from ' + EXT_PATH);

    // ── Grab service worker ───────────────────────────────────────────────
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      log('Waiting for service worker…');
      sw = await context.waitForEvent('serviceworker', { timeout: 20000 });
    }
    log('Service worker: ' + sw.url());
    await wait(1200); // let SW fully initialize

    // ── Open two test tabs (use distinct query strings to identify them) ──
    const page1 = context.pages()[0];
    await page1.goto('http://localhost:9988/?tab=source');
    await page1.waitForLoadState('domcontentloaded');

    const page2 = await context.newPage();
    await page2.goto('http://localhost:9988/?tab=mirror');
    await page2.waitForLoadState('domcontentloaded');

    log('Tabs open: source=' + page1.url() + '  mirror=' + page2.url());
    await wait(600); // content scripts need a moment to inject

    // ── Resolve tab IDs via the service worker ────────────────────────────
    const [srcTabArr, mirTabArr] = await Promise.all([
      sw.evaluate(() => chrome.tabs.query({ url: 'http://localhost:9988/?tab=source' })),
      sw.evaluate(() => chrome.tabs.query({ url: 'http://localhost:9988/?tab=mirror' })),
    ]);

    if (!srcTabArr.length || !mirTabArr.length) {
      fail('Could not resolve tab IDs. srcTabArr=' + JSON.stringify(srcTabArr));
      return;
    }
    const sourceTabId = srcTabArr[0].id;
    const mirrorTabId = mirTabArr[0].id;
    log(`Tab IDs — source:${sourceTabId}  mirror:${mirrorTabId}`);

    // ── Activate mirroring via service worker (same as SET_SOURCE handler) ─
    await sw.evaluate(async (srcId) => {
      await chrome.storage.session.set({ sourceTabId: srcId });
      await chrome.tabs.sendMessage(srcId, { type: 'BECOME_SOURCE' });
    }, sourceTabId);
    log('Source configured');
    await wait(400);

    // ════════════════════════════════════════════════════════════════════════
    // TEST 1: Click mirroring
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n── Test 1: Click mirroring');
    const clicksBefore = await page2.evaluate(() => window._events.filter(e => e.startsWith('click')).length);
    await page1.click('#btn');
    await wait(600);
    const clicksAfter = await page2.evaluate(() => window._events.filter(e => e.startsWith('click')).length);

    if (clicksAfter > clicksBefore) {
      pass('Click on source was replayed on mirror tab');
    } else {
      const allEvents = await page2.evaluate(() => window._events);
      fail('Click not replayed on mirror. Mirror events: ' + JSON.stringify(allEvents));
    }

    // ════════════════════════════════════════════════════════════════════════
    // TEST 2: Input / typing mirroring
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n── Test 2: Input mirroring');
    await page1.click('#input');
    await page1.type('#input', 'hello', { delay: 60 });
    await wait(600);

    const val1 = await page1.evaluate(() => document.getElementById('input').value);
    const val2 = await page2.evaluate(() => document.getElementById('input').value);
    log('Source value: "' + val1 + '"  Mirror value: "' + val2 + '"');

    if (val2.length > 0 && val2 === val1) {
      pass('Input mirrored correctly: "' + val2 + '"');
    } else {
      fail('Input not mirrored. Source="' + val1 + '" Mirror="' + val2 + '"');
    }

    // ════════════════════════════════════════════════════════════════════════
    // TEST 3: Scroll mirroring (nested scrollable div)
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n── Test 3: Scroll mirroring (nested div)');
    const scrollBefore = await page2.evaluate(() => document.getElementById('scrollable').scrollTop);
    await page1.evaluate(() => { document.getElementById('scrollable').scrollTo({ top: 200, behavior: 'instant' }); });
    await wait(700);
    const scrollAfter = await page2.evaluate(() => document.getElementById('scrollable').scrollTop);
    log('Mirror scrollable.scrollTop before=' + scrollBefore + ' after=' + scrollAfter);

    if (scrollAfter > scrollBefore && Math.abs(scrollAfter - 200) < 10) {
      pass('Scroll mirrored: scrollTop=' + scrollAfter);
    } else {
      fail('Scroll not mirrored. Before=' + scrollBefore + ' After=' + scrollAfter);
    }

    // ════════════════════════════════════════════════════════════════════════
    // TEST 4: Keyboard mirroring
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n── Test 4: Keyboard mirroring');
    await page1.focus('#input');
    const keysBefore = await page2.evaluate(() => window._events.filter(e => e.startsWith('keydown')).length);
    await page1.keyboard.press('ArrowRight');
    await wait(500);
    const keysAfter = await page2.evaluate(() => window._events.filter(e => e.startsWith('keydown')).length);

    if (keysAfter > keysBefore) {
      const lastKey = await page2.evaluate(() => window._events.filter(e => e.startsWith('keydown')).slice(-1)[0]);
      pass('Keydown mirrored: ' + lastKey);
    } else {
      fail('Keydown not mirrored on mirror tab');
    }

    // ════════════════════════════════════════════════════════════════════════
    // TEST 5: Tab exclusion — deselect mirror tab, verify no events forwarded
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n── Test 5: Tab exclusion');
    // Exclude the mirror tab (send empty array — no targets)
    await sw.evaluate(() => chrome.storage.session.set({ mirrorTabIds: [] }));
    await wait(200);

    const evBefore = await page2.evaluate(() => window._events.length);
    await page1.click('#btn');
    await wait(500);
    const evAfter = await page2.evaluate(() => window._events.length);

    if (evAfter === evBefore) {
      pass('Exclusion works — mirror received no events when excluded');
    } else {
      fail('Exclusion failed — mirror got ' + (evAfter - evBefore) + ' new events despite being excluded');
    }

    // Re-enable (null = all tabs)
    await sw.evaluate(() => chrome.storage.session.set({ mirrorTabIds: null }));
    await wait(200);

    // Confirm re-enable works
    const evReenableBefore = await page2.evaluate(() => window._events.length);
    await page1.click('#btn');
    await wait(500);
    const evReenableAfter = await page2.evaluate(() => window._events.length);
    if (evReenableAfter > evReenableBefore) {
      pass('Re-enabled mirroring works correctly');
    } else {
      fail('Re-enable failed — no events after re-enabling');
    }

    // ── Brief visual hold so you can see the browser state ───────────────
    log('\nKeeping browser open for 4 seconds for visual inspection…');
    await wait(4000);

  } catch (err) {
    fail('Uncaught exception: ' + err.message);
    console.error(err);
  } finally {
    server.close();
    if (context) await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════');
  console.log('  RESULTS');
  console.log('═══════════════════════════════');
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  results.forEach(r => console.log(`  ${r.ok ? '✓' : '✗'} ${r.msg}`));
  console.log('───────────────────────────────');
  console.log(`  ${passed} passed  ${failed} failed`);
  console.log('═══════════════════════════════\n');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
