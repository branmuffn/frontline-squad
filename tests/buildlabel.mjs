// The build label keeps working on Vercel's shallow clones (2026-11-15: the commit count there restarted at 11).
import { buildLabel } from '../scripts/build-label.mjs';
const date = new Date('2026-11-15T12:00:00Z');
const fake = (answers) => (cmd) => { if (!(cmd in answers)) throw new Error('no git'); return answers[cmd]; };
const cases = [
  ['full clone counts commits', buildLabel({ date, env: {}, run: fake({ 'git rev-parse --is-shallow-repository': 'false', 'git rev-list --count HEAD': '121' }) }), 'build 122 · 2026-11-15'],
  ['Vercel shallow clone uses the commit id', buildLabel({ date, env: { VERCEL_GIT_COMMIT_SHA: '7c5b41049a1b' }, run: fake({ 'git rev-parse --is-shallow-repository': 'true' }) }), 'build 7c5b410 · 2026-11-15'],
  ['other shallow clone reads HEAD', buildLabel({ date, env: {}, run: fake({ 'git rev-parse --is-shallow-repository': 'true', 'git rev-parse HEAD': 'abcdef123456' }) }), 'build abcdef1 · 2026-11-15'],
  ['no git at all', buildLabel({ date, env: {}, run: fake({}) }), 'build 0 · 2026-11-15'],
];
let bad = 0;
for (const [name, got, want] of cases) { const ok = got === want; if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` (got "${got}")`}`); }
console.log(bad ? `buildlabel: ${bad} FAILED` : 'buildlabel: all passed');
process.exit(bad ? 1 : 0);
