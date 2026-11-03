import { open } from './harness.mjs';
export async function shotSession() {
  const s = await open({ stub: false, w: 1280, h: 720 });
  s.prep = async (cfg, steps = 200) => s.page.evaluate(([cfg, steps]) => { const F = window.__frontline, G = F.G; F.input.freeLook = true;
    G.profile.settings.renderScale = 0.1; window.dispatchEvent(new Event('resize')); F.deploy(cfg); window.__step(steps); }, [cfg, steps]);
  s.shot = async (file, fn, arg) => { if (fn) await s.page.evaluate(fn, arg); await s.page.evaluate(() => { const G = window.__frontline.G; G.profile.settings.renderScale = 1; window.dispatchEvent(new Event('resize')); window.__step(2); });
    await s.page.screenshot({ path: file }); await s.page.evaluate(() => { const G = window.__frontline.G; G.profile.settings.renderScale = 0.1; window.dispatchEvent(new Event('resize')); }); };
  return s;
}
