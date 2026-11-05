#!/bin/sh
# quick smoke suite (~2-3 min): build, settings/power, every mode x map briefly, 2-page multiplayer
set -e
cd "$(dirname "$0")/.."
node scripts/build-standalone.mjs >/dev/null
node tests/power.mjs | tail -1
node tests/regress.mjs 6 | tail -1
node tests/mp.mjs | tail -1
