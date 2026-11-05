// Shared runtime context. Modules import G and read/write the parts they own.
export const G = {
  perf: { calls: 0, tris: 0, ms: 0, up: 0 },
  renderer: null, scene: null, camera: null, vmScene: null, vmCamera: null,
  world: null,        // current map runtime (colliders, nav, spawns...)
  mapGroup: null,
  units: [],          // player + bots (+ nothing else)
  player: null,
  bots: [],
  match: null,
  profile: null,
  state: 'boot',      // boot | menu | deploy | playing | dead | intermission | paused | ended
  pausedFrom: null,
  now: 0,             // match clock (seconds, only advances while live)
  realTime: 0,
  noise: [],          // recent audible events for AI hearing
  fps: 60,
};
export const isLive = () => G.state === 'deploy' || G.state === 'playing' || G.state === 'dead' || G.state === 'intermission';
