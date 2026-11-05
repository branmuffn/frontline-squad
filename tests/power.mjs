// B0: quality presets, migration to Balanced, low-power menus (30 fps), perf readout, settings UI.
import { open } from './harness.mjs';
const { browser, page, errors } = await open({ stub: true, w: 1280, h: 720 });
const out = {};
out.defaults = await page.evaluate(() => { const s = window.__frontline.G.profile.settings; return [s.quality, s.fpsCap, s.pixelMax, s.shadowQ, s.shadowRate, s.lowMenus]; });
// migration: an old profile (Display cap, no qv) moves to Balanced once; an old 'shadows off' keeps shadows off
await page.evaluate(() => localStorage.setItem('frontline_solo_ops_v2', JSON.stringify({ settings: { fpsCap: 0, shadows: true, volume: 0.3 }, xp: 5000 })));
await page.reload(); await page.waitForFunction(() => window.__frontline);
out.migrated = await page.evaluate(() => { const p = window.__frontline.G.profile, s = p.settings; return [s.quality, s.fpsCap, s.volume, p.xp, s.qv]; });
// menu frame rate: count renders over 60 steps (1 s at 60 Hz)
const count = (low) => page.evaluate(async (low) => {
  const G = window.__frontline.G; G.profile.settings.lowMenus = low; let n = 0; const r = G.renderer.render; G.renderer.render = function () { n++; return r.apply(this, arguments); };
  window.__step(60); G.renderer.render = r; return n;
}, low);
out.menuRendersLow = await count(true); out.menuRendersFull = await count(false);
// settings UI: presets and custom
await page.evaluate(() => { document.getElementById('openSettings').click(); });
const pick = (sel, v) => page.evaluate(([sel, v]) => { document.querySelector(`#${sel} button[data-v="${v}"]`).click(); const s = window.__frontline.G.profile.settings; return [s.quality, s.fpsCap, s.pixelMax, s.shadowQ, s.shadowRate, s.particles, s.renderScale]; }, [sel, v]);
out.max = await pick('qualSel', 'max'); out.fps120 = await pick('fpsSel', '120'); out.battery = await pick('qualSel', 'battery'); out.balanced = await pick('qualSel', 'balanced');
out.shadowLow = await pick('shadowSel', 'low');
out.mapSize = await page.evaluate(() => window.__frontline.G.world.sun.shadow.mapSize.x);
await pick('qualSel', 'balanced');
await page.evaluate(() => { const G = window.__frontline.G; G.profile.settings.showFps = true; });
await page.screenshot({ path: '/tmp/settings_b0.png' });
out.readout = await page.evaluate(() => { const G = window.__frontline.G; window.__step(40); return document.getElementById('fps').textContent; });
console.log(JSON.stringify(out), errors.slice(0, 5));
const ok = out.defaults.join() === 'balanced,60,1.25,high,half,true' && out.migrated[0] === 'balanced' && out.migrated[1] === 60 && out.migrated[3] === 5000
  && out.menuRendersLow <= 32 && out.menuRendersFull >= 58 && out.max[0] === 'max' && out.max[1] === 0 && out.fps120[0] === 'custom' && out.battery[3] === 'low'
  && out.shadowLow[0] === 'custom' && out.mapSize === 1024 && /draws/.test(out.readout) && !errors.length;
console.log(ok ? 'PASS power' : 'FAIL power');
await browser.close();
