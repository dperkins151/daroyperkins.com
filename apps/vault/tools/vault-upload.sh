#!/usr/bin/env bash
# Upload a built app zip to the private apps vault and verify it went live.
#   apps/vault/tools/vault-upload.sh <name> <zip>
# Auth comes from the environment, never from arguments or the chat:
#   VAULT_PASSWORD  (required)  the vault Basic-Auth password   — or, after the PIN cutover,
#   VAULT_PIN       (required)  the 8-digit PIN; the script logs in at /auth/pin and uses the cookie
#   VAULT_USER      (optional)  Basic-Auth user, default "roy"
#   VAULT_HOST      (optional)  default https://apps.daroyperkins.com
# Nothing secret is ever echoed. Exit 0 only when the upload returns ok:true AND the app's manifest is served.
set -euo pipefail
NAME="${1:?usage: vault-upload.sh <name> <zip>}"; ZIP="${2:?usage: vault-upload.sh <name> <zip>}"
HOST="${VAULT_HOST:-https://apps.daroyperkins.com}"; USER="${VAULT_USER:-roy}"
[[ -f "$ZIP" ]] || { echo "zip not found: $ZIP" >&2; exit 2; }
[[ "$NAME" =~ ^[a-z0-9][a-z0-9_-]{0,40}$ ]] || { echo "bad app name (a-z 0-9 - _): $NAME" >&2; exit 2; }
unzip -l "$ZIP" | grep -qE '^\s*[0-9]+ .* index\.html$' || { echo "zip has no top-level index.html" >&2; exit 2; }
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
CURL=(curl -sS --fail-with-body -m 300)
if [[ -n "${VAULT_PASSWORD:-}" ]]; then
  AUTH=(-u "$USER:$VAULT_PASSWORD")
elif [[ -n "${VAULT_PIN:-}" ]]; then
  printf '{"pin":"%s"}' "$VAULT_PIN" > "$TMP/pin.json"
  "${CURL[@]}" -c "$TMP/jar" -H 'Content-Type: application/json' --data-binary @"$TMP/pin.json" "$HOST/auth/pin" >/dev/null \
    || { echo "PIN login failed (wrong PIN or locked out)" >&2; exit 3; }
  rm -f "$TMP/pin.json"; AUTH=(-b "$TMP/jar")
else
  echo "no credential: set VAULT_PASSWORD (Basic Auth) or VAULT_PIN (after cutover) in the environment" >&2; exit 3
fi
echo "uploading $(basename "$ZIP") ($(stat -c %s "$ZIP") bytes) as '$NAME' to $HOST …"
RESP="$("${CURL[@]}" "${AUTH[@]}" -X PUT -H 'Content-Type: application/zip' --data-binary @"$ZIP" "$HOST/api/upload?name=$NAME")" \
  || { echo "upload failed: ${RESP:-no response}" >&2; exit 4; }
echo "$RESP" | grep -q '"ok":\s*true' || { echo "uploader rejected it: $RESP" >&2; exit 4; }
echo "uploader: $RESP"
# verify: the app's own manifest (if it ships one) is served from the live path
if M="$("${CURL[@]}" "${AUTH[@]}" "$HOST/$NAME/data/manifest.json" 2>/dev/null)"; then
  echo "live manifest: $(echo "$M" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const m=JSON.parse(s);console.log((m.app||"?")+" "+(m.appVersion||"?")+" · "+Object.entries(m.banks||{}).map(([k,b])=>k+" v"+b.version+" ("+b.count+")").join(", "))})' 2>/dev/null || echo "(unparsed)")"
else
  "${CURL[@]}" "${AUTH[@]}" -o /dev/null "$HOST/$NAME/" && echo "live: $HOST/$NAME/ (no manifest)"
fi
echo "done: $HOST/$NAME/"
