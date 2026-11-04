// Screenshots of menu screens for visual review: node tests/uishot.mjs [w] [h] -> /tmp/ui_*.png
import { open } from './harness.mjs';
const w = +process.argv[2] || 1280, h = +process.argv[3] || 720;
const { browser, page, errors } = await open({ w, h });
await page.evaluate(() => window.__step(5));
await page.evaluate(() => document.getElementById('botRulesBtn').click());
await page.screenshot({ path: `/tmp/ui_menu_${w}.png` });
await page.evaluate(() => { const F = window.__frontline; F.net.hostOpen('ALPHA', { mode: 'tdm', map: 'yard', skill: 6, count: 0, sameTeam: false, bots: {} }); F.openMp(); });
await page.evaluate(() => { document.querySelector('#mp .panel').dataset.state = 'host'; document.getElementById('mpRoomCode').textContent = 'K7QXP'; });
await page.evaluate(() => window.__step(2));
await page.screenshot({ path: `/tmp/ui_mp_${w}.png` });
console.log('errors', errors); await browser.close();
