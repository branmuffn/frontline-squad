#!/bin/sh
# Build the standalone game and lay it out as a static site (site/index.html) for Vercel (vercel.json) or any static host.
set -e
cd "$(dirname "$0")/.."
node scripts/build-standalone.mjs
mkdir -p site && cp dist-standalone/frontline_solo_ops.html site/index.html
cp docs/og.jpg site/og.jpg # link-preview card (og:image)
echo "site/index.html ready"
