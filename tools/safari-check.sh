#!/bin/bash
# Frontline Squad in Safari's engine (WebKit), run ON THE M4 (Apple Silicon: WebGL works there, not on the M14).
# Brian pastes one line in the M4's Terminal:
#   curl -fsSL https://raw.githubusercontent.com/branmuffn/frontline-squad/main/tools/safari-check.sh | bash
#   (only some tests: ... | bash -s touch mp)  It removes its own files at the end.
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
sh tests/setup.sh >/dev/null 2>&1 # three.js for the test harness (the 2026-11-19 run crashed on every 3D test without it)
mkdir -p safari-logs
# every test's chromium.launch() runs WebKit instead
cat > /tmp/fl-webkit.mjs <<EOF
import { createRequire } from 'module';
const require = createRequire('$DIR/package.json');
const pw = require('playwright');
pw.chromium.launch = (o = {}) => pw.webkit.launch({ headless: o.headless });
EOF
ALL="buildlabel power touch menulayout mappreview phoneui phonefit stamina killcam kcscope kcshot hitbox fire gear graphics ladder doorways bots heli mapsmoke mp mplobby mpmodes mpvote mpveh mpstreaks mpwarm mpmatrix"
TESTS="${*:-$ALL}" # names after `bash -s` run only those, e.g. `| bash -s touch`
{
  echo "Frontline Safari (WebKit) check on $(hostname) $(date)"
  echo "build $(git log --oneline -1)"
  for t in $TESTS; do
    [ -f "tests/$t.mjs" ] || continue
    printf '%-12s ' "$t"
    FPS_LOOPBACK=1 node --import /tmp/fl-webkit.mjs "tests/$t.mjs" > "safari-logs/$t.txt" 2>&1
    last=$(tail -1 "safari-logs/$t.txt")
    case "$last" in Node.js*) # a crash: show the error itself, not Node's version line
      last="CRASH (details below)";; esac
    echo "$last" | cut -c1-300
    case "$last" in CRASH*) sed -n '1,40p' "safari-logs/$t.txt" | grep -v '^\s*$' | head -25 | sed 's/^/      | /';; esac
  done
} | tee "$OUT"
# Brian (2026-11-19): clean up after itself; crash details are already in the results file
cd "$HOME" && rm -rf "$DIR" /tmp/fl-webkit.mjs "$HOME/Library/Caches/ms-playwright"/webkit-*
echo
echo "Done. Results saved to $OUT. The test copy and the WebKit download were removed; delete the results file once Claude has it."
