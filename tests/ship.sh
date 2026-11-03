#!/bin/sh
# usage: ship.sh "commit message"
set -e
cd "$(dirname "$0")/.."
node scripts/build-standalone.mjs
npx vite build >/dev/null 2>&1 && echo "vite ok"
git add -A && git commit -qm "$1" && git log --oneline | head -1
mkdir -p /mnt/user-data/outputs
cp dist-standalone/frontline_solo_ops.html /mnt/user-data/outputs/
rm -f /mnt/user-data/outputs/frontline-solo-ops-vite.zip
cd /home/claude && zip -qr /mnt/user-data/outputs/frontline-solo-ops-vite.zip frontline -x 'frontline/node_modules/*' 'frontline/dist/*' 'frontline/tests/three.min.js'
ls -la /mnt/user-data/outputs
