import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire('/home/claude/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');
const THREE = fs.readFileSync(path.join(HERE, 'three.min.js'), 'utf8'); // created by tests/setup.sh
const STUB = `
;(function(){var P=THREE.WebGLRenderer.prototype;P.render=function(s,c){s.updateMatrixWorld();if(c&&c.parent===null)c.updateMatrixWorld();};})();`;
const STEP = `
window.__rafq=[];window.__t=0;
window.requestAnimationFrame=function(f){window.__rafq.push(f);return window.__rafq.length;};
window.__step=function(n,dtms){dtms=dtms||16.6667;for(let i=0;i<n;i++){window.__t+=dtms;const q=window.__rafq;window.__rafq=[];for(const f of q)f(window.__t);}};
`;
export async function open({ stub = true, w = 1280, h = 720, html = path.join(HERE, '../dist-standalone/frontline_solo_ops.html') } = {}) {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  page.on('request', (q) => { if (!q.url().startsWith('http://game.local/') && !q.url().startsWith('data:') && !q.url().startsWith('blob:')) errors.push('EXTERNAL REQUEST ' + q.url()); });
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERR ' + e.message + ' ' + (e.stack||'').split('\n').slice(0,3).join(' | ')));
  await page.route('**/three.min.js', r => r.fulfill({ contentType: 'application/javascript', body: THREE + (stub ? STUB : '') }));
  await page.route('**/fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('**/fonts.gstatic.com/**', r => r.abort());
  await page.route('http://game.local/', r => r.fulfill({ contentType: 'text/html', body: fs.readFileSync(html, 'utf8') }));
  await page.addInitScript(STEP);
  await page.goto('http://game.local/');
  await page.waitForFunction(() => window.__frontline, null, { timeout: 30000 });
  if (stub) await page.evaluate(() => { const r = window.__frontline.G.renderer; r.__orig = { render: r.render, clear: r.clear, clearDepth: r.clearDepth }; r.clear = () => {}; r.clearDepth = () => {}; r.render = (s, c) => { s.updateMatrixWorld(); if (c && !c.parent) c.updateMatrixWorld(); }; });
  return { browser, page, errors };
}
