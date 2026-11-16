// Graphics on every device (Brian, 2026-11-16): a phone dropping the 3D graphics mid-match pauses solo play, offers a
// reload after 3 s, and play carries on when they come back; a browser with no 3D at all gets a plain-language message.
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { open } from './harness.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const fails = [];
const check = (name, ok, info) => { if (!ok) fails.push(name + (info !== undefined ? ' ' + JSON.stringify(info) : '')); };

// ---- lost mid-match, then restored ----
{
  const { browser, page, errors } = await open({ w: 1280, h: 720 });
  await page.evaluate(() => { const F = window.__frontline; F.input.freeLook = true; F.deploy({ mode: 'tdm', map: 'yard', skill: 3, count: 2 }); window.__step(240); });
  // the signal a phone sends when it takes the graphics away (and gives them back); the test browser has no switch for it
  const sig = (type) => page.evaluate((type) => window.__frontline.G.renderer.domElement.dispatchEvent(new Event(type, { cancelable: true })), type);
  // the test browser hands the graphics straight back (the quick, good case); hold that back to test a long loss
  await page.evaluate(() => { window.__hold = true; window.addEventListener('webglcontextrestored', (e) => { if (window.__hold) e.stopPropagation(); }, true); });
  await sig('webglcontextlost');
  await page.waitForTimeout(300);
  const a = await page.evaluate(() => ({ st: window.__frontline.G.state, box: !!document.getElementById('glLost') }));
  check('lost: solo play pauses at once, no prompt yet', a.st === 'paused' && !a.box, a);
  await page.waitForTimeout(3200);
  const b = await page.evaluate(() => { const el = document.getElementById('glLost'); return { shown: !!el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none', text: el && el.textContent }; });
  check('still lost after 3 s: Reload prompt', b.shown && /Reload/.test(b.text), b);
  await page.evaluate(() => { window.__hold = false; }); await sig('webglcontextrestored');
  await page.waitForTimeout(500);
  const c = await page.evaluate(() => { const el = document.getElementById('glLost'); window.__frontline.G.state === 'paused' && document.getElementById('resume').click(); window.__step(60); return { hidden: el.classList.contains('hidden'), lost: !!window.__frontline.G.glLost, st: window.__frontline.G.state }; });
  check('back: prompt hides, play resumes', c.hidden && !c.lost && c.st === 'playing', c);
  check('no page errors', !errors.filter((e) => !/CONTEXT_LOST|context lost/i.test(e)).length, errors.slice(0, 3));
  await browser.close();
}

// ---- no 3D at all ----
{
  const require = createRequire(import.meta.url);
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, o) { return /webgl/.test(t) ? null : g.call(this, t, o); }; });
  await page.route('**/three.min.js', (r) => r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(HERE, 'three.min.js'), 'utf8') }));
  await page.route('**/fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('**/fonts.gstatic.com/**', (r) => r.abort());
  await page.route('http://game.local/', (r) => r.fulfill({ contentType: 'text/html', body: fs.readFileSync(path.join(HERE, '../dist-standalone/frontline_solo_ops.html'), 'utf8') }));
  await page.goto('http://game.local/');
  await page.waitForTimeout(1500);
  const t = await page.evaluate(() => document.querySelector('#loader .load-msg').textContent);
  check('no 3D: plain message with steps', /couldn’t start 3D graphics/.test(t) && /hardware acceleration/.test(t), t);
  await browser.close();
}

console.log(fails.length ? 'failed: ' + fails.join(' | ') : '', fails.length ? 'FAIL graphics' : 'PASS graphics');
process.exitCode = fails.length ? 1 : 0;
