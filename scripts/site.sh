#!/bin/sh
# Build the standalone game and lay it out as a static site (site/index.html) for Netlify or any static host.
set -e
cd "$(dirname "$0")/.."
node scripts/build-standalone.mjs
mkdir -p site && cp dist-standalone/frontline_solo_ops.html site/index.html
echo "site/index.html ready"
