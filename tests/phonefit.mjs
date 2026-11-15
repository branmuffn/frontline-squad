// Phone fit (Brian, 2026-11-15): every menu / loading screen at several phone sizes. Flags controls that bleed past the screen edge or
// are cut off by a clipping box, unless a scrolling list can bring them into view.
// Also: text cut short with "…", Back off screen, sideways page scroll. Usage: node tests/phonefit.mjs [shotDir|''] [WxH,WxH,...]
// Default sizes: Pixel 7 sideways full screen / with Chrome's bar / shorter, a 740x360 phone, an iPhone SE-size 667x320.
import { open } from './harness.mjs';
const SHOTS = process.argv[2];
const SIZES = (process.argv[3] || '915x412,915x356,915x330,740x360,667x320').split(',').map((s) => s.split('x').map(Number));
const STATES = {
  menu: () => { F.ui.showScreen('menu'); },
  menuRules: () => { F.ui.showScreen('menu'); document.getElementById('matchRulesBtn').click(); },
  menuBots: () => { F.ui.showScreen('menu'); document.getElementById('botRulesBtn').click(); },
  loadout: () => { document.getElementById('openLoadout').click(); },
  ...Object.fromEntries([0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => ['loadout_tab' + i, `() => { document.getElementById('openLoadout').click(); const b = document.querySelectorAll('#loTabs button')[${i}]; if (b) b.click(); }`])),
  prematch: () => { F.ui.showLoadout(true); },
  ...Object.fromEntries([0, 1, 2].map((i) => ['settings_tab' + i, `() => { document.getElementById('openSettings').click(); [...document.querySelectorAll('#setTabs button')].filter((b) => b.offsetParent)[${i}].click(); }`])),
  settingsXh: () => { document.getElementById('openSettings').click(); document.querySelector('#setTabs [data-tab="gameplay"]').click(); document.getElementById('xhEdit').click(); },
  streaks: () => { document.getElementById('openStreaks').click(); },
  career: () => { document.getElementById('openCareer').click(); },
  careerPaste: () => { document.getElementById('openCareer').click(); document.getElementById('pasteProfile').click(); },
  controls: () => { document.getElementById('openControls').click(); },
  mp: () => { window.__NET_OPTS = { nobroker: true }; F.openMp(); },
  mpHost: () => { window.__NET_OPTS = { nobroker: true }; F.openMp(); document.getElementById('mpHost').click(); },
  mpHostManual: () => { window.__NET_OPTS = { nobroker: true }; F.openMp(); document.getElementById('mpHost').click(); document.querySelector('.mp-manual').open = true; },
  pause: () => { F.deploy({ mode: 'ffa', map: 'yard', difficulty: 'normal', count: 3 }); window.__step(3); F.ui.showPause(false); },
  pauseSettings: () => { F.deploy({ mode: 'ffa', map: 'yard', difficulty: 'normal', count: 3 }); window.__step(3); F.ui.showPause(false); document.getElementById('pauseSettings').click(); },
  armory: () => { F.deploy({ mode: 'sandbox', map: 'yard', difficulty: 'normal', count: 0 }); window.__step(3); F.ui.showArmory(); },
  armoryRange: () => { F.deploy({ mode: 'range', map: 'range', difficulty: 'normal', count: 0 }); window.__step(3); F.ui.showArmory(); },
  endFfa: () => { F.deploy({ mode: 'ffa', map: 'yard', difficulty: 'normal', count: 7 }); window.__step(3); F.endMatch('time'); window.__step(400); },
  endTdm: () => { F.deploy({ mode: 'tdm', map: 'yard', difficulty: 'normal', count: 7 }); window.__step(3); F.endMatch('time'); window.__step(400); },
  endSurvival: () => { F.deploy({ mode: 'survival', map: 'yard', difficulty: 'normal', count: 0 }); window.__step(3); F.endMatch('time'); window.__step(400); },
};
const { browser, page, errors } = await open({ w: 915, h: 412, touch: true });
await page.evaluate(() => { window.F = window.__frontline; window.__step(5); Element.prototype.requestFullscreen = function () { return Promise.resolve(); }; });
const report = [];
for (const [w, h] of SIZES) {
  await page.setViewportSize({ width: w, height: h });
  for (const [name, fn] of Object.entries(STATES)) {
    await page.evaluate(() => { const G = F.G; if (G.state !== 'menu' && G.match) { try { F.endMatch && (G.state = 'menu'); } catch (e) {} } F.ui.showScreen('menu'); const x = document.getElementById('xhPop'); x && x.classList.add('hidden'); document.querySelectorAll('.bot-pop').forEach((p) => p.classList.add('hidden')); });
    await page.evaluate(`(${fn.toString()})()`); await page.evaluate(() => window.__step(3)); await page.waitForTimeout(40);
    const r = await page.evaluate(() => {
      const scr = [...document.querySelectorAll('.screen')].find((s) => !s.classList.contains('hidden'));
      if (!scr) return { skip: true };
      const W = innerWidth, H = innerHeight, out = [];
      const scrollsX = (el) => /(auto|scroll)/.test(getComputedStyle(el).overflowX) && el.scrollWidth > el.clientWidth + 1;
      const scrollsY = (el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1;
      const clips = (el) => { const cs = getComputedStyle(el); return /(hidden|clip)/.test(cs.overflowX + cs.overflowY) || cs.clipPath !== 'none'; };
      const sel = 'button, input, select, textarea, summary, [role=tab], label.toggle, .tile, .wcard, .lo-card, h2';
      for (const el of scr.querySelectorAll(sel)) {
        if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') continue;
        if (el.checkVisibility && !el.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true })) continue;
        const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
        let sx = false, sy = false, cut = null;
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          if (scrollsX(a)) sx = true; if (scrollsY(a)) sy = true;
          if (!sx && !sy) { const m = /calc\(100% - (\d+)px\) 0px/.exec(getComputedStyle(a).clipPath); if (m) { const ar = a.getBoundingClientRect(), c = +m[1]; if ((ar.right - r.right) + (r.top - ar.top) < c - 1 && r.right > ar.right - c) { cut = (a.id || a.className.split(' ')[0]) + ' corner'; break; } } }
          if (!sx && !sy && clips(a) && a !== el) { const ar = a.getBoundingClientRect(); if (r.right > ar.right + 1.5 || r.left < ar.left - 1.5 || r.bottom > ar.bottom + 1.5 || r.top < ar.top - 1.5) { cut = a.id || String(a.className).split(' ')[0] || a.tagName; break; } }
        }
        const id = (el.id || el.textContent.trim().slice(0, 18) || el.className).toString().replace(/\s+/g, ' ');
        if (!sx && (r.right > W + 1 || r.left < -1)) out.push(`${id}: past ${r.right > W ? 'right' : 'left'} edge by ${Math.round(r.right > W ? r.right - W : -r.left)}px`);
        else if (!sy && (r.bottom > H + 1 || r.top < -1)) out.push(`${id}: past ${r.bottom > H ? 'bottom' : 'top'} edge by ${Math.round(r.bottom > H ? r.bottom - H : -r.top)}px`);
        else if (cut) out.push(`${id}: cut off by ${cut}`);
      }
      for (const el of scr.querySelectorAll('*')) { const cs = getComputedStyle(el); if (cs.textOverflow === 'ellipsis' && el.offsetParent && el.scrollWidth > el.clientWidth + 1) out.push(`text cut short: "${el.textContent.trim().slice(0, 24)}"`); }
      const bk = scr.querySelector('.back-top'); if (bk && bk.offsetParent) { const b = bk.getBoundingClientRect(); if (b.top < -1 || b.bottom > H + 1) out.push('Back button not on screen'); }
      const doc = document.documentElement; if (doc.scrollWidth > W + 1) out.push('page scrolls sideways');
      return { screen: scr.id, out };
    });
    if (!r.skip && r.out.length) report.push(`${w}x${h} ${name}: ${[...new Set(r.out)].slice(0, 8).join(' | ')}${r.out.length > 8 ? ` (+${r.out.length - 8})` : ''}`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}_${w}x${h}.png` });
    await page.evaluate(() => { const G = F.G; if (G.state !== 'menu') { G.state = 'menu'; } });
  }
}
console.log(report.length ? report.join('\n') : 'ALL PHONE SCREENS FIT');
console.log('ERRORS', errors.length, errors.slice(0, 3));
process.exitCode = report.length || errors.length ? 1 : 0;
await browser.close();
