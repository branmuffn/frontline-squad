// Loadout screen must not grow frame after frame (the preview canvas used to push the page down forever).
import { open } from './harness.mjs';
const { browser, page, errors } = await open({ w: 1280, h: 720 });
const r = await page.evaluate(() => {
  const F = window.__frontline, out = [];
  for (const pre of [false, true]) { F.ui.showLoadout(pre); window.__step(5); const a = document.getElementById('loPreview').getBoundingClientRect().height; window.__step(240); const b = document.getElementById('loPreview').getBoundingClientRect().height; out.push([Math.round(a), Math.round(b), document.documentElement.scrollHeight <= innerHeight + 1, document.getElementById('loadoutDone').getBoundingClientRect().bottom <= innerHeight]); }
  return out;
});
const ok = r.every(([a, b, fit, btn]) => Math.abs(a - b) < 2 && fit && btn);
console.log(JSON.stringify(r), ok ? 'ALL OK' : 'FAILED', 'ERRORS', errors.slice(0, 3));
process.exitCode = ok && !errors.length ? 0 : 1; // exit non-zero on FAIL
await browser.close();
