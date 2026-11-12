import { open } from './harness.mjs';
const { browser, page, errors } = await open({w:320,h:240});
console.log(await page.evaluate(() => { const F = window.__frontline, G = F.G, o = {}; F.input.freeLook = true;
  for (const wid of ['m4', 'l96', 'barrett', 'l96', 'barrett']) {
    F.deploy({ mode: 'sandbox', map: 'yard', difficulty: 'normal', count: 1 }); window.__step(240);
    const P = G.player, T = G.bots[0]; P.weapons[0] = wid; P.ammo[wid] = P.ammo[wid] || { mag: 10, res: 10 }; P.ammo[wid].mag = 10;
    Object.assign(P, { x: 0, y: 0, z: 30, yaw: 0, pitch: 0, slot: 0, switchStart: -10 });
    Object.assign(T, { x: 0, y: 0, z: 0, health: 1000, maxHealth: 1000, protectUntil: 0 }); T.brain.target = null;
    window.__step(30); Object.assign(T, { x: 0, y: 0, z: P.z - 15 }); o['los_' + wid] = F.physics.losClear(0, 1.62, 30, 0, 1.1, 15); P.pitch = Math.atan2(T.y + 1.1 - (P.y + P.eye), 15); P.adsT = 1; P.bloom = 0; F.input.mouse = F.input.mouse || {}; 
    const c = G.renderer.domElement; c.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true })); window.__step(60); Object.assign(T, { x: 0, y: 0, z: P.z - 15 }); P.yaw = 0; P.recoilY = 0; P.recoilP = 0; P.pitch = Math.atan2(T.y + 1.1 - (P.y + P.eye), 15); o['yawdrift_' + wid] = 0; o['ads_' + wid] = +P.adsT.toFixed(2); c.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })); window.__step(3);
    c.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true })); window.dispatchEvent(new MouseEvent('mouseup', { button: 0 })); window.__step(20);
    o[wid] = [G.match.stats.shots, G.match.stats.hits, +(1000 - T.health).toFixed(0)];
  }
  return JSON.stringify(o); }), errors);
process.exitCode = errors.length ? 1 : 0; // exit non-zero on FAIL
await browser.close();
