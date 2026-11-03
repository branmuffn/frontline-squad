#!/bin/sh
# One-time: local three.js r128 for the headless harness (served in place of the CDN / inlined copy)
cd "$(dirname "$0")"
[ -f three.min.js ] || (cd /tmp && npm pack three@0.128.0 >/dev/null 2>&1 && tar xzf three-0.128.0.tgz && cp package/build/three.min.js "$OLDPWD/")
ls -la three.min.js
