// Regenerates the README screenshots: node tests/readme-shots.mjs -> docs/screenshots/*.png
import { shotSession } from './shot.mjs';
const out = 'docs/screenshots';
const s = await shotSession();
await s.page.evaluate(() => window.__step(5));
await s.page.screenshot({ path: `${out}/menu.png` });
await s.prep({ mode: 'tdm', map: 'gorge', skill: 6, count: 7 }, 700);
await s.shot(`${out}/gorge-tdm.png`);
await s.prep({ mode: 'tdm', map: 'gorge', skill: 6, count: 7 }, 1400);
await s.shot(`${out}/gorge-tdm-2.png`);
console.log('errors', s.errors);
await s.browser.close();
