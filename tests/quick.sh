#!/usr/bin/env bash
# quick smoke suite (~2-3 min): build, settings/power, every mode x map briefly, 2-page multiplayer
# Run with bash (`bash tests/quick.sh`). Exits non-zero if the build or any test fails; each test still prints only its
# last line. pipefail makes `node … | tail -1` report node's exit code instead of tail's (which is always 0).
[ -n "$BASH_VERSION" ] || exec bash "$0" "$@" # `sh tests/quick.sh` re-runs itself under bash
set -eo pipefail
cd "$(dirname "$0")/.."
node scripts/build-standalone.mjs >/dev/null
failed=()
t() { node "$@" | tail -1 || failed+=("${*#tests/}"); }
t tests/power.mjs
t tests/regress.mjs 6
t tests/mp.mjs
if [ ${#failed[@]} -gt 0 ]; then echo "quick.sh: FAILED: ${failed[*]}"; exit 1; fi
echo "quick.sh: all passed"
