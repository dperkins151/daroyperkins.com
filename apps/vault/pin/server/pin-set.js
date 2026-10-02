#!/usr/bin/env node
"use strict";
/**
 * Generate the bcrypt hash for the vault PIN. Prompts with echo off; never prints or stores the PIN.
 *   node pin-set.js                 → prints the hash to stdout
 *   node pin-set.js --out /etc/apps-vault/pin.hash   → writes it, mode 0600
 * Rails: digits only, 6–12 long, rejects obvious sequences/repeats (123456, 111111, 000000, 654321).
 */
const bcrypt = require("bcryptjs");
const fs = require("node:fs");
const readline = require("node:readline");

const WEAK = new Set(["123456", "654321", "000000", "111111", "121212", "112233", "123123", "123321", "1234567", "12345678", "87654321"]);
function validate(pin) {
  if (!/^[0-9]{6,12}$/.test(pin)) return "PIN must be 6 to 12 digits.";
  if (/^(\d)\1+$/.test(pin)) return "PIN cannot be a single repeated digit.";
  if (WEAK.has(pin)) return "That PIN is on the common-PIN list. Pick another.";
  return null;
}
function hashPin(pin, rounds = 12) { return bcrypt.hashSync(pin, rounds); }

function ask(q) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const stdin = process.stdin; const orig = rl._writeToOutput;
    rl._writeToOutput = function (s) { if (s.includes(q)) orig.call(rl, q); };  // echo off
    rl.question(q, (a) => { rl.close(); process.stdout.write("\n"); resolve(a.trim()); });
    void stdin;
  });
}

if (require.main === module) {
  (async () => {
    const outIdx = process.argv.indexOf("--out");
    const out = outIdx > -1 ? process.argv[outIdx + 1] : null;
    const pin = await ask("New vault PIN (6–12 digits, hidden): ");
    const err = validate(pin); if (err) { console.error(err); process.exit(2); }
    const again = await ask("Again: "); if (again !== pin) { console.error("PINs do not match."); process.exit(2); }
    const hash = hashPin(pin);
    if (out) { fs.writeFileSync(out, hash + "\n", { mode: 0o600 }); console.log("Hash written to " + out + " (mode 0600). Restart pin-auth to load it."); }
    else console.log(hash);
  })();
}
module.exports = { validate, hashPin };
