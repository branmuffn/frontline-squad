// Main-menu map previews fill their square (Brian, 2026-11-15: Harbour, Cascade Gorge and Snowbound Radar Base left
// blank bands; he picked C "half and half"). For every map tile, the drawn map (anything brighter than the background)
// must reach close to all four edges of its canvas, and canvases are 160 px for sharp tiles.
import { open } from './harness.mjs';
const { browser, page, errors } = await open({ w: 1366, h: 768 });
await page.evaluate(() => window.__step(5));
const res = await page.evaluate(() => [...document.querySelectorAll('#mapSel > button')].filter((b) => b.dataset.v !== 'custom').map((b) => {
  const c = b.querySelector('canvas'), S = c.width, d = c.getContext('2d').getImageData(0, 0, S, S).data;
  const bg = [d[0], d[1], d[2]]; let x0 = S, x1 = -1, y0 = S, y1 = -1;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4; if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) < 24) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { id: b.dataset.v, S, w: (x1 - x0 + 1) / S, h: (y1 - y0 + 1) / S };
}));
const bad = res.filter((r) => r.S !== 160 || r.w < 0.85 || r.h < 0.85);
console.log(res.map((r) => `${r.id} ${r.S}px fills ${(r.w * 100).toFixed(0)}% x ${(r.h * 100).toFixed(0)}%`).join('\n'));
console.log(bad.length || errors.length ? 'FAIL ' + JSON.stringify({ bad, errors }) : 'PASS map previews fill their square');
await browser.close();
process.exit(bad.length || errors.length ? 1 : 0);
