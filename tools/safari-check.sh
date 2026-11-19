#!/bin/bash
# Frontline Squad in Safari's engine (WebKit), run ON THE M4 (Apple Silicon: WebGL works there, not on the M14).
# Brian pastes one line in the M4's Terminal:
#   curl -fsSL https://raw.githubusercontent.com/branmuffn/frontline-squad/main/tools/safari-check.sh | bash
# (this file is copied there). It needs Node 18+ (https://nodejs.org) and ~600 MB for the WebKit download.
# Results: ~/Desktop/frontline-safari-results.txt (paste it to Claude). Nothing is sent anywhere.
set -u
DIR="$HOME/frontline-safari"
OUT="$HOME/Desktop/frontline-safari-results.txt"
command -v node >/dev/null || { echo "Node isn't installed. Get the LTS installer from https://nodejs.org, then run this again."; exit 1; }
if [ -d "$DIR/.git" ]; then git -C "$DIR" pull -q; else git clone -q https://github.com/branmuffn/frontline-squad.git "$DIR"; fi
cd "$DIR" || exit 1
echo "Installing (first run takes a few minutes)..."
npm ci --silent >/dev/null 2>&1 || npm install --silent >/dev/null 2>&1
npx playwright install webkit >/dev/null 2>&1
node scripts/build-standalone.mjs >/dev/null
# every test's chromium.launch() runs WebKit instead
cat > /tmp/fl-webkit.mjs <<EOF
import { createRequire } from 'module';
const require = createRequire('$DIR/package.json');
const pw = require('playwright');
pw.chromium.launch = (o = {}) => pw.webkit.launch({ headless: o.headless });
EOF
TESTS="buildlabel power touch menulayout mappreview phoneui phonefit stamina killcam kcscope kcshot hitbox fire gear graphics ladder doorways bots heli mapsmoke mp mplobby mpmodes mpvote mpveh mpstreaks mpwarm mpmatrix"
{
  echo "Frontline Safari (WebKit) check on $(hostname) $(date)"
  echo "build $(git log --oneline -1)"
  for t in $TESTS; do
    [ -f "tests/$t.mjs" ] || continue
    printf '%-12s ' "$t"
    FPS_LOOPBACK=1 node --import /tmp/fl-webkit.mjs "tests/$t.mjs" 2>&1 | tail -1 | cut -c1-300
  done
} | tee "$OUT"
echo
echo "Done. Results saved to $OUT"
