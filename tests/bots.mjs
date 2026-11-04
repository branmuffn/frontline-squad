// Bot settings: skill 1-10 shapes the AI numbers, every "Bots may" rule switched off is obeyed, No-bots works.
// usage: node tests/bots.mjs [secs]
import { open } from './harness.mjs';
const SECS = +process.argv[2] || 40;
const { browser, page, errors } = await open({ w: 320, h: 240 });
const out = {}, fail = [];
const check = (n, ok, info) => { out[n] = ok ? 'ok' : 'FAIL ' + JSON.stringify(info); if (!ok) fail.push(n); };
const ai = await page.evaluate(() => {
  const F = window.__frontline, G = F.G; F.input.freeLook = true; const r = {};
  for (const sk of [1, 3, 5, 7, 10]) { F.deploy({ mode: 'ffa', map: 'yard', skill: sk, count: 3 }); r[sk] = { e: G.match.ai.aimErr, re: G.match.ai.react[0], d: G.match.difficulty, l: G.match.ai.label }; }
  F.deploy({ mode: 'ffa', map: 'yard', difficulty: 'hard', count: 3 }); r.legacy = G.match.skill;
  return r;
});
check('skill monotonic', ai[1].e > ai[3].e && ai[3].e > ai[5].e && ai[5].e > ai[7].e && ai[7].e > ai[10].e && ai[1].re > ai[10].re, ai);
check('skill bands', ai[1].d === 'recruit' && ai[3].d === 'easy' && ai[5].d === 'normal' && ai[7].d === 'hard' && ai[10].d === 'elite', ai);
check('legacy difficulty', ai.legacy === 7, ai.legacy);
const r = await page.evaluate((secs) => {
  const F = window.__frontline, G = F.G;
  const bots = { grenades: false, streaks: false, snipers: false, vehicles: false, loot: false, tactics: false };
  F.deploy({ mode: 'tdm', map: 'yard', skill: 9, count: 6, bots });
  G.player.protectUntil = 1e9; // keep the fight among bots
  const seen = { nade: 0, sniper: 0, loot: 0, flank: 0, cover: 0, ready: 0, veh: 0, kills: 0 };
  for (let i = 0; i < secs * 60; i++) {
    window.__step(1);
    if (i % 10) continue;
    for (const g of F.grenades) if (g.owner && g.owner.brain) seen.nade++;
    for (const b of G.bots) { const br = b.brain; if (['l96', 'barrett'].includes(br.weapon)) seen.sniper++; if (br.loot) seen.loot++; if (br.flankUntil > G.now) seen.flank++; if (br.wantCover || br.state === 'cover') seen.cover++; if (br.ready.length || br.uavUntil > G.now) seen.ready++; if (b.vehicle || br.board) seen.veh++; }
  }
  seen.kills = G.units.reduce((a, u) => a + u.kills, 0); seen.st = G.state; seen.now = G.now; seen.n = G.bots.length;
  const none = (() => { F.deploy({ mode: 'ffa', map: 'yard', skill: 5, count: 0 }); return G.bots.length; })();
  return { seen, none };
}, SECS);
const s = r.seen;
check('rules obeyed', !s.nade && !s.sniper && !s.loot && !s.flank && !s.cover && !s.ready && !s.veh, s);
check('bots still fight', s.kills > 0, s);
check('no bots', r.none === 0, r.none);
check('errors', errors.length === 0, errors.slice(0, 5));
console.log(JSON.stringify(out, null, 1)); console.log(fail.length ? 'FAILED: ' + fail.join(', ') : 'ALL OK');
await browser.close();
