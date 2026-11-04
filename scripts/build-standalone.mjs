import { execSync } from 'child_process';
// Bundles the same source into one fully offline HTML file: three.js r128 and the Barlow Condensed font are inlined.
import { build } from 'esbuild';
import fs from 'node:fs';

const res = await build({
  entryPoints: ['src/main.js'], bundle: true, format: 'iife', minify: true, write: false,
  alias: { three: './src/vendor/three-global.cjs' }, target: 'es2019', legalComments: 'none',
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync('src/styles.css', 'utf8');
const fonts = fs.readFileSync('src/fonts.css', 'utf8').replace(/url\('\.\/(vendor\/fonts\/[^']+\.woff2)'\)/g, (_, f) => `url(data:font/woff2;base64,${fs.readFileSync('src/' + f).toString('base64')})`);
const three = fs.readFileSync('node_modules/three/build/three.min.js', 'utf8').replace(/<\/script/gi, '<\\/script');
let html = fs.readFileSync('index.html', 'utf8');
html = html.replace('<link rel="stylesheet" href="/src/fonts.css">\n', () => `<style>\n${fonts}</style>\n`);
html = html.replace('<link rel="stylesheet" href="/src/styles.css">', () => `<style>\n${css}</style>`);
if (/https?:\/\//.test(html.replace(/http:\/\/www\.w3\.org\/[^"']*/g, ''))) console.warn('WARNING: external URL left in the standalone build');
// build label (menu + lobby): lets friends check they run the same version
let n = 0; try { n = +execSync('git rev-list --count HEAD', { encoding: 'utf8' }).trim() + 1; } catch { n = 0; }
const BUILD = `build ${n} · ${new Date().toISOString().slice(0, 10)}`;
html = html.replace('<script type="module" src="/src/main.js"></script>', () =>
  `<script>window.__BUILD=${JSON.stringify(BUILD)};</script>\n<script>\n${three}\n</script>\n<script>\n${js}\n</script>`);
fs.mkdirSync('dist-standalone', { recursive: true });
fs.writeFileSync('dist-standalone/frontline_solo_ops.html', html);
console.log(`dist-standalone/frontline_solo_ops.html  ${(html.length / 1024).toFixed(1)} KB`);
