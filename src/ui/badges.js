// Procedural rank insignia (SVG). Enlisted: chevrons/rockers, officers: bars, leaves, eagle, stars.
const GOLD = '#d9a441', SILVER = '#c9ced1', DARK = '#1c2326';

function chevrons(n, rockers, star) {
  let s = '';
  const total = n * 7 + 6 + rockers * 6 + (rockers ? 6 : 0), y0 = 32 - total / 2;
  for (let i = 0; i < n; i++) { const y = y0 + i * 7; s += `<path d="M12 ${y + 7} L32 ${y} L52 ${y + 7} L52 ${y + 11} L32 ${y + 4} L12 ${y + 11} Z" fill="${GOLD}"/>`; }
  for (let i = 0; i < rockers; i++) { const y = y0 + n * 7 + 7 + i * 6; s += `<path d="M12 ${y} Q32 ${y + 7} 52 ${y} L52 ${y + 3.5} Q32 ${y + 10.5} 12 ${y + 3.5} Z" fill="${GOLD}"/>`; }
  if (star) s += starPath(32, y0 + 13, 4.5, DARK);
  return s;
}
function starPath(cx, cy, r, fill) {
  let d = '';
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.42 : r; d += (i ? 'L' : 'M') + (cx + Math.cos(a) * rr).toFixed(1) + ' ' + (cy + Math.sin(a) * rr).toFixed(1); }
  return `<path d="${d}Z" fill="${fill}"/>`;
}
function bars(n, col) { let s = ''; for (let i = 0; i < n; i++) s += `<rect x="${n === 1 ? 26 : 18 + i * 16}" y="16" width="12" height="32" rx="2" fill="${col}"/>`; return s; }
function leaf(col) { return `<path d="M32 12 C44 22 46 36 32 52 C18 36 20 22 32 12 Z" fill="${col}"/><path d="M32 18 L32 54" stroke="${DARK}" stroke-width="2"/>`; }
function eagle() { return `<path d="M32 22 L40 18 L56 22 L44 28 L50 34 L38 32 L32 46 L26 32 L14 34 L20 28 L8 22 L24 18 Z" fill="${SILVER}"/>`; }
function stars(n) { let s = ''; const gap = 14, x0 = 32 - (n - 1) * gap / 2; for (let i = 0; i < n; i++) s += starPath(x0 + i * gap, 32, n > 3 ? 6 : 8, SILVER); return s; }

const DEFS = [
  () => `<path d="M20 20 L44 20 L44 36 L32 46 L20 36 Z" fill="none" stroke="${GOLD}" stroke-width="3"/>`,
  () => chevrons(1, 0), () => chevrons(1, 1),
  () => `<path d="M14 22 Q32 12 50 22 L50 38 Q32 52 14 38 Z" fill="${GOLD}"/>${starPath(32, 31, 7, DARK)}`,
  () => chevrons(2, 0), () => chevrons(3, 0), () => chevrons(3, 1), () => chevrons(3, 2), () => chevrons(3, 3), () => chevrons(3, 3, true),
  () => bars(1, GOLD), () => bars(1, SILVER), () => bars(2, SILVER), () => leaf(GOLD), () => leaf(SILVER), () => eagle(),
  () => stars(1), () => stars(2), () => stars(3), () => stars(4),
];

export function badgeSVG(rank, size = 44) {
  const body = (DEFS[rank] || DEFS[0])();
  return `<svg class="badge" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true"><rect x="2" y="2" width="60" height="60" rx="6" fill="${DARK}" stroke="rgba(232,227,211,.25)" stroke-width="2"/>${body}</svg>`;
}
