# Private app upload area — scope + delivery (daroyperkins.com lane, 2026-10-01)

## What already exists (from the brain, live since 2026-09-24)
The "backdoor upload-and-run area" is **already built and live** on the TradeDrop droplet (159.223.182.219):

| Surface | URL | Server path | Backend |
|---|---|---|---|
| Launcher (lists apps, delete) | `https://apps.daroyperkins.com/` | `/srv/apps/index.html` | `GET /api/apps` → `{apps:[{name, updated}]}` · `DELETE /api/apps/:name` |
| Uploader (zip → live app) | `https://apps.daroyperkins.com/upload/` | `/srv/apps-vault/public/index.html` | `PUT /api/upload?name=<slug>` (body = zip) → `{ok, name, files}` or `{error}` |
| Apps | `https://apps.daroyperkins.com/<name>/` | `/srv/apps/<name>/` | nginx static |

Gate: one HTTP Basic Auth realm (user `roy`) over everything. Uploader: Node process on 127.0.0.1:8091, 250 MB max, slug `^[a-z0-9][a-z0-9_-]{0,40}$`, re-upload replaces, path traversal blocked, symlinks stripped. Source on Luigi's VM: `~/workspace/apps-vault/`.

So "scope + build the upload area" resolves to: **nothing new on the backend**; the open item is the UI redesign Roy asked Chat for on 2026-09-24 (brain topic `vault-ui-redesign`, targets #1 launcher and #2 uploader). This lane delivers those two pages.

## Delivered here (frontend only, drop-in)
| File in repo | Replaces | Notes |
|---|---|---|
| `apps/vault/index.html` | `/srv/apps/index.html` | Launcher: app cards, delete with confirmation, upload CTA, auto-refresh. Reads each app's `data/manifest.json` (if present) to show the app name, version and content-bank versions — Journeyman HQ ships one; apps without a manifest just show the slug. |
| `apps/vault/upload/index.html` | `/srv/apps-vault/public/index.html` | Uploader: same flow and **identical validation** (slug regex, `.zip` only, 250 MB limit enforced by the API, API error text shown verbatim). Adds: tap an existing app name to prefill it (replace flow), clearer drop state, progress %, live link on success. |

Hard rails kept: plain HTML/CSS/JS, no build step, no frameworks, no external requests (fonts are system stack), `credentials: "same-origin"` on every fetch, HTML-escaped app names, API contracts untouched. Visual language matches daroyperkins.com and Journeyman HQ (dark, amber accent).

## Not done / not touched
- nginx, Basic Auth, uploader.js, the droplet — untouched (rails). No deploy from this repo.
- Budget app redesign (target #3 of the brief) — separate, larger task; not in this dispatch.
- If Chat already shipped a redesign of these two pages since 09-24, treat these as a merge candidate; the API usage is identical either way.

## Deploy (Roy, after Luigi verifies)
1. Run the mandatory deploy-rule-checker + diff-scorer pair against the two files.
2. `scp apps/vault/index.html root@159.223.182.219:/srv/apps/index.html`
3. `scp apps/vault/upload/index.html root@159.223.182.219:/srv/apps-vault/public/index.html`
4. Verify: `/` lists apps and delete still asks for confirmation; `/upload/` rejects a bad name and a non-zip, accepts a zip and shows the live link.

## Verification done in this lane
- Both pages load from a stub server that fakes the three API routes (see `apps/vault/test/smoke.mjs`): list renders, manifest badge appears for an app that has one, delete calls `DELETE /api/apps/<name>` only after confirm, bad slug blocked client-side, non-zip blocked, good upload hits `PUT /api/upload?name=` and renders the live link, API error text is surfaced.
