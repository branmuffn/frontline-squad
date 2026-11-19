import { encodeSn, encodeSt, decode } from './codec.js';
// WebRTC transport. Two ways to connect, both ending in a Link (reliable channel + unreliable "fast" channel):
//  1. Room code: a free public signaling broker (PeerJS cloud, library bundled) introduces the peers, then all
//     game traffic flows peer to peer. Google public STUN finds a direct route.
//  2. Manual codes: copy-paste an invite code and a reply code (no server at all; works offline on a LAN).
import { Peer } from 'peerjs';

const opts = () => window.__NET_OPTS || {}; // test hook: { signal: 'localhost:9000', nostun: true, nobroker: true, loopback: true }
// Test-only (__NET_OPTS.loopback): both pages run on one machine, so point our IPv4/mDNS host candidates at 127.0.0.1.
// Lets the mp tests connect where a firewall drops UDP to the LAN address (macOS firewall + headless Chromium). Real play
// never sets __NET_OPTS, so codes are untouched. Manual codes don't trickle: every candidate is in the SDP.
const HOST_CAND = /^(a=candidate:\S+ \d+ \S+ \d+ )(\d{1,3}(?:\.\d{1,3}){3}|[\w-]+\.local)( \d+ typ host)/gm;
const loSdp = (sdp) => (opts().loopback ? sdp.replace(HOST_CAND, (_, head, addr, tail) => head + '127.0.0.1' + tail) : sdp);
// STUN finds a direct route (works for most home networks). When both sides sit behind strict NATs (mobile hotspots,
// carrier-grade NAT, some office/school Wi-Fi) only a TURN relay can forward the traffic. PeerJS's free relay
// (eu-0/us-0.turn.peerjs.com) was shut down by the PeerJS team (late 2023; the names no longer resolve, checked
// 2026-11-15). Built-in relay (2026-11-19): the game's own Vercel function /api/turn hands out short-lived Cloudflare TURN
// logins (api/turn.js). It's fetched once when multiplayer starts, kept for the session, and skipped quietly when it
// isn't set up or can't be reached (offline file, local dev, tests): then only direct links work, as before.
const STUN = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
let RELAY = [];
let relayAsk = null;
export function loadRelay() {
  if (relayAsk) return relayAsk;
  const KEY = 'frontline_relay_v1';
  try { const c = JSON.parse(sessionStorage.getItem(KEY)); if (c && c.expires > Date.now()) { RELAY = c.iceServers; return (relayAsk = Promise.resolve()); } } catch {}
  if (opts().nostun || !/^https?:$/.test(location.protocol)) return (relayAsk = Promise.resolve());
  const ask = fetch('/api/turn', { signal: AbortSignal.timeout ? AbortSignal.timeout(2500) : undefined })
    .then((r) => (r.status === 200 ? r.json() : null))
    .then((j) => { if (j && Array.isArray(j.iceServers)) { RELAY = j.iceServers; try { sessionStorage.setItem(KEY, JSON.stringify(j)); } catch {} } })
    .catch(() => {});
  // never hold up a room for more than 2.5 s: if the relay is slow, connect without it
  relayAsk = Promise.race([ask, new Promise((r) => setTimeout(r, 2500))]);
  return relayAsk;
}
export function customTurn() {
  try { const t = (JSON.parse(localStorage.getItem('frontline_mp_v1')) || {}).turn; if (t && /^turns?:/.test(t.url || '')) return { urls: t.url.trim(), username: (t.user || '').trim(), credential: (t.pass || '').trim() }; } catch {}
  return null;
}
export const iceServers = () => { if (opts().nostun) return []; const c = customTurn(); return STUN.concat(c ? [c] : [], RELAY); };
// 'direct' or 'relay' once a link is up (shown next to the player's ping)
export async function routeOf(pc) {
  try {
    const st = await pc.getStats(); let pair = null; const by = new Map();
    st.forEach((r) => { by.set(r.id, r); if (r.type === 'transport' && r.selectedCandidatePairId) pair = r.selectedCandidatePairId; });
    if (!pair) st.forEach((r) => { if (r.type === 'candidate-pair' && r.state === 'succeeded' && (r.nominated || r.selected)) pair = r.id; });
    const lc = pair && by.get(by.get(pair).localCandidateId), rc = pair && by.get(by.get(pair).remoteCandidateId);
    if (!lc) return '';
    return lc.candidateType === 'relay' || (rc && rc.candidateType === 'relay') ? 'relay' : lc.candidateType === 'host' && rc && rc.candidateType === 'host' ? 'lan' : 'direct';
  } catch { return ''; }
}
const PREFIX = 'frontline-solo-ops-v1-';
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const newCode = () => Array.from({ length: 5 }, () => ALPHA[(Math.random() * ALPHA.length) | 0]).join('');
const FAST = { negotiated: true, id: 77, ordered: false, maxRetransmits: 0 };

function peerOpts() {
  const o = { config: { iceServers: iceServers() }, debug: 0 };
  const s = opts().signal;
  if (s) { const [host, port] = s.split(':'); Object.assign(o, { host, port: +port || 9000, path: '/', secure: false, key: 'peerjs' }); }
  return o;
}

// One connection to one peer. send() = reliable + ordered (events), sendFast() = unreliable (snapshots, states).
export class Link {
  constructor(sendRel, relOpen, pc, fast) {
    this._sendRel = sendRel; this._relOpen = relOpen; this.pc = pc; this.fast = fast;
    this.onmsg = null; this.onclose = null; this.closed = false; this.rtt = 0;
    this.heard = Date.now(); // last time anything arrived (net.js drops a link that goes silent)
    if (fast) { fast.binaryType = 'arraybuffer'; fast.onmessage = (e) => this._recv(e.data); }
    this.bytesOut = 0; this.bytesJson = 0; // traffic counters (binary vs what JSON would have cost)
    if (pc) pc.addEventListener('connectionstatechange', () => { if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this._end(); });
  }
  _recv(data) { if (this.closed) return; this.heard = Date.now(); if (!this.onmsg) return; let m; try { m = typeof data === 'string' ? JSON.parse(data) : decode(data); } catch { return; } if (!m) return; try { this.onmsg(m); } catch (e) { console.error(e); } }
  _end() { if (this.closed) return; this.closed = true; if (this.onclose) this.onclose(); }
  send(o) { if (!this.closed && this._relOpen()) { const j = JSON.stringify(o); this.bytesRel = (this.bytesRel || 0) + j.length; this._sendRel(j); } }
  sendFast(o) {
    const f = this.fast;
    if (f && f.readyState === 'open') {
      if (f.bufferedAmount >= 65536) return;
      const bin = o.t === 'sn' ? encodeSn(o) : o.t === 'st' ? encodeSt(o) : null; // the 30 Hz traffic goes binary
      if (bin) { f.send(bin); this.bytesOut += bin.byteLength; if (this.measure) this.bytesJson += JSON.stringify(o).length; } else f.send(JSON.stringify(o));
    } else this.send(o);
  }
  close() { try { this._close && this._close(); } catch {} try { this.pc && this.pc.close(); } catch {} this._end(); }
}

function fromPeerConn(conn) {
  return new Promise((resolve, reject) => {
    // The broker found the other device but no network route opened between them (no relay, see RELAY above).
    const t = setTimeout(() => reject(new Error(NO_ROUTE)), 20000);
    conn.on('open', () => {
      clearTimeout(t);
      const pc = conn.peerConnection;
      let fast = null; try { fast = pc.createDataChannel('fast', FAST); } catch { fast = null; }
      const L = new Link((s) => conn.send(s), () => conn.open, pc, fast);
      L._close = () => conn.close();
      conn.on('data', (d) => L._recv(typeof d === 'string' ? d : String(d)));
      conn.on('close', () => L._end());
      conn.on('error', () => L._end());
      resolve(L);
    });
    conn.on('error', (e) => { clearTimeout(t); reject(e); });
  });
}

const NO_ROUTE = 'Found the host, but your two networks wouldn’t link. Put both devices on the same Wi-Fi (on a phone, turn off mobile data) and try again.';
const brokerMsg = (e) => e && e.type === 'peer-unavailable' ? 'Room not found. Check the code (and that the host is still in the lobby).'
  : e && ['network', 'server-error', 'socket-error', 'socket-closed', 'unavailable-id'].includes(e.type) ? 'Can’t reach the matchmaking server. Use manual codes below.'
  : e && e.type === 'browser-incompatible' ? 'This browser doesn’t support WebRTC.' : (e && e.message) || 'Connection failed';

// Host: register a room code with the broker; every joiner arrives as a Link through onLink.
export function hostRoom(onLink, onStatus, want) {
  let peer = null, code = null, dead = false;
  const start = () => {
    if (dead) return;
    code = want || newCode(); want = null; // a migrating host takes over a known code
    peer = new Peer(PREFIX + code, peerOpts());
    peer.on('open', () => onStatus('ready', code));
    peer.on('connection', (conn) => fromPeerConn(conn).then(onLink).catch(() => {}));
    peer.on('error', (e) => {
      if (dead) return;
      if (e.type === 'unavailable-id') { peer.destroy(); start(); return; }
      if (e.type === 'peer-unavailable') return;
      onStatus('error', brokerMsg(e));
    });
    peer.on('disconnected', () => { if (!dead) setTimeout(() => { try { if (!dead && peer.disconnected && !peer.destroyed) peer.reconnect(); } catch {} }, 2000); });
  };
  loadRelay().then(start);
  return { get code() { return code; }, close() { dead = true; try { peer && peer.destroy(); } catch {} } };
}

// Client: connect to a room code. Resolves with a Link.
export function joinRoom(code) {
  let peer = null, cancelled = false;
  const p = loadRelay().then(() => new Promise((resolve, reject) => {
    if (cancelled) return reject(new Error('Cancelled.'));
    peer = new Peer(peerOpts());
    const t = setTimeout(() => reject(new Error('No answer from the host. Check the code, and that the host is still in the lobby.')), 25000);
    peer.on('open', () => {
      const conn = peer.connect(PREFIX + code.trim().toUpperCase(), { serialization: 'raw', reliable: true });
      fromPeerConn(conn).then((L) => { clearTimeout(t); L.peer = peer; resolve(L); }).catch((e) => { clearTimeout(t); reject(new Error(brokerMsg(e))); });
    });
    peer.on('error', (e) => { clearTimeout(t); reject(new Error(brokerMsg(e))); });
  }));
  p.cancel = () => { cancelled = true; try { peer && peer.destroy(); } catch {} };
  return p;
}

// ---------- manual copy-paste codes ----------
async function pack(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let out = bytes, tag = 'FL1';
  if (typeof CompressionStream !== 'undefined') {
    out = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()); tag = 'FL1Z';
  }
  let s = ''; for (const b of out) s += String.fromCharCode(b);
  return tag + '.' + btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function unpack(code) {
  const [tag, body] = String(code).trim().replace(/\s+/g, '').split('.');
  if (!body || (tag !== 'FL1' && tag !== 'FL1Z')) throw new Error('That isn’t a Frontline connection code.');
  const bin = atob(body.replace(/-/g, '+').replace(/_/g, '/'));
  let bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  if (tag === 'FL1Z') bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
  return JSON.parse(new TextDecoder().decode(bytes));
}
function gathered(pc) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((r) => {
    const t = setTimeout(r, 4500); // relay candidates can take a moment
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); r(); } });
  });
}
function rawPair() {
  const pc = new RTCPeerConnection({ iceServers: iceServers() });
  const rel = pc.createDataChannel('rel', { negotiated: true, id: 0 });
  const fast = pc.createDataChannel('fast', { negotiated: true, id: 1, ordered: false, maxRetransmits: 0 });
  const L = new Link((s) => rel.send(s), () => rel.readyState === 'open', pc, fast);
  rel.onmessage = (e) => L._recv(e.data);
  rel.onclose = () => L._end();
  const opened = new Promise((res, rej) => { rel.onopen = () => res(L); setTimeout(() => rej(new Error('Couldn’t connect. Make a fresh code and try again.')), 30000); });
  return { pc, L, opened };
}
// Host side: make an invite code; accept(replyCode) resolves with the Link.
export async function manualInvite() {
  await loadRelay();
  const { pc, opened } = rawPair();
  await pc.setLocalDescription(await pc.createOffer());
  await gathered(pc);
  const code = await pack({ k: 'o', sdp: loSdp(pc.localDescription.sdp) });
  return {
    code,
    async accept(reply) {
      const r = await unpack(reply); if (r.k !== 'a') throw new Error('Paste the REPLY code from your friend here.');
      await pc.setRemoteDescription({ type: 'answer', sdp: r.sdp });
      return opened;
    },
    close() { try { pc.close(); } catch {} },
  };
}
// Joiner side: take the invite code, return a reply code plus a promise of the Link.
export async function manualReply(invite) {
  const r = await unpack(invite); if (r.k !== 'o') throw new Error('Paste the INVITE code from the host here.');
  await loadRelay();
  const { pc, opened } = rawPair();
  await pc.setRemoteDescription({ type: 'offer', sdp: r.sdp });
  await pc.setLocalDescription(await pc.createAnswer());
  await gathered(pc);
  return { code: await pack({ k: 'a', sdp: loSdp(pc.localDescription.sdp) }), link: opened, close() { try { pc.close(); } catch {} } };
}
