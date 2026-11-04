#!/bin/sh
# usage: ship.sh "commit message"
set -e
cd "$(dirname "$0")/.."
node scripts/build-standalone.mjs
npx vite build >/dev/null 2>&1 && echo "vite ok"
git add -A && git commit -qm "$1" && git log --oneline | head -1
mkdir -p /mnt/user-data/outputs
cp dist-standalone/frontline_solo_ops.html /mnt/user-data/outputs/
for d in /mnt/user-data/outputs/artifacts/*/; do [ -f "$d/index.html" ] && cp dist-standalone/frontline_solo_ops.html "$d/index.html"; done
rm -rf /tmp/frontline_site && mkdir -p /tmp/frontline_site && cp dist-standalone/frontline_solo_ops.html /tmp/frontline_site/index.html && (cd /tmp && rm -f /mnt/user-data/outputs/frontline_site.zip && zip -qr /mnt/user-data/outputs/frontline_site.zip frontline_site)
cp docs/HOSTING.md docs/ONE_PAGER.md docs/frontline_overview.png /mnt/user-data/outputs/ 2>/dev/null || true
rm -f /mnt/user-data/outputs/frontline-solo-ops-vite.zip
cd /home/claude && zip -qr /mnt/user-data/outputs/frontline-solo-ops-vite.zip frontline -x 'frontline/node_modules/*' 'frontline/dist/*' 'frontline/tests/three.min.js'
ls -la /mnt/user-data/outputs
