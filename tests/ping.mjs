// Pings: H on an enemy / on the ground / double-tap; marker + chat line; MP relay is covered by mpvote.mjs.
import { open } from './harness.mjs';
const { browser, page, errors } = await open({ w: 640, h: 400 });
const r = await page.evaluate(() => {
  const F = window.__frontline, G = F.G, o = {}; F.input.freeLook = true;
  F.deploy({ mode: 'tdm', map: 'yard', skill: 5, count: 3 }); window.__step(240);
  const key = (c) => { window.dispatchEvent(new KeyboardEvent('keydown', { code: c })); window.dispatchEvent(new KeyboardEvent('keyup', { code: c })); };
  const P = G.player, e = G.bots.find((b) => b.team !== P.team && b.alive); e.x = P.x; e.z = P.z - 10; e.y = P.y; e.brain.target = null; G.match.rules = { passive: true };
  P.yaw = 0; P.pitch = 0; window.__step(2); key('KeyH'); window.__step(2);
  o.n1 = G.scene.children.filter((c) => c.isSprite && c.renderOrder === 20).length; o.chat1 = document.querySelector('#chatLog') ? document.querySelector('#chatLog').textContent.slice(-80) : '';
  e.x = P.x + 40; P.pitch = -0.4; window.__step(30); key('KeyH'); window.__step(5); key('KeyH'); window.__step(2);
  o.n2 = G.scene.children.filter((c) => c.isSprite && c.renderOrder === 20).length;
  window.__step(500); o.n3 = G.scene.children.filter((c) => c.isSprite && c.renderOrder === 20).length;
  o.log = [...document.querySelectorAll('.cl')].map((x) => x.textContent).slice(-3);
  return o;
});
const ok = r.n1 === 1 && r.n2 === 2 && r.n3 === 0 && r.log.join(' ').includes('Enemy spotted') && r.log.join(' ').includes('Danger');
console.log(JSON.stringify(r), ok && !errors.length ? 'PASS ping' : 'FAIL ping', errors.slice(0, 3));
await browser.close();
