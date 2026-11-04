// Cascade Gorge cliff routes, screenshots: /tmp/gorge_right.png (stairs + chutes), /tmp/gorge_left.png (ledges, bushes, berms)
import { shotSession } from './shot.mjs';
const s = await shotSession();
await s.prep({ mode: 'sandbox', map: 'gorge', skill: 5, count: 0 }, 60);
await s.page.evaluate(() => { const G = window.__frontline.G; G.state = 'paused'; document.getElementById('pause').classList.add('hidden'); document.getElementById('hud').style.visibility = 'hidden'; });
await s.shot('/tmp/gorge_right.png', () => { const c = window.__frontline.G.camera; c.position.set(-3, 5.5, 8); c.lookAt(-20, 3, 17); });
await s.shot('/tmp/gorge_left.png', () => { const c = window.__frontline.G.camera; c.position.set(-5, 3, -5); c.lookAt(-20, 2.5, -15); });
console.log('ERRORS', s.errors.length, s.errors.slice(0, 3)); await s.browser.close();
