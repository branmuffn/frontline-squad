import * as chat from './ui/chat.js';
import { streakState } from './entities/streaks.js';
import { initChat } from './ui/chat.js';
import { G, isLive } from './core/state.js';
import { loadProfile, saveProfile, applyQuality, detectQuality } from './core/storage.js';
import { initTouch, setTouch, wantTouch, touchTick, goFullscreen } from './core/touch.js';
import { $ } from './core/util.js';
import { initInput, input, matches, requestLock, exitLock, isLocked, clearInput } from './core/input.js';
import { initRenderer, render, resize, onGraphicsLost } from './engine/render.js';
import { initFx, updateFx } from './engine/fx.js';
import { initAudio, setVolume, play, ambienceTick } from './engine/audio.js';
import { setScene, stinger, setMusicVolume, musicScene } from './engine/music.js';
import { loadMap, setShadows, setShadowSize } from './world/maps/index.js';
import { doPing, updatePings, clearPings } from './ui/ping.js';
import { startDrill } from './game/modes.js';
import { startEditor, stopEditor, editorOn, editorKey, editorTick, exportMap } from './game/editor.js';
import { saveCustom, validCustom } from './world/maps/custommap.js';
import { perfTick, perfFrameStart, initPower } from './engine/power.js';
import { initViewmodel, setCamo } from './entities/viewmodel.js';
import { giveWeapons, spawnPlayer, knifeSlot, updatePlayer, selectSlot, swapLast, cycleWeapon, startReload, grenadePress, grenadeRelease, onJumpPressed, onMouseDown, equipWeapon, refillAmmo, scopeZoom, toggleProne } from './entities/player.js';
import { updateRockets, rockets } from './entities/projectiles.js';
import * as ballistics from './entities/ballistics.js';
const { updateBullets, bullets } = ballistics;
import * as worldprops from './entities/worldprops.js';
const { updateWorldProps, tryPickup } = worldprops;
import { updateBots } from './entities/ai.js';
import { separateUnits } from './entities/units.js';
import { updateGrenades, throwGrenade, grenades } from './entities/grenades.js';
import { updatePickups } from './entities/pickups.js';
import { updateStreaks, useStreak, grantStreak, checkStreak } from './entities/streaks.js';
import { startMatch, updateMatch, abandonMatch, pickSpawn, endMatch } from './game/match.js';
import { initHud, updateHud, toggleBoard, setFps, setWeapon as setWeaponHud } from './ui/hud.js';
import { setNameStyle, WEAPONS, ALL_GUNS } from './core/config.js';
import { initMenus, showScreen, showPause, showArmory, showLoadout } from './ui/menus.js';
import * as physics from './world/physics.js';
import * as nav from './world/nav.js';
import { toggleColliderDebug, syncColliderDebug } from './world/debugcol.js';
import { kcDebug } from './game/killcam.js';
import { recordFrame, killcamActive, skipKillcam, finaleStep } from './game/killcam.js';
import { finishFinale } from './game/match.js';
import { unitFoley } from './entities/units.js';
import { spectateStep, spectateCycle, spectateToggleView } from './net/spectate.js';
import { updateGear, useEquipment } from './entities/gear.js';
import { openCrate } from './entities/streaks.js';
import { updateDoors, doorInteract } from './world/doors.js';
import { updateVehicles, vehicleInteract, switchSeat, vehicles, damageVehicle } from './entities/vehicles.js';
import { damage, kill } from './entities/units.js';
import * as net from './net/net.js';
import { initLobby, openMp } from './net/lobby.js';

let wantResume = false, lastCfg = null;

function boot() {
  if (!window.WebGLRenderingContext) throw new Error('WebGL is not available in this browser.');
  loadProfile();
  // Phones and tablets, once: Balanced graphics at 2x sharpness (auto resolution steps down if the frame rate drops).
  // v1 used Battery saver, which Brian found too blurry on a Pixel 7 (2026-11-14); v2 replaces it. Changeable in Settings.
  const st0 = G.profile.settings;
  if ((st0.touchV || 0) < 2 && wantTouch(st0)) { applyQuality(st0, 'balanced'); st0.pixelMax = 2; st0.quality = detectQuality(st0); st0.touchV = 2; saveProfile(); }
  initRenderer($('game'));
  onGraphicsLost(graphicsLost);
  initFx();
  initViewmodel();
  loadMap(G.profile.lobby.map);
  initHud();
  initPower(() => applySetting('quality'), () => { const b = $('exportProfile'); if (b) b.click(); });
  applySetting('crosshair'); applySetting('showFps'); applySetting('scopeToggle'); setNameStyle(G.profile.settings.names);
  initInput(G.renderer.domElement, {
    inGame: () => (isLive() && !G.netPaused) || G.state === 'paused',
    onKeyDown, onKeyUp, onMouseDown: (b) => { if (G.state === 'finale' || killcamActive()) return; /* clicks never skip a replay; keys do */ if (G.spectating) { spectateCycle(b === 2 ? -1 : 1); return; } if (G.netPaused) return; onMouseDown(b); }, onWheel: (d) => { if (G.state === 'playing' && !scopeZoom(d) && G.profile.settings.wheelSwitch) cycleWeapon(d); },
    onAimToggle: () => { const P = G.player; if (!input.aim) { input.aim = true; if (P) P.zoomIdx = 0; return; } if (P && scopeZoom(0) && P.zoomIdx !== 0) return; input.aim = false; if (P) P.zoomIdx = 0; },
    onLockChange, onLockError, onCanvasClick, onBlur: () => { if (isLive() && !input.freeLook) pause(false); },
  });
  initTouch({ onPause: () => pause(false), onCycle: () => { const P = G.player; if (G.state === 'playing' && P && P.alive && !P.vehicle) cycleWeapon(1); } });
  initChat();
  initLobby({ showScreen });
  net.init({ deploy: (cfg) => deploy(cfg), abort: (msg) => { leaveMpMatch(); openMp(msg); }, pickSpawn: (u) => pickSpawn(u) });
  initMenus({
    onDeploy: deploy, onResume: resume, onFreeLook: () => { input.freeLook = true; resume(); },
    onRestart: () => { if (G.mp) { if (G.mp.host) net.hostStart(); return; } if (lastCfg) deploy(lastCfg); }, onQuit: quit, onRedeploy: redeploy, onEndWarmup: endWarmup, onOpenEditor: () => openEditor(), editorOn,
    onEditorExport: () => { const j = exportMap(); try { navigator.clipboard.writeText(j); } catch (e) { /* no clipboard */ } window.prompt('Your map (copied to the clipboard). Share or keep this text:', j); },
    onEditorImport: () => { const t = window.prompt('Paste a map’s text:'); if (!t) return; try { const m = JSON.parse(t); if (!validCustom(m)) throw new Error('bad'); saveCustom(m); openEditor(); } catch (e) { window.alert('That isn’t a valid map.'); } },
    onSkin: (k) => net.setSkin(k),
    onMapPreview: (id) => loadMap(id), onArmory, onCamo: (id) => setCamo(id), onSetting: applySetting,
  });
  // music can only start after the first user gesture (browser autoplay rules)
  const firstGesture = () => {
    window.removeEventListener('pointerdown', firstGesture, true); window.removeEventListener('keydown', firstGesture, true);
    initAudio(); setVolume(G.profile.settings.volume); setMusicVolume(G.profile.settings.music);
    setTimeout(() => { if (G.state === 'menu') setScene('menu'); }, 0);
  };
  window.addEventListener('pointerdown', firstGesture, true); window.addEventListener('keydown', firstGesture, true);
  window.addEventListener('beforeunload', (e) => { if (isLive() || G.state === 'paused') { e.preventDefault(); e.returnValue = ''; } });
  // handle for debugging from the console
  { const xf = document.getElementById('exitFull'), sync = () => xf.classList.toggle('hidden', !document.fullscreenElement);
    document.addEventListener('fullscreenchange', sync); sync();
    xf.addEventListener('click', () => { try { const o = screen.orientation; if (o && o.unlock) o.unlock(); } catch (e) { /* not supported */ } document.exitFullscreen?.().catch(() => {}); }); }
  window.__frontline = { kcDebug, streakState, checkStreak, net, openMp, throwGrenade, grenades, G, physics, nav, loadMap, deploy, damage, input, rockets, bullets, ballistics, worldprops, musicScene, toggleColliderDebug, endMatch, vehicles, damageVehicle, ui: { showScreen, showPause, showArmory, showLoadout } };
  G.state = 'menu';
  showScreen('menu');
  $('loader').classList.add('hidden');
  requestAnimationFrame(loop);
}

function applySetting(k) {
  const s = G.profile.settings;
  if (k === 'names') { setNameStyle(s.names); if (G.player && G.player.weapons) setWeaponHud(G.player); }
  if (k === 'volume') setVolume(s.volume);
  if (k === 'music') setMusicVolume(s.music);
  if (k === 'shadows') setShadows(s.shadows);
  if (k === 'renderScale' || k === 'pixelMax') resize();
  if (k === 'shadowQ') { s.shadows = s.shadowQ !== 'off'; setShadows(s.shadows); setShadowSize(s.shadowQ === 'low' ? 1024 : 2048); }
  if (k === 'quality') { resize(); s.shadows = s.shadowQ !== 'off'; setShadows(s.shadows); setShadowSize(s.shadowQ === 'low' ? 1024 : 2048); }
  if (k === 'scopeToggle') { input.aimToggle = !!s.scopeToggle; input.aim = false; }
  if (k === 'showFps') $('fps').classList.toggle('hidden', !s.showFps);
  if (k === 'crosshair') document.documentElement.style.setProperty('--ch', s.crosshair);
  if (k === 'touch') setTouch(wantTouch());
  if (k === 'fov' && !isLive()) { G.camera.fov = s.fov; G.camera.updateProjectionMatrix(); }
}

function deploy(cfg) {
  if (!(G.mp && G.mp.live && G.mp.client)) G.spectating = null;
  if (cfg.mode === 'range') cfg = { ...cfg, map: 'range', count: 0 }; // the range is its own map
  lastCfg = cfg; G.netPaused = false; clearPings(); stopEditor();
  initAudio(); setVolume(G.profile.settings.volume); setMusicVolume(G.profile.settings.music);
  setScene(null); stinger('start'); // no music in a match, just the cue
  const veh = G.profile.lobby.vehicles; if (G.mp) G.profile.lobby.vehicles = !!cfg.vehicles; // multiplayer: the host's lobby setting
  startMatch(cfg); syncColliderDebug();
  if (cfg.editor) startEditor();
  G.profile.lobby.vehicles = veh;
  showScreen(null);
  wantResume = false;
  if (input.touch) goFullscreen(); else if (!input.freeLook) requestLock();
}

let armoryOpen = false;
function openArmory() {
  if (G.state !== 'playing' || !G.player.alive) return;
  armoryOpen = true; G.pausedFrom = G.state; G.state = 'paused';
  clearInput(); toggleBoard(false);
  showArmory(); exitLock();
}
function onArmory(a) {
  const P = G.player;
  if (a.rack) { // practice range rack: tick guns on/off, the menu stays open
    const r = G.profile.rangeRack = (G.profile.rangeRack || []).filter((id) => WEAPONS[id]);
    const list = a.rack === 'all' ? ALL_GUNS.slice() : a.rack === 'none' ? [] : r.includes(a.rack) ? r.filter((x) => x !== a.rack) : [...r, a.rack];
    G.profile.rangeRack = list; saveProfile();
    const keep = P.weapons[P.slot], guns = list.length ? list : P.weapons.filter((w) => !WEAPONS[w].melee).slice(0, 1);
    giveWeapons([...guns, 'knife'], guns.includes(keep) ? keep : guns[guns.length - 1]);
    showArmory(); return;
  }
  if (a.weapon) equipWeapon(a.weapon);
  else if (a.action === 'refill') { refillAmmo(); P.grenades = 3; }
  else if (a.action && a.action.startsWith('drill:')) startDrill(a.action.slice(6));
  else if (a.action === 'heal') P.health = P.maxHealth;
  else if (a.action && a.action !== 'close') grantStreak(a.action);
  armoryOpen = false;
  resume();
}

function pause(lockError) {
  if (!isLive()) return;
  if (G.mp && G.mp.live) { // multiplayer: the match keeps running behind the menu
    if (G.netPaused) return;
    G.netPaused = true; G.pausedFrom = G.state; clearInput(); toggleBoard(false);
    if (G.player && G.player.cookStart >= 0) grenadeRelease();
    showPause(lockError); return;
  }
  G.pausedFrom = G.state; G.state = 'paused';
  clearInput(); toggleBoard(false);
  if (G.player && G.player.cookStart >= 0) grenadeRelease();
  showPause(lockError);
}
function resume() {
  if (G.netPaused) {
    if (!isLive()) { G.netPaused = false; return; }
    if (input.freeLook || input.touch || isLocked()) { G.netPaused = false; showScreen(null); return; }
    wantResume = true; requestLock(); return;
  }
  if (G.state !== 'paused') return;
  initAudio();
  if (input.freeLook || input.touch || isLocked()) { G.state = G.pausedFrom; showScreen(null); return; }
  wantResume = true;
  requestLock();
}
// Pause-menu escape hatch: a fresh spawn without a death (Survival charges a life by counting it as one).
function redeploy() {
  const P = G.player;
  if (G.state !== 'paused' || G.pausedFrom !== 'playing' || !P || !P.alive || G.now - P.lastHitAt < 4) return;
  G.state = 'playing';
  if (G.match.mode === 'survival') kill(P, null, { weapon: 'redeploy', noStreak: true });
  else { const streak = P.streak, s = pickSpawn(P); spawnPlayer(s.x, s.y, s.z, s.yaw); P.streak = streak; }
  G.pausedFrom = G.state; G.state = 'paused';
  resume();
}
function leaveMpMatch() {
  armoryOpen = false; G.netPaused = false;
  abandonMatch(); exitLock(); input.freeLook = false;
  setScene('menu');
}
function endWarmup() {
  if (!(G.mp && G.mp.host && G.mp.live)) return;
  net.hostAbort(true); leaveMpMatch(); openMp();
  setTimeout(() => { if (!net.hostStart()) chat.add('', 'Warm-up over. The match starts when everyone presses Ready.', 'sys'); }, 900);
}
function quit() {
  stopEditor();
  if (G.mp) {
    if (G.mp.live) { if (G.mp.host) net.hostAbort(); else net.clientQuit(); }
    leaveMpMatch(); openMp(); return;
  }
  armoryOpen = false;
  abandonMatch(); exitLock(); input.freeLook = false;
  showScreen('menu'); setScene('menu');
}

function onLockChange(locked) {
  if (locked) {
    if (G.netPaused && wantResume) { G.netPaused = false; showScreen(null); }
    else if (G.state === 'paused' && wantResume) { G.state = G.pausedFrom; showScreen(null); }
    wantResume = false;
  } else if (isLive() && !input.freeLook && !G.netPaused) pause(false);
}
function onLockError() {
  wantResume = false;
  if (G.netPaused) showPause(true); else if (isLive()) pause(true); else if (G.state === 'paused') showPause(true);
}
function onCanvasClick() {
  if (G.state === 'paused' || G.netPaused) resume();
  else if (isLive() && !isLocked() && !input.freeLook && !input.touch) requestLock();
}

let finaleVM = false;
// map editor: sandbox on the custom map; rebuilding keeps you where you stand
function editorReload() { const P = G.player, p = { x: P.x, y: P.y, z: P.z, yaw: P.yaw, pitch: P.pitch }; loadMap('custom', true); G.world.nav = null; Object.assign(P, p); }
function openEditor() { G.profile.lobby.map = 'custom'; deploy({ mode: 'sandbox', map: 'custom', skill: 5, count: 0, editor: true }); }
function onKeyDown(code, e) {
  if (editorOn() && isLive() && !e.repeat && editorKey(code, editorReload, () => { stopEditor(); deploy({ mode: 'ffa', map: 'custom', skill: 5, count: 5 }); })) { e.preventDefault(); return; }
  if (G.state === 'finale') { if (!e.repeat && code !== 'Tab') skipKillcam(); return; }
  if (G.spectating && code === 'KeyV' && !e.repeat) { spectateToggleView(); return; }
  if (!(isLive() || G.state === 'paused')) return;
  if (code === 'F9') { e.preventDefault(); toggleColliderDebug(); return; }
  if (G.state === 'dead' && !e.repeat && code !== 'Escape' && !matches('scoreboard', code) && skipKillcam()) return;
  if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code) || Object.values(G.profile.settings.keys).includes(code)) e.preventDefault();
  if (armoryOpen && (code === 'Escape' || matches('armory', code))) { onArmory({ action: 'close' }); return; }
  if (code === 'Escape' && input.freeLook && isLive()) { pause(false); return; }
  if (G.mp && G.mp.live && isLive() && !G.netPaused && !e.repeat && (code === 'Enter' || matches('chat', code) || matches('teamChat', code))) { e.preventDefault(); clearInput(); toggleBoard(false); const team = matches('teamChat', code) && !!(G.match && G.match.teams); chat.open((t) => net.sendChat(t, team), team); return; }
  if (!isLive() || G.netPaused) return;
  if (matches('scoreboard', code)) toggleBoard(true);
  if (e.repeat) return;
  if (matches('jump', code)) onJumpPressed();
  if (G.state !== 'playing') return;
  if (G.player && G.player.vehicle) { // in a vehicle: E gets out, 1/2 change seat, F still calls streaks
    if (matches('interact', code)) vehicleInteract(G.player);
    else if (matches('primary', code)) switchSeat(G.player, 0);
    else if (matches('secondary', code)) switchSeat(G.player, 1);
    else if (matches('streak', code)) useStreak();
    return;
  }
  if (matches('zoom', code)) scopeZoom(0);
  if (matches('prone', code)) toggleProne();
  if (matches('reload', code)) startReload();
  else if (G.match.mode === 'range' && /^Digit[1-9]$/.test(code) && G.player.weapons.length > 4) { const i = +code[5] - 1; if (i < G.player.weapons.length) selectSlot(i); }
  else if (matches('primary', code)) selectSlot(0);
  else if (matches('secondary', code)) selectSlot(1);
  else if (matches('melee', code)) selectSlot(2);
  else if (matches('slot4', code)) selectSlot(knifeSlot());
  else if (matches('swap', code)) swapLast();
  else if (matches('grenade', code)) grenadePress();
  else if (matches('streak', code)) useStreak();
  else if (matches('equip', code)) useEquipment(G.player);
  else if (matches('interact', code)) { const H = G.match.hook; if (!(H && H.interact && H.interact()) && !openCrate(G.player) && !vehicleInteract(G.player) && !doorInteract(G.player)) tryPickup(); }
  else if (matches('armory', code) && (G.match.mode === 'sandbox' || G.match.mode === 'range')) openArmory();
  else if (matches('ping', code)) doPing();
}
function onKeyUp(code) {
  if (matches('scoreboard', code)) toggleBoard(false);
  if (matches('grenade', code)) grenadeRelease();
}

let prev = performance.now(), fpsAcc = 0, fpsN = 0, menuT = 0;
// Frame pacing: optional frame-rate cap (Display = the monitor's own rate), and auto resolution that lowers the render
// scale step by step when the frame rate stays below target in a match, and raises it again when there is headroom.
let lastDraw = 0, arAcc = 0, arN = 0, arUp = 0;
function autoRes(raw) {
  const s = G.profile.settings;
  if (!s.autoRes || !isLive()) { arAcc = arN = 0; return; }
  arAcc += raw; arN++;
  if (arAcc < 2) return;
  const fps = arN / arAcc, target = (s.fpsCap || 60) * 0.9; arAcc = arN = 0;
  const cur = G.dynScale || 1;
  if (fps < target && cur > 0.55) { G.dynScale = Math.max(0.5, cur - 0.1); arUp = 0; resize(); }
  else if (fps > target * 1.12 && cur < 1 && ++arUp >= 2) { G.dynScale = Math.min(1, cur + 0.1); arUp = 0; resize(); }
}
function loop(t) {
  requestAnimationFrame(loop);
  const st = G.profile && G.profile.settings;
  // low-power menus: menus, pause and lobby draw at 30 fps without redrawing shadows (the match itself is untouched)
  const low = !!(st && st.lowMenus && !isLive() && G.state !== 'finale');
  if (low !== !!G.lowPowerFrame) { G.lowPowerFrame = low; G.shadowTick = 0; }
  const cap = low ? (st.fpsCap ? Math.min(30, st.fpsCap) : 30) : st && st.fpsCap;
  if (cap && lastDraw && t - lastDraw < 1000 / cap - 1.5) return; // frame cap: skip this display refresh
  perfFrameStart();
  if (cap) autoRes((t - lastDraw) / 1000); lastDraw = t;
  const raw = Math.max(0.0001, (t - prev) / 1000), dt = Math.min(0.05, raw); prev = t;
  G.realTime += dt;
  fpsAcc += raw; fpsN++; if (!cap) autoRes(raw);
  if (fpsAcc > 0.5) { G.fps = Math.round(fpsN / fpsAcc); setFps(G.fps); fpsAcc = 0; fpsN = 0; }
  if (low) arAcc = arN = 0;
  if (isLive()) {
    G.now += dt;
    updateMatch(dt);
    if (isLive()) {
      document.body.classList.toggle('spectating', !!G.spectating);
      if (G.spectating) spectateStep(dt); else updatePlayer(dt);
      updateBots(dt); unitFoley(dt);
      if (G.mp) net.update(dt);
      separateUnits();
      for (const u of G.units) {
        if (!u.alive) continue;
        physics.depenetrate(u);
        // smoothed velocity estimate (bots lead moving targets with projectile rifles)
        const vx = u._lx === undefined ? 0 : Math.max(-12, Math.min(12, (u.x - u._lx) / dt)), vz = u._lz === undefined ? 0 : Math.max(-12, Math.min(12, (u.z - u._lz) / dt));
        u.velX = (u.velX || 0) * 0.8 + vx * 0.2; u.velZ = (u.velZ || 0) * 0.8 + vz * 0.2; u._lx = u.x; u._lz = u.z;
      }
      updateGrenades(dt);
      updateRockets(dt);
      updateBullets(dt);
      updateWorldProps(dt);
      updateVehicles(dt);
      updateDoors(dt);
      updatePickups(dt);
      updateStreaks(dt); updateGear(dt);
      updateHud(dt);
      recordFrame();
      ambienceTick(dt, G.world.def.ambience);
    }
  } else if (G.state === 'finale') { // end-of-match replay
    finaleVM = finaleStep(dt);
    if (!finaleVM) finishFinale();
  } else if (G.state === 'menu') {
    menuT += dt;
    const b = G.world.bounds, r = (b.maxX - b.minX) * 0.42, a = menuT * 0.05;
    G.camera.position.set(Math.sin(a) * r, 15 + Math.sin(menuT * 0.11) * 2, Math.cos(a) * r);
    G.camera.rotation.set(-0.36, a, 0);
    if (Math.abs(G.camera.fov - 62) > 0.1) { G.camera.fov = 62; G.camera.updateProjectionMatrix(); }
  }
  if (G.mapGroup) { const cl = G.mapGroup.getObjectByName('clouds'); if (cl) cl.material.map.offset.x += dt * 0.0015; }
  updateFx(dt); updatePings(); editorTick(); touchTick();
  render(isLive() && G.player && (G.player.alive || killcamActive()) || (G.state === 'paused' && G.player && G.player.alive) || (G.state === 'finale' && finaleVM === true));
  perfTick();
}

// Phones can drop the 3D graphics after switching apps or when short of memory. The 3D library brings them back by
// itself when the phone allows; meanwhile solo play pauses, and if they're still gone after 3 s, offer a reload.
let lostTimer = 0;
function graphicsLost(lost) {
  clearTimeout(lostTimer);
  const el = $('glLost');
  if (!lost) { if (el) el.classList.add('hidden'); return; }
  if (!G.mp) pause(false);
  lostTimer = setTimeout(() => {
    if (!G.glLost) return;
    let box = $('glLost');
    if (!box) {
      box = document.createElement('section'); box.id = 'glLost'; box.className = 'screen'; box.style.zIndex = '80';
      box.innerHTML = '<div class="panel"><h2>Graphics paused</h2><p class="lede">Your device stopped the game’s 3D graphics, which can happen after switching apps. Reload to get back in. Your rank and settings are kept; this match ends.</p><div class="btn-row"><button class="btn-primary" type="button">Reload</button></div></div>';
      box.querySelector('button').addEventListener('click', () => location.reload());
      document.body.appendChild(box);
    }
    box.classList.remove('hidden');
  }, 3000);
}

try { boot(); } catch (err) {
  console.error(err);
  const l = $('loader');
  l.classList.remove('hidden');
  const m = l.querySelector('.load-msg'), gfx = /NO_3D|WebGL|context|Shader/i.test(String(err && err.message));
  m.textContent = '';
  const line = (t, tag = 'div') => { const e = document.createElement(tag); e.textContent = t; m.appendChild(e); return e; };
  if (gfx) {
    line('This browser couldn’t start 3D graphics, which the game needs.');
    line('Try: reload the page · update your browser, or use Chrome, Safari or Firefox · turn on “hardware acceleration” (or “graphics acceleration”) in the browser’s settings.').style.marginTop = '8px';
  } else line('Couldn’t start the game. Reload the page to try again.');
  line(`(${err && err.message})`, 'small').style.cssText = 'display:block;margin-top:10px;opacity:.6';
}
