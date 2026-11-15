// Build label shown in the menu and lobby, so friends can check they run the same version before playing together.
// Full clones: "build <commit count + 1>". Shallow clones (Vercel clones only the last few commits, so the count would
// restart near 10): the short commit id instead. Inputs are injectable for tests/buildlabel.mjs.
import { execSync } from 'node:child_process';

export function buildLabel({ run = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim(), env = process.env, date = new Date() } = {}) {
  const day = date.toISOString().slice(0, 10);
  let id;
  try {
    const shallow = run('git rev-parse --is-shallow-repository') === 'true';
    id = shallow ? (env.VERCEL_GIT_COMMIT_SHA || run('git rev-parse HEAD')).slice(0, 7) : String(+run('git rev-list --count HEAD') + 1);
  } catch {
    id = '0';
  }
  return `build ${id} · ${day}`;
}
