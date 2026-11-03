// Bundles the same source into one self-contained HTML file (three.js r128 from cdnjs).
import { build } from 'esbuild';
import fs from 'node:fs';

const res = await build({
  entryPoints: ['src/main.js'], bundle: true, format: 'iife', minify: true, write: false,
  alias: { three: './src/vendor/three-global.cjs' }, target: 'es2019', legalComments: 'none',
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync('src/styles.css', 'utf8');
let html = fs.readFileSync('index.html', 'utf8');
html = html.replace('<link rel="stylesheet" href="/src/styles.css">', () => `<style>\n${css}</style>`);
html = html.replace('<script type="module" src="/src/main.js"></script>', () =>
  `<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>\n<script>\nif (window.THREE) {\n${js}\n} else { document.querySelector('.load-msg').textContent = 'The 3D engine couldn\u2019t load. Check your internet connection, then reload the page.'; }\n</script>`);
fs.mkdirSync('dist-standalone', { recursive: true });
fs.writeFileSync('dist-standalone/frontline_solo_ops.html', html);
console.log(`dist-standalone/frontline_solo_ops.html  ${(html.length / 1024).toFixed(1)} KB`);
