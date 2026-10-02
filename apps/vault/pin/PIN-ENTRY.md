# Vault PIN entry — design, verification spec, cutover plan

Sites lane, 2026-10-02. Design + build only. **Nothing here is deployed; no credential changed.** Roy owns the cutover; Luigi gates it.

## 1. What this is

A phone-friendly numeric PIN pad at `https://apps.daroyperkins.com/pin/` that replaces the browser's Basic-Auth popup for *entering* the vault. After a correct PIN the browser holds a session cookie and every vault app loads as today. Upload and delete keep the existing vault password (see §5).

| Piece | Path | Role |
|---|---|---|
| PIN pad | `apps/vault/pin/index.html` | Static page. Numeric keypad, masked dots, lockout countdown, physical-keyboard support, safe `?next=` redirect. Zero external requests. |
| Verifier | `apps/vault/pin/server/pin-auth.js` | Node service on `127.0.0.1:8092`. `POST /auth/pin`, `GET /auth/check` (nginx `auth_request` target), `POST /auth/logout`, `GET /auth/health`. |
| Rate limiter | `server/lib/ratelimit.js` | Pure module: 5 free tries, escalating lock 30 s → 60 s → 5 m → 15 m → 60 m, plus a global lock (20 failures/hour from any source → 1 h for everyone). |
| Sessions | `server/lib/session.js` | 256-bit random tokens; only SHA-256 of the token is stored; 12 h TTL; optional file persistence across PM2 restarts. |
| PIN setup | `server/pin-set.js` | Prompts with echo off, validates (6–12 digits, rejects repeats and common PINs), writes a bcrypt cost-12 hash to a 0600 file. |
| Tests | `test/unit.test.js`, `test/smoke.mjs` | 6 unit cases on the rails; a headless-Chromium run of the real pad against the real verifier (lockout, escalation, cookie flags, open-redirect guard, PIN never in a URL or a log line). |

## 2. Security rails (as specified, and where each is enforced)

| Rail | Enforced by |
|---|---|
| Min 6 digits (max 12) | Pad refuses to submit under 6; verifier regex `^[0-9]{6,12}$`; `pin-set.js` refuses weak/short PINs. |
| 5 tries, then escalating lockout | `ratelimit.js` per client IP (nginx passes `X-Real-IP`) **and** a global cap so a botnet gets no more guesses than one attacker. Pad shows the countdown and disables itself; the server is the authority. |
| bcrypt/argon2 hash, never plaintext | `bcryptjs` cost 12 (~330 ms per verify on the droplet's 1 vCPU). Hash lives in `/etc/apps-vault/pin.hash`, mode 0600, root. Pure-JS bcrypt chosen over argon2 to avoid a native build on a 1.9 GB box where `tsc` already OOMs; swapping to argon2id is one function if desired. |
| Never in URLs or logs | PIN travels once, in a JSON POST body over TLS. `GET /auth/pin` is a 404. Logs carry a salted hash of the IP, outcome and counters only; smoke test asserts the PIN and cookie value never appear in logs or request URLs. `<meta name="referrer" content="no-referrer">` on the pad. |
| HTTPS-only | Cookie is `Secure; HttpOnly; SameSite=Strict; Path=/`. The `Secure` flag is dropped only under `PIN_AUTH_DEV=1`, which exists for the local smoke test and must never be set in production. nginx already redirects 80 → 443 with Let's Encrypt. |
| Uniform timing | Every attempt costs exactly one bcrypt compare (a dummy hash is used for malformed input or an unconfigured server), so response time doesn't leak format validity. |
| Body size / JSON only | 1 KB body cap; non-JSON counts as a failed attempt. |
| No open redirect | `?next=` must start with a single `/`; `//host`, absolute URLs and control characters fall back to `/`. |

## 3. Brute-force math

Keyspace: 6 digits = 10⁶; 8 digits = 10⁸. Expected guesses to hit = half the keyspace.

| Scenario | Guess rate | Time to exhaust 10⁶ | Expected |
|---|---|---|---|
| **No limiter** (only bcrypt cost 12, 1 vCPU) | ~3 /s | ~3.9 days | ~2 days |
| nginx `limit_req` only, 10 r/min | 10 /min | 69 days | 35 days |
| **This design, one IP** — 5 free then 30 s, 60 s, 5 m, 15 m, then 60 m per guess | ≈1 /h after the 10th guess | ≈114 years | ≈57 years |
| **This design, distributed** — global cap 20 failures/h | 20 /h | ≈5.7 years | ≈2.9 years |
| Attacker's chance per hour under the global cap | 20 / 10⁶ | | 0.002 % |

Offline attack (attacker already has `pin.hash`): bcrypt-12 on a consumer GPU runs on the order of 10⁴ H/s → a 6-digit space falls in ~2 minutes, an 8-digit space in ~3 hours. **The hash protects against casual exposure (a stray `cat`, a backup), not against offline cracking of a 6-digit space.** The real controls are the online limiter, root-only 0600 on the hash, and the hash never leaving the box. Recommendation: Roy picks **8 digits**; the floor stays 6 per the spec.

Session token: 256 bits random; guessing is not a factor. TTL 12 h; logout endpoint provided; the store holds SHA-256 of tokens so a copied store file is useless.

## 4. Architecture comparison

### (a) PIN pad submits the PIN as the Basic-Auth credential (`Authorization: Basic roy:PIN`)
- The PIN *is* the htpasswd password — so the vault password becomes 6 digits for everything, including upload/delete, and lives in `/etc/nginx/.htpasswd` as a bcrypt/apr1 entry.
- Browsers don't reliably promote a `fetch()`-supplied credential to later navigations (Chrome sometimes caches per realm; Safari iOS — Roy's primary device — generally does not). The working fallback, `https://roy:PIN@host/`, is deprecated and blocked in-page by Chrome and Safari. Result: a pad that "works on the laptop, not on the phone."
- No lockout without `fail2ban` parsing nginx 401s (coarse, log-driven, no escalation, no global cap); no logout; no expiry; credential re-sent on every request.
- Upside: zero new services. That is the only upside.

### (b) Session-cookie login behind nginx `auth_request` — **recommended**
- Pad POSTs the PIN once to a 150-line Node service; service sets an `HttpOnly; Secure; SameSite=Strict` cookie; nginx asks the service `GET /auth/check` on every vault request (`ngx_http_auth_request_module`, compiled into Ubuntu's nginx by default). 401 → `302 /pin/?next=…`.
- Full control of the rails in code (escalating + global lockout, uniform timing, expiry, logout). Testable offline — the smoke test drives the exact flow.
- Coexists with Basic Auth: `/upload/` and `/api/` keep `auth_basic` untouched (§5). The budget app's `/budget/api/*` sits under the vault path and works unchanged because the cookie rides on same-origin fetches; `SameSite=Strict` also gives CSRF protection those endpoints did not have before.
- Cost: one more PM2 process (≈30 MB RSS) and a 20-line nginx change, both staged in §6 and reversible with one `cp` + reload.

**Decision: (b).** (a) fails the phone use case and cannot meet the lockout rail without bolting fail2ban onto nginx logs.

## 5. PIN for vault entry only, or PIN everywhere?

**Recommendation: PIN for vault entry (viewing/using apps) only; keep the vault password for `/upload/` and `/api/*` (upload, replace, delete).**

- A 6–8 digit PIN is a convenience factor sized for a phone. Upload and delete are destructive, rare, laptop-side actions — exactly where a long password is cheap and a shoulder-surfed PIN is expensive. Step-up for destructive ops is the standard pattern.
- Blast radius of a leaked PIN = read access to the apps until Roy rotates it. Blast radius of a leaked vault password today = read + replace any app with arbitrary HTML. Keeping them separate halves what a PIN leak can do.
- Cutover risk: the uploader path does not change at all, so nothing about Luigi's zip-deploy flow moves.
- "PIN everywhere" would be the right call only if Roy stops using the laptop for uploads; revisit then.

## 6. Cutover — **waits for Roy's go-ahead; not part of this PR's effect**

Luigi runs the deploy-rule-checker + diff-scorer pair first. Everything below is reversible by restoring the nginx conf (step 8).

```bash
# 0. on the droplet (159.223.182.219), as root. Nothing below touches /srv/apps/* content.
# 1. install the verifier beside the uploader
mkdir -p /srv/apps-vault/pin-auth /srv/apps-vault/pin /etc/apps-vault
cp -r <repo>/apps/vault/pin/server/. /srv/apps-vault/pin-auth/
cp <repo>/apps/vault/pin/index.html /srv/apps-vault/pin/index.html
cd /srv/apps-vault/pin-auth && npm ci --omit=dev        # bcryptjs only, pure JS

# 2. set the PIN (prompts, echo off; never printed)
node pin-set.js --out /etc/apps-vault/pin.hash          # → mode 0600
chmod 700 /etc/apps-vault

# 3. PM2 — env goes in the ecosystem file (PM2 does not read .env; `pm2 restart --update-env` does NOT re-read it)
cat > /srv/apps-vault/pin-auth/ecosystem.config.cjs <<'CJS'
module.exports = { apps: [{ name: "pin-auth", script: "pin-auth.js", cwd: "/srv/apps-vault/pin-auth", max_memory_restart: "100M",
  env: { PIN_AUTH_PORT: "8092", VAULT_PIN_HASH_FILE: "/etc/apps-vault/pin.hash", SESSION_TTL_HOURS: "12", SESSION_STORE_FILE: "/etc/apps-vault/sessions.json" } }] };
CJS
pm2 start /srv/apps-vault/pin-auth/ecosystem.config.cjs && pm2 save
curl -s http://127.0.0.1:8092/auth/health          # expect {"ok":true,"hashConfigured":true,...}

# 4. nginx — stage, test, then swap (file names are the vault vhost's; adjust to the real one)
cp /etc/nginx/sites-available/apps-vault /root/apps-vault.nginx.bak
```
nginx fragment to add inside the `apps.daroyperkins.com` 443 server block (the `/upload/` and `/api/` locations keep their existing `auth_basic` lines; `proxy_pass` uses `127.0.0.1`, never `localhost`, per the droplet gotcha):
```nginx
# http { } block:  limit_req_zone $binary_remote_addr zone=pin:1m rate=10r/m;   # belt-and-braces under the app limiter

location = /auth/check {
    internal;
    proxy_pass              http://127.0.0.1:8092/auth/check;
    proxy_pass_request_body off;
    proxy_set_header        Content-Length "";
    proxy_set_header        Cookie $http_cookie;
}
location /auth/ {
    limit_req               zone=pin burst=5 nodelay;
    proxy_pass              http://127.0.0.1:8092;
    proxy_set_header        X-Real-IP $remote_addr;
    proxy_set_header        Host $host;
}
location /pin/ {                       # the pad itself is public (it is the login page)
    alias /srv/apps-vault/pin/;
    add_header Cache-Control "no-store";
}
location / {                           # was: auth_basic ...; now:
    auth_request            /auth/check;
    error_page 401 = @pin;
    root /srv/apps;
    try_files $uri $uri/ =404;
}
location @pin { return 302 /pin/?next=$request_uri; }
# location /upload/ { auth_basic "vault"; auth_basic_user_file /etc/nginx/.htpasswd; ... }   UNCHANGED
# location /api/    { auth_basic "vault"; auth_basic_user_file /etc/nginx/.htpasswd; ... }   UNCHANGED
```
```bash
# 5. test + reload
nginx -t && systemctl reload nginx
# 6. verify from a phone and a laptop
#    https://apps.daroyperkins.com/           → 302 to /pin/?next=/ ; pad renders
#    6 wrong PINs                              → 5× "Wrong PIN", then "Locked · 30s"; pm2 logs pin-auth shows ev:"fail"/"locked", no PIN text
#    correct PIN                               → lands on /, apps open, /journeyman-hq/ works, /budget/ API calls work
#    https://apps.daroyperkins.com/upload/     → still the Basic-Auth prompt (password, not PIN)
#    curl -I https://apps.daroyperkins.com/    → 302 (no cookie) ; HTTP → 301 to HTTPS
# 7. the old Basic-Auth password stays valid for /upload/ and /api/. No htpasswd change.
# 8. rollback (one command): cp /root/apps-vault.nginx.bak /etc/nginx/sites-available/apps-vault && nginx -t && systemctl reload nginx ; pm2 delete pin-auth
```
Rotation: `node pin-set.js --out /etc/apps-vault/pin.hash && pm2 restart pin-auth` (sessions survive if `SESSION_STORE_FILE` is set; delete that file to force everyone to re-enter).

## 7. Out of scope / open

- Not done: nginx, htpasswd, PM2 on the droplet (rails). The budget app's own backend auth assumptions were not audited beyond "cookie rides same-origin fetches"; verify `/budget/api/*` after cutover (step 6).
- Optional later: WebAuthn/passkey instead of a PIN (iPhone Face ID) — same `auth_request` shape, different verifier; the cookie/session half of this PR carries over.
