// Loadout screen screenshots: gun tab and operator tab (/tmp/lo_<tab>_<w>.png). node tests/loshot.mjs [w] [h]
import { open } from './harness.mjs';
const w = +process.argv[2] || 1280, h = +process.argv[3] || 720;
const { browser, page, errors } = await open({ w, h });
await page.evaluate(() => window.__step(3));
for (const tab of (process.env.TABS || 'g0,vest,op').split(',')) {
  if (process.env.OP) await page.evaluate((op) => { window.__frontline.G.profile.skin.op = op; }, process.env.OP);
  await page.evaluate((tab) => { window.__frontline.ui.showLoadout(false, tab); window.__step(6); }, tab);
  await page.screenshot({ path: `/tmp/lo_${tab}_${w}.png` });
}
console.log('ERRORS', errors.slice(0, 3)); await browser.close();
