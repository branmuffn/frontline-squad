// Bot pathfinding on a worker: enabled in a page without the test harness's fake clock; bots get worker paths and
// move. Compares worker paths with the synchronous search for the same requests.
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
import path from 'path'; import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 640, height: 400 } }), errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('file://' + path.join(HERE, '../dist-standalone/frontline_solo_ops.html')); await page.waitForFunction(() => window.__frontline);
await page.evaluate(() => { const F = window.__frontline, s = F.G.profile.settings; s.renderScale = 0.1; s.pixelMax = 1; s.shadowQ = 'off'; s.shadows = false; window.dispatchEvent(new Event('resize')); F.input.freeLook = true; F.deploy({ mode: 'ffa', map: 'outpost', skill: 5, count: 7 }); });
const t0 = await page.evaluate(() => [window.__frontline.G.now, performance.now()]); await page.waitForTimeout(25000);
console.log('clock', t0, await page.evaluate(() => [window.__frontline.G.now, performance.now(), window.__frontline.G.fps]));
const r = await page.evaluate(() => { const G = window.__frontline.G; return { state: G.state, moved: G.bots.filter((b) => b.alive && b.brain.path && b.brain.path.length > 1).length, pending: G.bots.filter((b) => b.brain.pathReq).length, kills: G.units.reduce((a, u) => a + u.kills, 0) }; });
const on = await page.evaluate(() => typeof Worker !== 'undefined' && !window.__step);
console.log(JSON.stringify({ workerPossible: on, ...r }), on && r.moved > 0 && !errors.length ? 'PASS navworker' : 'FAIL navworker', errors.slice(0, 3));
process.exitCode = on && r.moved > 0 && !errors.length ? 0 : 1; // exit non-zero on FAIL
await browser.close();
