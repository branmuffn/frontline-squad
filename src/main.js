import { G, isLive } from './core/state.js';
import { loadProfile, saveProfile } from './core/storage.js';
import { $ } from './core/util.js';
import { initInput, input, matches, requestLock, exitLock, isLocked, clearInput } from './core/input.js';
import { initRenderer, render, resize } from './engine/render.js';
import { initFx, updateFx } from './engine/fx.js';
import { initAudio, setVolume, play, ambienceTick } from './engine/audio.js';
import { setScene, stinger, setMusicVolume, musicScene } from './engine/music.js';
import { loadMap, setShadows } from './world/maps/index.js';
import { initViewmodel, setCamo } from './entities/viewmodel.js';
import { spawnPlayer, knifeSlot, updatePlayer, selectSlot, swapLast, cycleWeapon, startReload, grenadePress, grenadeRelease, onJumpPressed, onMouseDown, equipWeapon, refillAmmo } from './entities/player.js';
import { updateRockets, rockets } from './entities/projectiles.js';
import * as ballistics from './entities/ballistics.js';
const { updateBullets, bullets } = ballistics;
import * as worldprops from './entities/worldprops.js';
const { updateWorldProps, tryPickup } = worldprops;
import { updateBots } from './entities/ai.js';
import { separateUnits } from './entities/units.js';
import { updateGrenades } from './entities/grenades.js';
import { updatePickups } from './entities/pickups.js';
import { updateStreaks, useStreak, grantStreak } from './entities/streaks.js';
import { startMatch, updateMatch, abandonMatch, pickSpawn, endMatch } from './game/match.js';
import { initHud, updateHud, toggleBoard, setFps, setWeapon as setWeaponHud } from './ui/hud.js';
import { setNameStyle } from './core/config.js';
import { initMenus, showScreen, showPause, showArmory, showLoadout } from './ui/menus.js';
import * as physics from './world/physics.js';
import * as nav from './world/nav.js';
import { toggleColliderDebug, syncColliderDebug } from './world/debugcol.js';
import { damage, kill } from './entities/units.js';

let wantResume = false, lastCfg = null;

function boot() {
  if (!window.WebGLRenderingContext) throw new Error('WebGL is not available in this browser.');
  loadProfile();
  initRenderer($('game'));
  initFx();
  initViewmodel();
  loadMap(G.profile.lobby.map);
  initHud();
  applySetting('crosshair'); applySetting('showFps'); setNameStyle(G.profile.settings.names);
  initInput(G.renderer.domElement, {
    inGame: () => isLive() || G.state === 'paused',
    onKeyDown, onKeyUp, onMouseDown, onWheel: (d) => { if (G.state === 'playing') cycleWeapon(d); },
    onLockChange, onLockError, onCanvasClick, onBlur: () => { if (isLive() && !input.freeLook) pause(false); },
  });
  initMenus({
    onDeploy: deploy, onResume: resume, onFreeLook: () => { input.freeLook = true; resume(); },
    onRestart: () => { if (lastCfg) deploy(lastCfg); }, onQuit: quit, onRedeploy: redeploy,
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
  window.__frontline = { G, physics, nav, loadMap, deploy, damage, input, rockets, bullets, ballistics, worldprops, musicScene, toggleColliderDebug, endMatch, ui: { showScreen, showPause, showArmory, showLoadout } };
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
  if (k === 'renderScale') resize();
  if (k === 'showFps') $('fps').classList.toggle('hidden', !s.showFps);
  if (k === 'crosshair') document.documentElement.style.setProperty('--ch', s.crosshair);
  if (k === 'fov' && !isLive()) { G.camera.fov = s.fov; G.camera.updateProjectionMatrix(); }
}

function deploy(cfg) {
  lastCfg = cfg;
  initAudio(); setVolume(G.profile.settings.volume); setMusicVolume(G.profile.settings.music);
  setScene(null); stinger('start'); // no music in a match, just the cue
  startMatch(cfg); syncColliderDebug();
  showScreen(null);
  wantResume = false;
  if (!input.freeLook) requestLock();
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
  if (a.weapon) equipWeapon(a.weapon);
  else if (a.action === 'refill') { refillAmmo(); P.grenades = 3; }
  else if (a.action === 'heal') P.health = P.maxHealth;
  else if (a.action && a.action !== 'close') grantStreak(a.action);
  armoryOpen = false;
  resume();
}

function pause(lockError) {
  if (!isLive()) return;
  G.pausedFrom = G.state; G.state = 'paused';
  clearInput(); toggleBoard(false);
  if (G.player && G.player.cookStart >= 0) grenadeRelease();
  showPause(lockError);
}
function resume() {
  if (G.state !== 'paused') return;
  initAudio();
  if (input.freeLook || isLocked()) { G.state = G.pausedFrom; showScreen(null); return; }
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
function quit() {
  armoryOpen = false;
  abandonMatch(); exitLock(); input.freeLook = false;
  showScreen('menu'); setScene('menu');
}

function onLockChange(locked) {
  if (locked) {
    if (G.state === 'paused' && wantResume) { G.state = G.pausedFrom; showScreen(null); }
    wantResume = false;
  } else if (isLive() && !input.freeLook) pause(false);
}
function onLockError() {
  wantResume = false;
  if (isLive()) pause(true); else if (G.state === 'paused') showPause(true);
}
function onCanvasClick() {
  if (G.state === 'paused') resume();
  else if (isLive() && !isLocked() && !input.freeLook) requestLock();
}

function onKeyDown(code, e) {
  if (!(isLive() || G.state === 'paused')) return;
  if (code === 'F9') { e.preventDefault(); toggleColliderDebug(); return; }
  if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code) || Object.values(G.profile.settings.keys).includes(code)) e.preventDefault();
  if (armoryOpen && (code === 'Escape' || matches('armory', code))) { onArmory({ action: 'close' }); return; }
  if (code === 'Escape' && input.freeLook && isLive()) { pause(false); return; }
  if (!isLive()) return;
  if (matches('scoreboard', code)) toggleBoard(true);
  if (e.repeat) return;
  if (matches('jump', code)) onJumpPressed();
  if (G.state !== 'playing') return;
  if (matches('reload', code)) startReload();
  else if (matches('primary', code)) selectSlot(0);
  else if (matches('secondary', code)) selectSlot(1);
  else if (matches('melee', code)) selectSlot(2);
  else if (matches('slot4', code)) selectSlot(knifeSlot());
  else if (matches('swap', code)) swapLast();
  else if (matches('grenade', code)) grenadePress();
  else if (matches('streak', code)) useStreak();
  else if (matches('interact', code)) { const H = G.match.hook; if (!(H && H.interact && H.interact())) tryPickup(); }
  else if (matches('armory', code) && G.match.mode === 'sandbox') openArmory();
}
function onKeyUp(code) {
  if (matches('scoreboard', code)) toggleBoard(false);
  if (matches('grenade', code)) grenadeRelease();
}

let prev = performance.now(), fpsAcc = 0, fpsN = 0, menuT = 0;
function loop(t) {
  requestAnimationFrame(loop);
  const raw = Math.max(0.0001, (t - prev) / 1000), dt = Math.min(0.05, raw); prev = t;
  G.realTime += dt;
  fpsAcc += raw; fpsN++;
  if (fpsAcc > 0.5) { G.fps = Math.round(fpsN / fpsAcc); setFps(G.fps); fpsAcc = 0; fpsN = 0; }
  if (isLive()) {
    G.now += dt;
    updateMatch(dt);
    if (isLive()) {
      updatePlayer(dt);
      updateBots(dt);
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
      updatePickups(dt);
      updateStreaks(dt);
      updateHud(dt);
      ambienceTick(dt, G.world.def.ambience);
    }
  } else if (G.state === 'menu') {
    menuT += dt;
    const b = G.world.bounds, r = (b.maxX - b.minX) * 0.42, a = menuT * 0.05;
    G.camera.position.set(Math.sin(a) * r, 15 + Math.sin(menuT * 0.11) * 2, Math.cos(a) * r);
    G.camera.rotation.set(-0.36, a, 0);
    if (Math.abs(G.camera.fov - 62) > 0.1) { G.camera.fov = 62; G.camera.updateProjectionMatrix(); }
  }
  if (G.mapGroup) { const cl = G.mapGroup.getObjectByName('clouds'); if (cl) cl.material.map.offset.x += dt * 0.0015; }
  updateFx(dt);
  render(isLive() && G.player && G.player.alive || (G.state === 'paused' && G.player && G.player.alive));
}

try { boot(); } catch (err) {
  console.error(err);
  const l = $('loader');
  l.classList.remove('hidden');
  l.querySelector('.load-msg').textContent = `Couldn’t start the game: ${err.message}. Try a browser with WebGL enabled, then reload.`;
}
