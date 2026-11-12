// B3 fit check: every screen at several viewports. Reports panels that need scrolling (outside an allowed inner list)
// and primary buttons that are off-screen. Usage: node tests/fit.mjs [shots]  (shots -> /tmp/fit_<screen>_<w>.png)
import { open } from './harness.mjs';
const SHOTS = process.argv[2] === 'shots';
const SIZES = [[1024, 640], [1280, 720], [1366, 768], [1920, 1080]];
const SCREENS = {
  menu: [() => window.__frontline.ui.showScreen('menu'), '#deploy'],
  menuGorge: [() => { const L = window.__frontline.G.profile.lobby; L.map = 'gorge'; L.mode = 'ffa'; window.__frontline.ui.showScreen('menu'); document.querySelector('#mapSel [data-v=gorge]').click(); }, '#deploy'],
  loadout: [() => window.__frontline.ui.showLoadout(true), '#loadoutDone'],
  settings: [() => document.getElementById('openSettings').click(), null],
  streaks: [() => document.getElementById('openStreaks').click(), '#streaksDone'],
  career: [() => document.getElementById('openCareer').click(), '#careerDone'],
  controls: [() => document.getElementById('openControls').click(), null],
  armory: [() => { const F = window.__frontline; F.input.freeLook = true; F.deploy({ mode: 'sandbox', map: 'yard', difficulty: 'normal', count: 0 }); window.__step(3); F.ui.showArmory(); }, '#armClose'],
  mp: [() => { window.__NET_OPTS = { nobroker: true }; window.__frontline.openMp(); document.getElementById('mpHost').click(); document.querySelector('.mp-manual').open = true; }, '#mpStart'],
  pause: [() => { window.__frontline.ui.showPause(true); }, '#resume'],
  end: [() => { const F = window.__frontline; F.input.freeLook = true; F.deploy({ mode: 'ffa', map: 'yard', difficulty: 'normal', count: 5 }); window.__step(3); F.endMatch('time'); }, '#again'],
};
const { browser, page, errors } = await open({ w: 1280, h: 720 });
const bad = [];
for (const [w, h] of SIZES) {
  await page.setViewportSize({ width: w, height: h });
  for (const [name, [fn, btn]] of Object.entries(SCREENS)) {
    await page.evaluate(() => window.__frontline.ui.showScreen('menu'));
    await page.evaluate(fn); await page.waitForTimeout(60);
    const r = await page.evaluate(([name, btn]) => {
      const sec = document.getElementById(name === 'menuGorge' ? 'menu' : name); if (!sec || sec.classList.contains('hidden')) return { skip: true };
      const out = { scrollers: [] };
      for (const el of sec.querySelectorAll('*')) {
        const cs = getComputedStyle(el);
        if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 2) (el.classList.contains('scroll-list') ? (out.lists = (out.lists || 0) + 1) : 0, el.classList.contains('scroll-list') ? 0 : out.scrollers.push((el.id || el.className || el.tagName).toString().slice(0, 24) + ' +' + (el.scrollHeight - el.clientHeight)));
      }
      const doc = document.documentElement; out.page = doc.scrollHeight > innerHeight + 1 || doc.scrollWidth > innerWidth + 1;
      const pr = (sec.querySelector('.panel') || sec.firstElementChild).getBoundingClientRect(); out.panelOut = pr.bottom > innerHeight + 1 || pr.top < -1;
      if (btn) { const b = document.querySelector(btn).getBoundingClientRect(); out.btnVisible = b.top >= 0 && b.bottom <= innerHeight && b.height > 0; }
      return out;
    }, [name, btn]);
    const issues0 = [];
    if (r.skip) { bad.push(`${w}x${h} ${name}: not shown`); continue; }
    // a list marked .scroll-list may scroll (one per screen); at 1024x640 the panel body may scroll instead
    const allowed = w < 1280 ? 1 - (r.lists || 0) : 0;
    if ((r.lists || 0) > 1) issues0.push('more than one scrolling list');
    const issues = issues0;
    if (r.page) issues.push('page scrolls');
    if (r.panelOut) issues.push('panel off-screen');
    if (r.scrollers.length > allowed) issues.push('scroll: ' + r.scrollers.join(', '));
    if (r.btnVisible === false) issues.push('button hidden');
    if (issues.length) bad.push(`${w}x${h} ${name}: ${issues.join('; ')}`);
    if (SHOTS) await page.screenshot({ path: `/tmp/fit_${name}_${w}.png` });
    if (name === 'armory' || name === 'pause' || name === 'end') await page.evaluate(() => { const G = window.__frontline.G; G.state = 'menu'; });
  }
}
console.log(bad.length ? bad.join('\n') : 'ALL SCREENS FIT'); console.log('ERRORS', errors.length, errors.slice(0, 3));
process.exitCode = !bad.length && !errors.length ? 0 : 1; // exit non-zero on FAIL
await browser.close();
