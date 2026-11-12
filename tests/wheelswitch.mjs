// Rev 5: the mouse wheel only switches weapons when Settings > "Mouse wheel switches weapons" is on (default off).
// Scoped zoom on the wheel (tests/scope.mjs) is unaffected.
import { open } from './harness.mjs';
const { browser, page, errors } = await open({ w: 1280, h: 720 });
const r = await page.evaluate(() => {
  const F = window.__frontline, G = F.G, o = {}; F.input.freeLook = true;
  o.default = G.profile.settings.wheelSwitch;
  document.getElementById('openSettings').click(); window.__step(2);
  const t = document.getElementById('set_wheelSwitch'); o.toggle = !!t && !t.checked;
  document.querySelector('#settings [data-back], #settings .back, #settingsBack')?.click(); F.ui.showScreen('menu');
  F.deploy({ mode: 'ffa', map: 'yard', skill: 5, count: 1 }); window.__step(200);
  const wheel = () => { document.querySelector('canvas').dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true })); window.__step(60); return G.player.slot; };
  const start = G.player.slot;
  o.offMoved = wheel() !== start;
  G.profile.settings.wheelSwitch = true;
  o.onMoved = wheel() !== start;
  return o;
});
const ok = r.default === false && r.toggle && !r.offMoved && r.onMoved;
console.log(JSON.stringify(r), ok && !errors.length ? 'PASS wheelswitch' : 'FAIL wheelswitch', errors.slice(0, 3));
process.exitCode = ok && !errors.length ? 0 : 1; // exit non-zero on FAIL
await browser.close();
