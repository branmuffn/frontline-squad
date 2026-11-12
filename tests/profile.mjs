import { open } from './harness.mjs';
const { browser, page, errors } = await open({ stub: false, w: 1280, h: 720 });
const r = await page.evaluate(async () => {
  const G = window.__frontline.G; G.profile.xp = 12345; G.profile.career.kills = 77; G.profile.settings.volume = 0.33;
  document.getElementById('openCareer').click();
  return document.getElementById('career').classList.contains('hidden');
});
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), page.click('#exportProfile')]);
const fs = await import('fs'); const json = dl ? fs.readFileSync(await dl.path(), 'utf8') : null;
await page.click('#pasteProfile'); await page.fill('#pasteText', '{"hello":1}'); await page.click('#pasteGo');
const bad = await page.textContent('#saveMsg');
await page.fill('#pasteText', 'not json'); await page.click('#pasteGo'); const bad2 = await page.textContent('#saveMsg');
await page.screenshot({ path: '/tmp/b2.png' });
// wipe, then import the exported file
await page.evaluate(() => { const G = window.__frontline.G; G.profile.xp = 0; G.profile.career.kills = 0; });
await page.setInputFiles('#importFile', { name: 'p.json', mimeType: 'application/json', buffer: Buffer.from(json) });
await page.waitForTimeout(300); const ok = await page.textContent('#saveMsg');
const after = await page.evaluate(() => { const G = window.__frontline.G; return [G.profile.xp, G.profile.career.kills, G.profile.settings.volume, !!G.profile.loadout]; });
console.log({ hidden: r, downloaded: !!json, bytes: json && json.length, bad, bad2, ok, after, errors });
const pass = !!json && after[0] === 12345 && after[1] === 77 && !errors.length; // the exported file restores xp and kills
console.log(pass ? 'PASS profile' : 'FAIL profile');
process.exitCode = pass ? 0 : 1; // exit non-zero on FAIL
await browser.close();
