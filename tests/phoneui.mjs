// Phone UI (Brian, 2026-11-15): "‹ Back" at the top-left of every phone screen (B: the floating Done is hidden where it
// did the same thing); phones start a match looking level (Android's tap mouse-moves used to pile up and aim at the
// sky); phones see phone wording instead of key hints (Tap Streak, Use, no "press B"); computers are unchanged.
import { open } from './harness.mjs';
const fails = [], errs = [];
const check = (name, ok, info) => { if (!ok) fails.push(name + (info !== undefined ? ' ' + JSON.stringify(info) : '')); };
const noFullscreen = () => { Element.prototype.requestFullscreen = function () { return Promise.resolve(); }; };

// ---------- phone (Pixel 7 held sideways, Chrome bar showing) ----------
{
  const { browser, page, errors } = await open({ w: 915, h: 356, touch: true });
  await page.evaluate(noFullscreen);
  const r = await page.evaluate(() => {
    const F = window.__frontline, G = F.G, $ = (id) => document.getElementById(id), out = {};
    window.__step(5); F.ui.showScreen('menu');
    const vis = (el) => !!el && !!el.offsetParent && el.getBoundingClientRect().width > 0;
    const top = (el) => { const b = el.getBoundingClientRect(), p = el.closest('.panel').getBoundingClientRect(); return b.top >= 0 && b.top - p.top < 60 && b.left - p.left < 60; }; // top-left of its panel
    const shown = () => ['menu', 'streaks', 'loadout', 'settings', 'career', 'controls', 'pause', 'end', 'armory', 'mp'].find((s) => !$(s).classList.contains('hidden'));
    // Back on each screen: visible at the top-left, and it goes where Done / Leave went
    const backOf = (id) => $(id).querySelector('.back-top');
    for (const [open, id, after, done] of [['openSettings', 'settings', 'menu', 'settingsDone'], ['openStreaks', 'streaks', 'menu', 'streaksDone'], ['openCareer', 'career', 'menu', 'careerDone'],
      ['openControls', 'controls', 'menu', 'controlsDone'], ['openLoadout', 'loadout', 'menu', null]]) {
      F.ui.showScreen('menu'); $(open).click(); window.__step(2);
      const b = backOf(id); out[id] = { back: vis(b) && top(b), doneHidden: done ? !vis($(done)) : true };
      b.click(); window.__step(1); out[id].after = shown() === after;
    }
    // before a match: Back returns to the menu (it must not deploy); the Deploy button stays
    F.ui.showScreen('menu'); F.ui.showLoadout(true); window.__step(2);
    out.prematch = { back: vis(backOf('loadout')), deploy: vis($('loadoutDone')), oldBack: !vis($('loadoutBack')) };
    backOf('loadout').click(); window.__step(2); out.prematch.after = shown() === 'menu' && G.state === 'menu';
    // multiplayer: Back = Leave (choose screen -> menu)
    window.__NET_OPTS = { nobroker: true }; F.openMp(); window.__step(2);
    out.mp = { back: vis(backOf('mp')) }; backOf('mp').click(); window.__step(1); out.mp.after = shown() === 'menu';
    // career scrolled to the bottom: Back stays on screen; opening it doesn't scroll the panel
    $('openCareer').click(); window.__step(2);
    const cp = document.querySelector('#career .pbody'); out.careerStart = cp.scrollTop;
    // one scroll area: the body scrolls, the rank ladder inside it doesn't scroll on its own
    out.careerOneScroll = cp.scrollHeight > cp.clientHeight && getComputedStyle($('rankLadder')).overflowY === 'visible';
    cp.scrollTop = 99999; out.careerBackStuck = (() => { const b = backOf('career').getBoundingClientRect(); return b.top >= -1 && b.bottom <= innerHeight; })();
    backOf('career').click();
    // Killstreaks: all cards fit (Pixel 7 with Chrome's bar); Settings sits in the middle of the screen
    $('openStreaks').click(); window.__step(2);
    { const pb = document.querySelector('#streaks .pbody').getBoundingClientRect(), cards = [...document.querySelectorAll('.streak-card')];
      out.streaksFit = [cards.filter((c) => c.getBoundingClientRect().bottom <= pb.bottom + 1).length, cards.length]; }
    backOf('streaks').click();
    $('openSettings').click(); window.__step(2);
    { const page = [...document.querySelectorAll('#settings .set-page')].find((p) => !p.classList.contains('hidden')).getBoundingClientRect(), pb = document.querySelector('#settings .pbody').getBoundingClientRect();
      out.settingsMid = Math.round((page.top + page.bottom) / 2 - (pb.top + pb.bottom) / 2); }
    backOf('settings').click();
    // phone wording
    out.editor = vis($('openEditor'));
    $('openControls').click(); out.ctrl = { touchList: vis(document.querySelector('#controls .keys.touch-only')), keyList: vis(document.querySelector('#controls .keys.mouse-only')) }; backOf('controls').click();
    const L = G.profile.lobby; L.mode = 'sandbox'; F.ui.showScreen('menu'); out.sandboxDesc = $('modeDesc').textContent; L.mode = 'ffa'; F.ui.showScreen('menu');
    $('openStreaks').click(); out.streakText = document.getElementById('streakCards').textContent; backOf('streaks').click();
    // sky fix: the mouse moves Android sends after each tap must not turn the camera
    for (const dy of [-250, 120, -300, -200]) document.dispatchEvent(new MouseEvent('mousemove', { movementX: 40, movementY: dy, bubbles: true }));
    out.lookBuildUp = [F.input.mdx, F.input.mdy];
    F.deploy({ mode: 'ffa', map: 'yard', skill: 5, count: 3 }); window.__step(30);
    out.pitch = G.player.pitch;
    // killstreak ready: phone banner and HUD
    G.player.streak = 5; F.checkStreak(5); window.__step(3);
    out.banner = $('bannerSub').textContent; out.ready = $('streakReady').innerHTML;
    out.lim = document.getElementById('score').textContent;
    // phone buttons (2026-11-15): Equip while carrying a claymore; Weapons only in Sandbox / Range
    const tapBtn = (cls) => { const el = document.querySelector('#touchUI .' + cls); const o = { bubbles: true, pointerId: 7, pointerType: 'touch', clientX: 1, clientY: 1 };
      el.dispatchEvent(new PointerEvent('pointerdown', o)); el.dispatchEvent(new PointerEvent('pointerup', o)); };
    const shownBtn = (cls) => { const el = document.querySelector('#touchUI .' + cls); return !!el && getComputedStyle(el).display !== 'none'; };
    G.profile.loadout.equip = 'claymore';
    F.deploy({ mode: 'ffa', map: 'yard', skill: 5, count: 0 }); window.__step(240);
    out.equip = { shown: shownBtn('t-equip'), weapons: shownBtn('t-armory'), left: G.player.equipLeft };
    tapBtn('t-equip'); window.__step(20);
    out.equip.after = G.player.equipLeft; out.equip.hidden = !shownBtn('t-equip');
    F.deploy({ mode: 'sandbox', map: 'yard', skill: 5, count: 0 }); window.__step(240);
    out.weapons = { shown: shownBtn('t-armory') }; tapBtn('t-armory'); window.__step(2);
    out.weapons.opened = !$('armory').classList.contains('hidden') && G.state === 'paused';
    $('armClose').click(); window.__step(2);
    out.sandboxHud = document.getElementById('score').textContent;
    // weapon menu (sandbox): Back = back to the fight; its floating button is hidden
    F.deploy({ mode: 'sandbox', map: 'yard', skill: 5, count: 0 }); window.__step(240); G.pausedFrom = G.state; G.state = 'paused'; F.ui.showArmory(); // as openArmory does
    out.armory = { back: vis(backOf('armory')), close: !vis($('armClose')), lede: $('armLede').textContent };
    backOf('armory').click(); window.__step(2); out.armory.after = G.state === 'playing' && shown() === undefined;
    return out;
  });
  for (const id of ['settings', 'streaks', 'career', 'controls', 'loadout']) {
    check(`phone ${id}: Back at the top-left`, r[id].back, r[id]);
    check(`phone ${id}: floating Done hidden`, r[id].doneHidden, r[id]);
    check(`phone ${id}: Back goes back`, r[id].after, r[id]);
  }
  check('phone loadout before a match: Back to the menu, Deploy kept', r.prematch.back && r.prematch.deploy && r.prematch.oldBack && r.prematch.after, r.prematch);
  check('phone multiplayer: Back leaves', r.mp.back && r.mp.after, r.mp);
  check('phone career: opens at the top, one scroll area, Back stays on screen when scrolled', r.careerStart === 0 && r.careerOneScroll && r.careerBackStuck, r);
  check('phone Killstreaks: every card fits on screen', r.streaksFit[0] === r.streaksFit[1] && r.streaksFit[1] >= 8, r.streaksFit);
  check('phone Settings: centred vertically', Math.abs(r.settingsMid) < 12, r.settingsMid);
  check('phone: no map editor (it needs a keyboard)', r.editor === false);
  check('phone Controls: touch list, not keys', r.ctrl.touchList && !r.ctrl.keyList, r.ctrl);
  check('phone: sandbox text says tap Weapons, not press B', !/press B/i.test(r.sandboxDesc) && /Tap Weapons/.test(r.sandboxDesc), r.sandboxDesc);
  check('phone: killstreak cards say tap Streak', /tap Streak/i.test(r.streakText) && !/press F\b/.test(r.streakText), r.streakText.slice(0, 200));
  check('phone: menu taps do not build up camera turn', r.lookBuildUp[0] === 0 && r.lookBuildUp[1] === 0, r.lookBuildUp);
  check('phone: match starts looking level', Math.abs(r.pitch) < 0.01, r.pitch);
  check('phone: streak banner says Tap Streak', r.banner === 'Tap Streak to deploy', r.banner);
  check('phone: streak HUD has no key', r.ready && !/<kbd>/.test(r.ready), r.ready);
  check('phone: Equip button shows with a claymore and sets it', r.equip.shown && r.equip.left === 1 && r.equip.after === 0 && r.equip.hidden && !r.equip.weapons, r.equip);
  check('phone: Weapons button in Sandbox opens the weapon menu', r.weapons.shown && r.weapons.opened, r.weapons);
  check('phone: Sandbox HUD says tap Weapons', /tap Weapons/.test(r.sandboxHud), r.sandboxHud);
  check('phone: weapon menu Back', r.armory.back && r.armory.close && r.armory.after && !/Press B/.test(r.armory.lede), r.armory);
  errs.push(...errors); await browser.close();
}

// ---------- desktop: unchanged ----------
{
  const { browser, page, errors } = await open({ w: 1366, h: 768 });
  const r = await page.evaluate(() => {
    const F = window.__frontline, G = F.G, $ = (id) => document.getElementById(id), out = {};
    window.__step(5); F.ui.showScreen('menu');
    const vis = (el) => !!el && !!el.offsetParent;
    out.backs = [...document.querySelectorAll('.back-top')].filter(vis).length;
    out.editor = vis($('openEditor'));
    $('openStreaks').click(); out.streaksDone = vis($('streaksDone')); out.streakText = $('streakCards').textContent; $('streaksDone').click();
    $('openControls').click(); out.keyList = vis(document.querySelector('#controls .keys.mouse-only')); out.touchList = vis(document.querySelector('#controls .keys.touch-only')); $('controlsDone').click();
    $('openSettings').click(); out.settingsDone = vis($('settingsDone')); $('settingsDone').click();
    const L = G.profile.lobby; L.mode = 'sandbox'; F.ui.showScreen('menu'); out.sandboxDesc = $('modeDesc').textContent; L.mode = 'ffa'; F.ui.showScreen('menu');
    F.input.freeLook = true; F.deploy({ mode: 'ffa', map: 'yard', skill: 5, count: 3 }); window.__step(30);
    const p0 = G.player.pitch;
    for (let i = 0; i < 5; i++) document.dispatchEvent(new MouseEvent('mousemove', { movementX: 0, movementY: -40, bubbles: true }));
    window.__step(2); out.turned = G.player.pitch - p0;
    G.player.streak = 5; F.checkStreak(5); window.__step(3);
    out.banner = $('bannerSub').textContent; out.ready = $('streakReady').innerHTML;
    return out;
  });
  check('desktop: no Back buttons', r.backs === 0, r.backs);
  check('desktop: map editor kept', r.editor === true);
  check('desktop: Done buttons kept', r.streaksDone && r.settingsDone, r);
  check('desktop: key list in Controls', r.keyList && !r.touchList, r);
  check('desktop: sandbox text unchanged', /Press B for the weapon menu\./.test(r.sandboxDesc), r.sandboxDesc);
  check('desktop: killstreak cards say press F', /press F\b/i.test(r.streakText), r.streakText.slice(0, 120));
  check('desktop: mouse still turns the camera', r.turned > 0.1, r.turned);
  check('desktop: streak banner says Press F', r.banner === 'Press F to deploy', r.banner);
  check('desktop: streak HUD shows the key', /<kbd>F<\/kbd>/.test(r.ready), r.ready);
  errs.push(...errors); await browser.close();
}

console.log(fails.length || errs.length ? `PHONE UI FAIL\n${fails.join('\n')}${errs.length ? '\nERRORS ' + errs.slice(0, 3).join(' | ') : ''}` : 'PHONE UI PASS');
process.exitCode = fails.length || errs.length ? 1 : 0;
