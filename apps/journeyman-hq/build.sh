#!/usr/bin/env bash
# Journeyman HQ — validate banks, run tests, and package a vault-ready zip (index.html at top level).
# Output: dist/journeyman-hq-v<appVersion>.zip  — upload at https://apps.daroyperkins.com/upload/ as "journeyman-hq".
set -euo pipefail
cd "$(dirname "$0")"
node tools/build-banks.mjs
node --test test/*.test.js
VERSION=$(node -p "require('./data/manifest.json').appVersion")
OUT="dist/journeyman-hq-v${VERSION}.zip"
mkdir -p dist
rm -f "$OUT"
# Bundle = runtime files only. No sources, tests, tools, or docs. No secrets exist in this app.
zip -r -X "$OUT" index.html app.css js data README.md >/dev/null
# secret scan on the bundle contents (fail closed)
# patterns are credential-SHAPED (key = "value", tokens, PEM headers), not the English words
if unzip -p "$OUT" | grep -Eq '((api[_-]?key|secret|password|token)["'"'"']?\s*[:=]\s*["'"'"'][A-Za-z0-9_\-]{12,}|sk-[A-Za-z0-9]{16,}|Bearer [A-Za-z0-9._\-]{16,}|BEGIN (RSA|OPENSSH|EC) PRIVATE KEY)'; then
  echo "SECRET SCAN FAILED — bundle contains a credential-looking string" >&2; exit 1
fi
unzip -l "$OUT"
echo "sha256: $(sha256sum "$OUT" | cut -d' ' -f1)"
echo "built $OUT"
