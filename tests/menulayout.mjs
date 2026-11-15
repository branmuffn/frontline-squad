// Menu layouts picked by Brian (2026-11-15): Main menu A on phones (two columns, no scrolling), Settings A (tabs down the
// left, each tab fits one screen, phones hide mouse/keyboard settings) and Loadout A (slots | choices | operator, only the
// choices list scrolls) on phones and computers.
import { open } from './harness.mjs';
const fails = [], errs = [];
const check = (name, ok, info) => { if (!ok) fails.push(name + (info !== undefined ? ' ' + JSON.stringify(info) : '')); };

// Elements of `sel` that scroll, except the allowed ones.
const scrollers = (sel, allow = []) => [...document.querySelectorAll(`${sel}, ${sel} *`)].filter((el) => {
  const cs = getComputedStyle(el);
  return /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 2 && !allow.includes(el.id);
}).map((el) => `${el.id || String(el.className).split(' ')[0]} ${el.scrollHeight}/${el.clientHeight}`);
const onScreen = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return b.width > 0 && b.top >= 0 && b.bottom <= innerHeight + 1 && b.left >= 0 && b.right <= innerWidth + 1; };

for (const [label, opts] of [['phone 915x330', { w: 915, h: 330, touch: true }], ['phone 915x412', { w: 915, h: 412, touch: true }],
  ['laptop 1366x768', { w: 1366, h: 768 }], ['desktop 1920x1080', { w: 1920, h: 1080 }]]) {
  const phone = !!opts.touch;
  const { browser, page, errors } = await open(opts);
  const r = await page.evaluate(([phone, scrollersSrc, onScreenSrc]) => {
    const scrollers = eval(scrollersSrc), onScreen = eval(onScreenSrc), F = window.__frontline, out = {};
    window.__step(5);
    // main menu
    F.ui.showScreen('menu'); window.__step(2);
    const L = document.querySelector('#menu .menu-l').getBoundingClientRect(), R = document.querySelector('#menu .menu-r2').getBoundingClientRect();
    out.menu = { scroll: scrollers('#menu .menu-col', ['mapSel']), deploy: onScreen('deploy'), nav: onScreen('openControls'), twoCols: L.width > 0 && R.left >= L.right - 1 };
    // settings: every tab
    document.getElementById('openSettings').click(); window.__step(2);
    out.tabs = [...document.querySelectorAll('#setTabs button')].filter((b) => b.offsetParent).map((b) => b.dataset.tab);
    out.pages = {};
    for (const t of out.tabs) {
      document.querySelector(`#setTabs [data-tab="${t}"]`).click(); window.__step(1);
      const shown = [...document.querySelectorAll('#settings .set-page')].filter((p) => !p.classList.contains('hidden')).map((p) => p.dataset.page);
      out.pages[t] = { shown, scroll: scrollers('#settings'), done: onScreen('settingsDone') };
    }
    document.querySelector('#setTabs [data-tab="controls"]').click(); window.__step(1);
    out.mouseSens = !!document.getElementById('set_sens').closest('label').offsetParent;
    // loadout
    F.ui.showScreen('menu'); F.ui.showLoadout(true); window.__step(2);
    const tabs = document.getElementById('loTabs').getBoundingClientRect(), row = document.getElementById('loRow').getBoundingClientRect(), prev = document.getElementById('loPreview').getBoundingClientRect();
    out.loadout = { scroll: scrollers('#loadout', ['loRow', 'loTabs']), threeCols: tabs.right <= row.left + 1 && row.right <= prev.left + 1, done: onScreen('loadoutDone'),
      slots: [...document.querySelectorAll('#loTabs button')].filter((b) => { const x = b.getBoundingClientRect(); return x.bottom <= innerHeight; }).length,
      detail: document.getElementById('loDetail').getBoundingClientRect().height };
    // picking a slot still works
    document.querySelector('#loTabs [data-t="g1"]').click(); window.__step(1);
    out.loadout.sidearmCards = document.querySelectorAll('#loRow .lo-card').length;
    return out;
  }, [phone, scrollers.toString(), onScreen.toString()]);
  if (phone) {
    check(`${label}: main menu is two columns`, r.menu.twoCols, r.menu);
    check(`${label}: main menu does not scroll`, r.menu.scroll.length === 0, r.menu);
    check(`${label}: Deploy and the screen buttons are on screen`, r.menu.deploy && r.menu.nav, r.menu);
    check(`${label}: no key bindings tab and no mouse sensitivity on touch`, !r.tabs.includes('keys') && !r.mouseSens, [r.tabs, r.mouseSens]);
  } else {
    check(`${label}: four settings tabs incl. key bindings`, r.tabs.join() === 'controls,graphics,gameplay,keys', r.tabs);
    check(`${label}: mouse sensitivity shown`, r.mouseSens);
  }
  for (const [t, p] of Object.entries(r.pages)) {
    check(`${label}: settings tab ${t} shows only its page`, p.shown.join() === t, p);
    check(`${label}: settings tab ${t} fits without scrolling`, p.scroll.length === 0, p);
    check(`${label}: settings Done on screen (${t})`, p.done, p);
  }
  check(`${label}: loadout is three columns`, r.loadout.threeCols, r.loadout);
  check(`${label}: loadout scrolls only the choices list`, r.loadout.scroll.length === 0, r.loadout);
  check(`${label}: loadout Done/Deploy on screen and all 9 slots visible`, r.loadout.done && r.loadout.slots === 9, r.loadout);
  check(`${label}: loadout description line not squashed`, r.loadout.detail >= 12, r.loadout);
  check(`${label}: picking a slot shows its choices`, r.loadout.sidearmCards > 1, r.loadout);
  errs.push(...errors); await browser.close();
}
console.log(fails.length ? 'FAIL menulayout\n  ' + fails.join('\n  ') : 'PASS menulayout', errs.length ? errs.slice(0, 5) : '');
process.exit(fails.length ? 1 : 0);
