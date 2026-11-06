// Bot pathfinding on a second CPU core (3f). The A* graph search runs in a Web Worker on a compact copy of the nav
// graph; the main thread only does the cheap string-pulling. Off in the headless test harness (its fake clock and
// synchronous stepping can't wait for worker replies); a reply that hasn't arrived within 0.4 s of game time falls
// back to the normal synchronous search, so bots never stall.
import { G } from '../core/state.js';

const SRC = `let X, Y, Z, ES, E, C, N = 0;
onmessage = (ev) => { const m = ev.data;
  if (m.t === 'graph') { X = m.x; Y = m.y; Z = m.z; ES = m.es; E = m.e; C = m.c; N = X.length; return; }
  if (!N) return; const a = m.a, b = m.b, g = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N), heap = [], hf = [];
  const H = (n) => Math.hypot(X[n] - X[b], Z[n] - Z[b]) + Math.abs(Y[n] - Y[b]);
  const push = (id, f) => { heap.push(id); hf.push(f); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= hf[i]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; [hf[p], hf[i]] = [hf[i], hf[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(), lf = hf.pop(); if (heap.length) { heap[0] = last; hf[0] = lf; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let mm = i; if (l < heap.length && hf[l] < hf[mm]) mm = l; if (r < heap.length && hf[r] < hf[mm]) mm = r; if (mm === i) break; [heap[mm], heap[i]] = [heap[i], heap[mm]]; [hf[mm], hf[i]] = [hf[i], hf[mm]]; i = mm; } } return top; };
  g[a] = 0; push(a, H(a)); let found = false, it = 0;
  while (heap.length && it++ < 6000) { const c = pop(); if (closed[c]) continue; closed[c] = 1; if (c === b) { found = true; break; }
    for (let k = ES[c]; k < ES[c + 1]; k++) { const e = E[k], ng = g[c] + C[k]; if (ng < g[e]) { g[e] = ng; from[e] = c; push(e, ng + H(e)); } } }
  const ids = []; if (found) for (let c = b; c !== -1; c = from[c]) ids.push(c);
  postMessage({ q: m.q, ids: ids.reverse() }); };`;

let worker = null, seq = 0; const pending = new Map();
export const navWorkerOn = () => !!worker;
export function initNavWorker(nav) {
  if (typeof Worker === 'undefined' || typeof window === 'undefined' || window.__step || !nav) { worker = null; return; }
  try {
    if (!worker) { worker = new Worker(URL.createObjectURL(new Blob([SRC], { type: 'text/javascript' }))); worker.onmessage = (ev) => { const cb = pending.get(ev.data.q); pending.delete(ev.data.q); if (cb) cb(ev.data.ids); }; }
    const n = nav.nodes, N = n.length, x = new Float32Array(N), y = new Float32Array(N), z = new Float32Array(N), es = new Int32Array(N + 1);
    let tot = 0; for (let i = 0; i < N; i++) { x[i] = n[i].x; y[i] = n[i].y; z[i] = n[i].z; es[i] = tot; tot += n[i].edges.length; } es[N] = tot;
    const e = new Int32Array(tot), c = new Float32Array(tot); let k = 0; for (const nd of n) for (let j = 0; j < nd.edges.length; j++) { e[k] = nd.edges[j]; c[k++] = nd.cost[j]; }
    pending.clear(); worker.postMessage({ t: 'graph', x, y, z, es, e, c }, [x.buffer, y.buffer, z.buffer, es.buffer, e.buffer, c.buffer]);
  } catch (err) { worker = null; }
}
// ask for a node path a -> b; cb(ids) runs when the worker answers
export function requestPath(a, b, cb) { const q = ++seq; pending.set(q, cb); worker.postMessage({ q, a, b }); return q; }
