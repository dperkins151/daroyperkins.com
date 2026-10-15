// Stub-server test for tools/vault-upload.sh: Basic-Auth path, PIN path, no credential, server rejection.
// Run: node --test apps/vault/test/upload-script.test.mjs   (needs curl, unzip, zip)
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const script = path.resolve(new URL(".", import.meta.url).pathname, "..", "tools", "vault-upload.sh");
const tmp = mkdtempSync(path.join(tmpdir(), "vault-upload-"));
writeFileSync(path.join(tmp, "index.html"), "<!doctype html><title>x</title>");
execFileSync("zip", ["-q", "-j", path.join(tmp, "good.zip"), path.join(tmp, "index.html")]);
writeFileSync(path.join(tmp, "noindex.txt"), "x"); execFileSync("zip", ["-q", "-j", path.join(tmp, "bad.zip"), path.join(tmp, "noindex.txt")]);

const seen = [];
let mode = "ok";
const srv = createServer((req, res) => {
  let body = []; req.on("data", (c) => body.push(c)); req.on("end", () => {
    const u = new URL(req.url, "http://x"); const rec = { method: req.method, path: u.pathname, name: u.searchParams.get("name"), auth: req.headers.authorization || null, cookie: req.headers.cookie || null, bytes: Buffer.concat(body).length };
    seen.push(rec);
    const json = (code, obj, headers = {}) => { res.writeHead(code, Object.assign({ "content-type": "application/json" }, headers)); res.end(JSON.stringify(obj)); };
    if (req.method === "POST" && u.pathname === "/auth/pin") { const pin = JSON.parse(Buffer.concat(body).toString()).pin; return pin === "12345678" ? json(200, { ok: true }, { "set-cookie": "vault_session=tok123; Path=/; HttpOnly" }) : json(401, { error: "wrong pin" }); }
    const authed = rec.auth === "Basic " + Buffer.from("roy:pw-secret").toString("base64") || /vault_session=tok123/.test(rec.cookie || "");
    if (!authed) return json(401, { error: "auth" });
    if (req.method === "PUT" && u.pathname === "/api/upload") return mode === "reject" ? json(400, { error: "zip has no index.html" }) : json(200, { ok: true, name: rec.name, files: 1 });
    if (u.pathname === "/journeyman-hq/data/manifest.json") return json(200, { app: "Journeyman HQ", appVersion: "9.9.9", banks: { questions: { version: 3, count: 308 } } });
    if (u.pathname === "/plain/data/manifest.json") return json(404, { error: "nf" });
    if (u.pathname === "/plain/") { res.writeHead(200); return res.end("<html>"); }
    json(404, { error: "nf" });
  });
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const HOST = `http://127.0.0.1:${srv.address().port}`;
// async: the stub server lives in this process, so the script must not block the event loop
const run = (args, env) => new Promise((resolve) => {
  const c = spawn("bash", [script, ...args], { env: Object.assign({ PATH: process.env.PATH, VAULT_HOST: HOST }, env) });
  let stdout = "", stderr = ""; c.stdout.on("data", (d) => { stdout += d; }); c.stderr.on("data", (d) => { stderr += d; });
  c.on("close", (status) => resolve({ status, stdout, stderr }));
});

test("Basic Auth upload: credential only from the env, ok:true required, live manifest echoed", async () => {
  seen.length = 0; mode = "ok";
  const r = await run(["journeyman-hq", path.join(tmp, "good.zip")], { VAULT_PASSWORD: "pw-secret" });
  assert.equal(r.status, 0, r.stderr);
  const put = seen.find((s) => s.method === "PUT"); assert.ok(put && put.name === "journeyman-hq" && put.bytes > 0, "PUT /api/upload?name=journeyman-hq with the zip body");
  assert.equal(put.auth, "Basic " + Buffer.from("roy:pw-secret").toString("base64"));
  assert.match(r.stdout, /uploader: \{"ok":true/); assert.match(r.stdout, /live manifest: Journeyman HQ 9\.9\.9 · questions v3 \(308\)/); assert.match(r.stdout, /done: .*\/journeyman-hq\/$/m);
  assert.ok(!/pw-secret/.test(r.stdout + r.stderr), "the password never appears in output");
});

test("PIN path: logs in at /auth/pin, reuses the cookie, never prints the PIN", async () => {
  seen.length = 0; mode = "ok";
  const r = await run(["plain", path.join(tmp, "good.zip")], { VAULT_PIN: "12345678" });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(seen.map((s) => s.method + " " + s.path), ["POST /auth/pin", "PUT /api/upload", "GET /plain/data/manifest.json", "GET /plain/"]);
  assert.match(seen[1].cookie, /vault_session=tok123/); assert.equal(seen[1].auth, null);
  assert.match(r.stdout, /live: .*\/plain\/ \(no manifest\)/);
  assert.ok(!/12345678/.test(r.stdout + r.stderr));
  const wrong = await run(["plain", path.join(tmp, "good.zip")], { VAULT_PIN: "00000000" });
  assert.equal(wrong.status, 3); assert.match(wrong.stderr, /PIN login failed/);
});

test("no credential → exit 3 before any request; bad zip / name → exit 2", async () => {
  seen.length = 0;
  const r = await run(["plain", path.join(tmp, "good.zip")], {});
  assert.equal(r.status, 3); assert.match(r.stderr, /no credential/); assert.equal(seen.length, 0);
  assert.equal((await run(["plain", path.join(tmp, "bad.zip")], { VAULT_PASSWORD: "pw-secret" })).status, 2);
  assert.equal((await run(["Bad Name", path.join(tmp, "good.zip")], { VAULT_PASSWORD: "pw-secret" })).status, 2);
  assert.equal((await run(["plain", path.join(tmp, "missing.zip")], { VAULT_PASSWORD: "pw-secret" })).status, 2);
});

test("uploader rejection → exit 4 with the server's message, wrong password → exit 4", async () => {
  mode = "reject";
  const r = await run(["plain", path.join(tmp, "good.zip")], { VAULT_PASSWORD: "pw-secret" });
  assert.equal(r.status, 4); assert.match(r.stderr, /zip has no index\.html/);
  mode = "ok";
  const w = await run(["plain", path.join(tmp, "good.zip")], { VAULT_PASSWORD: "nope" });
  assert.equal(w.status, 4); assert.match(w.stderr, /upload failed/);
});

test.after(() => { srv.close(); rmSync(tmp, { recursive: true, force: true }); });
