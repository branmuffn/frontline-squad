import { G } from '../core/state.js';
import { XP, RANKS } from '../core/config.js';
import { saveProfile } from '../core/storage.js';
import { play } from '../engine/audio.js';
import * as hud from '../ui/hud.js';

export function rankFor(xp) { let r = 0; for (const k of RANKS) if (xp >= k.xp) r = k.i; return r; }
export function rankProgress(xp) {
  const r = rankFor(xp), cur = RANKS[r], next = RANKS[r + 1];
  return { rank: r, name: cur.name, next: next ? next.name : null, into: xp - cur.xp, span: next ? next.xp - cur.xp : 1, pct: next ? (xp - cur.xp) / (next.xp - cur.xp) : 1 };
}

export function resetMatchXp() {
  const m = G.match;
  m.xp = new Map(); m.xpTotal = 0; m.multiCount = 0; m.multiLast = -10;
}

export function award(key, label, amount = XP[key], quiet = false) {
  const m = G.match; if (!m || !amount || m.mode === 'sandbox') return;
  const before = rankFor(G.profile.xp + m.xpTotal);
  m.xpTotal += amount;
  const e = m.xp.get(label) || { label, count: 0, xp: 0 }; e.count++; e.xp += amount; m.xp.set(label, e);
  if (m.mode === 'survival') m.points += amount;
  if (!quiet) hud.xpPopup(label, amount);
  const after = rankFor(G.profile.xp + m.xpTotal);
  if (after > before) { hud.banner('Promoted', RANKS[after].name); play('rankup', null, { important: true, delay: 0.2 }); }
}

export function awardKill(victim, info, victimStreak) {
  const m = G.match, p = G.player;
  if (m.mode === 'sandbox') return;
  award('kill', info.weapon === 'sentry' ? 'Sentry kill' : info.weapon === 'mortar' ? 'Mortar kill' : 'Elimination');
  if (info.headshot && !info.explosive) { award('headshot', 'Headshot'); G.profile.career.headshots++; }
  if (info.melee) { award('melee', info.backstab ? 'Backstab' : 'Knife kill'); G.profile.career.knifeKills++; }
  if (info.weapon === 'frag') { award('grenade', 'Grenade kill'); G.profile.career.grenadeKills++; }
  if (info.dist > 40 && !info.melee && !info.explosive) award('longshot', 'Longshot');
  if (m.killsTotal === 0) award('firstBlood', 'First blood');
  if (victim === p.lastKiller) { award('revenge', 'Revenge'); p.lastKiller = null; }
  if (victimStreak >= 3) award('streakEnd', 'Buzzkill');
  m.multiCount = G.now - m.multiLast < 4 ? m.multiCount + 1 : 1; m.multiLast = G.now;
  if (m.multiCount === 2) award('double', 'Double kill'); else if (m.multiCount === 3) award('triple', 'Triple kill'); else if (m.multiCount >= 4) award('multi', 'Multi kill');
}

// Called once when a match ends normally. Returns a summary for the end screen.
export function finishMatch(result) {
  const m = G.match, pr = G.profile, c = pr.career, p = G.player;
  if (m.mode !== 'survival') award('complete', 'Match completed', XP.complete, true);
  if (result === 'victory') award('win', 'Victory', XP.win, true);
  const xpBefore = pr.xp;
  pr.xp += m.xpTotal;
  c.kills += p.kills; c.deaths += p.deaths; c.shots += m.stats.shots; c.hits += m.stats.hits; c.matches++;
  if (result === 'victory') c.wins++;
  c.bestStreak = Math.max(c.bestStreak, p.bestStreak); c.seconds += Math.round(m.elapsed);
  let newBest = false;
  if (m.mode === 'ffa' && p.kills > pr.best.ffa) { pr.best.ffa = p.kills; newBest = true; }
  if (m.mode === 'tdm' && p.kills > pr.best.tdm) { pr.best.tdm = p.kills; newBest = true; }
  if (m.mode === 'zombies' && m.round > (pr.best.zombies || 0)) { pr.best.zombies = m.round; newBest = true; }
  if ((m.mode === 'gungame' || m.mode === 'ctf' || m.mode === 'infection') && p.kills > (pr.best[m.mode] || 0)) { pr.best[m.mode] = p.kills; newBest = true; }
  if (m.mode === 'survival') {
    if (m.points > (pr.best.survival[m.difficulty] || 0)) { pr.best.survival[m.difficulty] = m.points; newBest = true; }
    pr.best.wave = Math.max(pr.best.wave, m.wave);
  }
  saveProfile();
  return { xpBefore, xpAfter: pr.xp, lines: [...m.xp.values()].sort((a, b) => b.xp - a.xp), total: m.xpTotal, newBest };
}
