// Compact binary encoding for the two 30 Hz messages (host snapshot 'sn', joiner state 'st'). Units are packed into
// 20 bytes each (positions to 2 cm, angles to 0.006°); everything else rides along as a small JSON tail, and the host
// only sends doors/barrels/pickups when they change (plus a full keyframe every 10th snapshot).
const TAU = Math.PI * 2, te = new TextEncoder(), td = new TextDecoder();
const ang16 = (a) => Math.round((((a % TAU) + TAU) % TAU) / TAU * 65535), unang = (v) => v / 65535 * TAU;
const i16 = (v, k) => Math.max(-32768, Math.min(32767, Math.round(v * k)));
function tail(dv, o, obj) { const b = te.encode(JSON.stringify(obj)); dv.setUint16(o, b.length, true); new Uint8Array(dv.buffer, o + 2, b.length).set(b); return o + 2 + b.length; }
const readTail = (dv, o) => { const n = dv.getUint16(o, true); return n ? JSON.parse(td.decode(new Uint8Array(dv.buffer, o + 2, n))) : {}; };
export function encodeSn(s) {
  const extra = { m: s.m, dr: s.dr, br: s.br, pk: s.pk }, vh = s.vh || [], sh = (s.sh || []).slice(0, 255);
  const tb = te.encode(JSON.stringify(extra)), buf = new ArrayBuffer(1 + 4 + 1 + s.u.length * 20 + 1 + vh.length * 32 + 1 + sh.length * 15 + 2 + tb.length), dv = new DataView(buf);
  let o = 0; dv.setUint8(o++, 1); dv.setFloat32(o, s.n, true); o += 4; dv.setUint8(o++, s.u.length);
  for (const a of s.u) { // [id, x, y, z, yaw, p, c, ms, f, hp, k, d, w, veh]
    dv.setUint16(o, a[0], true); dv.setInt16(o + 2, i16(a[1], 50), true); dv.setInt16(o + 4, i16(a[2], 100), true); dv.setInt16(o + 6, i16(a[3], 50), true);
    dv.setUint16(o + 8, ang16(a[4]), true); dv.setInt16(o + 10, i16(a[5], 10000), true); dv.setUint8(o + 12, Math.round(Math.max(0, Math.min(1, a[6])) * 255));
    dv.setUint8(o + 13, Math.min(255, Math.round(a[7] * 20))); dv.setUint8(o + 14, a[8] & 255); dv.setUint8(o + 15, Math.min(255, a[9]));
    dv.setUint8(o + 16, Math.min(255, a[10])); dv.setUint8(o + 17, Math.min(255, a[11])); dv.setUint8(o + 18, a[12] & 255); dv.setUint8(o + 19, a[13] ? 1 : 0); o += 20;
  }
  dv.setUint8(o++, vh.length);
  for (const a of vh) { // [vid, alive, x, y, z, yaw, pitch, roll, speed, steer, gunYaw, gunPitch, rotorSpeed, hp, seat0, seat1]
    dv.setUint8(o, a[0]); dv.setUint8(o + 1, a[1]); dv.setInt16(o + 2, i16(a[2], 50), true); dv.setInt16(o + 4, i16(a[3], 100), true); dv.setInt16(o + 6, i16(a[4], 50), true);
    dv.setUint16(o + 8, ang16(a[5]), true); dv.setInt16(o + 10, i16(a[6], 10000), true); dv.setInt16(o + 12, i16(a[7], 10000), true); dv.setInt16(o + 14, i16(a[8], 100), true);
    dv.setInt16(o + 16, i16(a[9], 10000), true); dv.setUint16(o + 18, ang16(a[10]), true); dv.setInt16(o + 20, i16(a[11], 10000), true); dv.setInt16(o + 22, i16(a[12], 100), true);
    dv.setUint16(o + 24, Math.max(0, Math.min(65535, a[13])), true); dv.setUint16(o + 26, a[14], true); dv.setUint16(o + 28, a[15], true); o += 32;
  }
  dv.setUint8(o++, sh.length);
  for (const a of sh) { dv.setInt16(o, a[0], true); dv.setUint8(o + 2, a[1] & 255); for (let i = 0; i < 6; i++) dv.setInt16(o + 3 + i * 2, i16(a[2 + i], i % 3 === 1 ? 100 : 50), true); o += 15; } // [id, weapon, muzzle xyz, end xyz]
  dv.setUint16(o, tb.length, true); new Uint8Array(buf, o + 2, tb.length).set(tb);
  return buf;
}
export function encodeSt(s) { // { q, n, x, y, z, yaw, p, c, ms, f, w, v }
  const buf = new ArrayBuffer(1 + 2 + 4 + 6 + 2 + 2 + 1 + 1 + 1 + 1 + 2 + (s.v ? 200 : 0) + 2), dv = new DataView(buf);
  let o = 0; dv.setUint8(o++, 2); dv.setUint16(o, s.q & 65535, true); o += 2; dv.setFloat32(o, s.n, true); o += 4;
  dv.setInt16(o, i16(s.x, 50), true); dv.setInt16(o + 2, i16(s.y, 100), true); dv.setInt16(o + 4, i16(s.z, 50), true); o += 6;
  dv.setUint16(o, ang16(s.yaw), true); dv.setInt16(o + 2, i16(s.p, 10000), true); o += 4;
  dv.setUint8(o++, Math.round(Math.max(0, Math.min(1, s.c)) * 255)); dv.setUint8(o++, Math.min(255, Math.round(s.ms * 20))); dv.setUint8(o++, s.f & 255); dv.setUint8(o++, (s.w + 1) & 255);
  o = s.v ? tail(dv, o, s.v) : (dv.setUint16(o, 0, true), o + 2);
  return buf.slice(0, o);
}
export function decode(buf) {
  const dv = new DataView(buf); let o = 0; const type = dv.getUint8(o++);
  if (type === 1) {
    const n = dv.getFloat32(o, true); o += 4; const cnt = dv.getUint8(o++), u = [];
    for (let i = 0; i < cnt; i++, o += 20) u.push([dv.getUint16(o, true), dv.getInt16(o + 2, true) / 50, dv.getInt16(o + 4, true) / 100, dv.getInt16(o + 6, true) / 50, unang(dv.getUint16(o + 8, true)),
      dv.getInt16(o + 10, true) / 10000, dv.getUint8(o + 12) / 255, dv.getUint8(o + 13) / 20, dv.getUint8(o + 14), dv.getUint8(o + 15), dv.getUint8(o + 16), dv.getUint8(o + 17), dv.getUint8(o + 18), dv.getUint8(o + 19)]);
    const vc = dv.getUint8(o++), vh = [];
    for (let i = 0; i < vc; i++, o += 32) vh.push([dv.getUint8(o), dv.getUint8(o + 1), dv.getInt16(o + 2, true) / 50, dv.getInt16(o + 4, true) / 100, dv.getInt16(o + 6, true) / 50, unang(dv.getUint16(o + 8, true)),
      dv.getInt16(o + 10, true) / 10000, dv.getInt16(o + 12, true) / 10000, dv.getInt16(o + 14, true) / 100, dv.getInt16(o + 16, true) / 10000, unang(dv.getUint16(o + 18, true)), dv.getInt16(o + 20, true) / 10000,
      dv.getInt16(o + 22, true) / 100, dv.getUint16(o + 24, true), dv.getUint16(o + 26, true), dv.getUint16(o + 28, true)]);
    const sc = dv.getUint8(o++), sh = [];
    for (let i = 0; i < sc; i++, o += 15) { const a = [dv.getInt16(o, true), dv.getUint8(o + 2)]; if (a[1] === 255) a[1] = -1; for (let j = 0; j < 6; j++) a.push(dv.getInt16(o + 3 + j * 2, true) / (j % 3 === 1 ? 100 : 50)); sh.push(a); }
    return { t: 'sn', n, u, vh: vc ? vh : undefined, sh: sc ? sh : undefined, ...readTail(dv, o) };
  }
  if (type === 2) {
    const q = dv.getUint16(o, true); o += 2; const n = dv.getFloat32(o, true); o += 4;
    const m = { t: 'st', q, n, x: dv.getInt16(o, true) / 50, y: dv.getInt16(o + 2, true) / 100, z: dv.getInt16(o + 4, true) / 50 }; o += 6;
    m.yaw = unang(dv.getUint16(o, true)); m.p = dv.getInt16(o + 2, true) / 10000; o += 4;
    m.c = dv.getUint8(o++) / 255; m.ms = dv.getUint8(o++) / 20; m.f = dv.getUint8(o++); m.w = dv.getUint8(o++) - 1;
    const t = dv.getUint16(o, true); if (t) m.v = readTail(dv, o);
    return m;
  }
  return null;
}
