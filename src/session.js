'use strict';
// On-disk session store. Holds the device identity, the negotiated ECDH private
// key, the derived secret and the bearer token, so a login survives process
// restarts until the token expires.
//
// The credentials are kept alongside so an expired token can be renewed
// silently on a device the bank already trusts, without another OTP.

const fs = require('fs');
const path = require('path');

const DIR = process.env.BLU_DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DIR, 'session.json');

function ensureDir() {
  fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
}

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return null;
  }
}

function save(s) {
  ensureDir();
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, FILE);
}

function clear() {
  try { fs.unlinkSync(FILE); } catch {}
}

// A token is usable if it exists and still has a minute of life left.
function isFresh(s) {
  if (!s || !s.token || !s.expiresAt) return false;
  return Date.now() < s.expiresAt - 60_000;
}

module.exports = { load, save, clear, isFresh, FILE, DIR };
