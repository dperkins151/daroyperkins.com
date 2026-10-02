# Vault PIN entry — design, verification spec, cutover plan

Sites lane, 2026-10-02. Design + build only. **Nothing here is deployed; no credential changed.** Roy owns the cutover; Luigi gates it.

> **Decisions (Roy, 2026-10-02):** (1) session-cookie architecture (§4 option b); (2) **PIN for everything** — apps, upload, delete; Basic Auth retired at cutover (§5, §6 updated accordingly); (3) **8-digit PIN** — the pad, verifier and setup CLI now enforce an 8-digit floor (`PIN_MIN_LEN`, never below the spec's 6).

## 1. What this is

A phone-friendly numeric PIN pad at `https://apps.daroyperkins.com/pin/` that replaces the browser's Basic-Auth popup for *entering* the vault. After a correct PIN the browser holds a session cookie and every vault app loads as today. Upload and delete keep the existing vault password (see §5).

| Piece | Path | Role |
|---|---|---|
| PIN pad | `apps/vault/pin/index.html` | Static page. Numeric keypad, masked dots (8 shown), lockout countdown, physical-keyboard support, safe `?next=` redirect. Zero external requests. |
| Verifier | `apps/vault/pin/server/pin-auth.js` | Node service on `127.0.0.1:8092`. `POST /auth/pin`, `GET /auth/check` (nginx `auth_request` target), `POST /auth/logout`, `GET /auth/health`. |
| Rate limiter | `server/lib/ratelimit.js` | Pure module: 5 free tries, escalating lock 30 s → 60 s → 5 m → 15 m → 60 m, plus a global lock (20 failures/hour from any source → 1 h for everyone). |
| Sessions | `server/lib/session.js` | 256-bit random tokens; only SHA-256 of the token is stored; 12 h TTL; optional file persistence across PM2 restarts. |
| PIN setup | `server/pin-set.js` | Prompts with echo off, validates (8–12 digits by default, `--min 6` floor, rejects repeats and common PINs), writes a bcrypt cost-12 hash to a 0600 file. |
| Tests | `test/unit.test.js`, `test/smoke.mjs` | 6 unit cases on the rails; a headless-Chromium run of the real pad against the real verifier (lockout, escalation, cookie flags, open-redirect guard, PIN never in a URL or a log line). |

## 2. Security rails (as specified, and where each is enforced)

| Rail | Enforced by |
|---|---|
| Min 6 digits (spec) — **8 by decision** | Pad refuses to submit under 8; verifier regex `^[0-9]{8,12}$` (`PIN_MIN_LEN`, clamped ≥ 6); `pin-set.js` refuses weak/short PINs. |
| 5 tries, then escalating lockout | `ratelimit.js` per client IP (nginx passes `X-Real-IP`) **and** a global cap so a botnet gets no more guesses than one attacker. Pad shows the countdown and disables itself; the server is the authority. |
| bcrypt/argon2 hash, never plaintext | `bcryptjs` cost 12 (~330 ms per verify on the droplet's 1 vCPU). Hash lives in `/etc/apps-vault/pin.hash`, mode 0600, root. Pure-JS bcrypt chosen over argon2 to avoid a native build on a 1.9 GB box where `tsc` already OOMs; swapping to argon2id is one function if desired. |
| Never in URLs or logs | PIN travels once, in a JSON POST body over TLS. `GET /auth/pin` is a 404. Logs carry a salted hash of the IP, outcome and counters only; smoke test asserts the PIN and cookie value never appear in logs or request URLs. `<meta name="referrer" content="no-referrer">` on the pad. |
| HTTPS-only | Cookie is `Secure; HttpOnly; SameSite=Strict; Path=/`. The `Secure` flag is dropped only under `PIN_AUTH_DEV=1`, which exists for the local smoke test and must never be set in production. nginx already redirects 80 → 443 with Let's Encrypt. |
| Uniform timing | Every attempt costs exactly one bcrypt compare (a dummy hash is used for malformed input or an unconfigured server), so response time doesn't leak format validity. |
| Body size / JSON only | 1 KB body cap; non-JSON counts as a failed attempt. |
| No open redirect | `?next=` must start with a single `/`; `//host`, absolute URLs and control characters fall back to `/`. |

## 3. Brute-force math

Keyspace: 8 digits (chosen) = 10⁸; 6 digits (spec floor) = 10⁶. Expected guesses to hit = half the keyspace.

| Scenario | Guess rate | Exhaust 10⁸ (8 digits) | Exhaust 10⁶ (6 digits) |
|---|---|---|---|
| **No limiter** (only bcrypt cost 12, 1 vCPU) | ~3 /s | ≈1.06 years | ≈3.9 days |
| nginx `limit_req` only, 10 r/min | 10 /min | ≈19 years | 69 days |
| **This design, one IP** — 5 free then 30 s, 60 s, 5 m, 15 m, then 60 m per guess | ≈1 /h after the 10th guess | ≈11,400 years | ≈114 years |
| **This design, distributed** — global cap 20 failures/h | 20 /h | ≈570 years | ≈5.7 years |
| Attacker's chance per hour under the global cap | 20 / keyspace | 0.00002 % | 0.002 % |

Offline attack (attacker already has `pin.hash`): bcrypt-12 on a consumer GPU runs on the order of 10⁴ H/s → an 8-digit space falls in ~3 hours, a 6-digit space in ~2 minutes. **The hash protects against casual exposure (a stray `cat`, a backup), not against offline cracking of a numeric space.** The real controls are the online limiter, root-only 0600 on the hash, and the hash never leaving the box. With the PIN now also guarding upload/delete (§5), rotate it if the box is ever suspected compromised: `pin-set.js --out … && pm2 restart pin-auth`.

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
- Can coexist with Basic Auth on admin paths, or replace it entirely (Roy chose the latter, §5). The budget app's `/budget/api/*` and the uploader's `/api/*` work unchanged because the cookie rides on same-origin fetches; `SameSite=Strict` also gives CSRF protection those endpoints did not have before.
- Cost: one more PM2 process (≈30 MB RSS) and a 20-line nginx change, both staged in §6 and reversible with one `cp` + reload.

**Decision: (b).** (a) fails the phone use case and cannot meet the lockout rail without bolting fail2ban onto nginx logs.

## 5. PIN for vault entry only, or PIN everywhere? — **Roy chose PIN everywhere**

My recommendation was vault-entry-only (keep the vault password as a step-up for upload/delete: smaller blast radius for a shoulder-surfed PIN, uploader path untouched). Roy decided **one PIN for everything** on 2026-10-02 — one thing to remember on the phone, no second credential to manage. Consequences, built in:

- `/upload/` and `/api/*` go behind the same `auth_request` cookie at cutover; `auth_basic` is removed from the vault vhost. The `.htpasswd` file stays on disk, unreferenced, as the rollback credential.
- The uploader and launcher already call `/api/*` with `credentials: "same-origin"`, so the cookie rides along with no page changes. `SameSite=Strict` means a cross-site page cannot trigger an upload or delete even with the cookie present.
- The 8-digit floor (decision 3) is what makes this acceptable: 10⁸ keyspace + the limiter puts an online guess of the admin credential in the hundreds-of-years range (§3).
- Session TTL stays 12 h. If Roy wants uploads to require a fresh PIN, a 1-hour `SESSION_TTL_HOURS` is the one knob — not built as a separate tier, to keep one credential and one flow.

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
nginx fragment for the `apps.daroyperkins.com` 443 server block. **PIN everywhere:** every `auth_basic` / `auth_basic_user_file` line in this vhost is removed and replaced by `auth_request` (`/upload/` and `/api/` included). `proxy_pass` uses `127.0.0.1`, never `localhost`, per the droplet gotcha:
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
location /upload/ {                    # was auth_basic; now the same cookie
    auth_request            /auth/check;
    error_page 401 = @pin;
    alias /srv/apps-vault/public/;     # keep the existing alias/root line as-is
}
location /api/ {                       # uploader backend (127.0.0.1:8091); was auth_basic; now the same cookie
    auth_request            /auth/check;
    error_page 401 = @pin;             # fetch() callers see a 302 → JSON parse fails → landing page shows "sign in"; acceptable
    proxy_pass              http://127.0.0.1:8091;
    client_max_body_size    250m;      # keep the existing upload limits
}
```
```bash
# 5. test + reload
nginx -t && systemctl reload nginx
# 6. verify from a phone and a laptop
#    https://apps.daroyperkins.com/           → 302 to /pin/?next=/ ; pad renders
#    6 wrong PINs                              → 5× "Wrong PIN", then "Locked · 30s"; pm2 logs pin-auth shows ev:"fail"/"locked", no PIN text
#    correct PIN                               → lands on /, apps open, /journeyman-hq/ works, /budget/ API calls work
#    https://apps.daroyperkins.com/upload/     → 302 to /pin/ without a cookie; with the cookie, the uploader loads and a test zip uploads
#    curl -I https://apps.daroyperkins.com/api/apps → 302 (no cookie) ; HTTP → 301 to HTTPS
# 7. Basic Auth is retired for this vhost. Keep /etc/nginx/.htpasswd on disk (unreferenced) — it is the rollback credential.
# 8. rollback (one command): cp /root/apps-vault.nginx.bak /etc/nginx/sites-available/apps-vault && nginx -t && systemctl reload nginx ; pm2 delete pin-auth
```
Rotation: `node pin-set.js --out /etc/apps-vault/pin.hash && pm2 restart pin-auth` (sessions survive if `SESSION_STORE_FILE` is set; delete that file to force everyone to re-enter).

## 7. Out of scope / open

- Not done: nginx, htpasswd, PM2 on the droplet (rails). The budget app's own backend auth assumptions were not audited beyond "cookie rides same-origin fetches"; verify `/budget/api/*` and a real zip upload after cutover (step 6).
- Any script or cron that hits `/api/*` with the Basic-Auth password (none known; check Luigi's upload tooling) must switch to the cookie flow or be given a separate token before cutover.
- Optional later: WebAuthn/passkey instead of a PIN (iPhone Face ID) — same `auth_request` shape, different verifier; the cookie/session half of this PR carries over.
