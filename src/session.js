'use strict';
// On-disk session store. Holds the device identity, the negotiated ECDH private
// key, the derived secret and the bearer token, so a login survives process
// restarts until the token expires.
//
// Sessions are kept per username so testing one account does not evict another,
// and the credentials are stored alongside so an expired token can be renewed
// silently on a device the bank already trusts, without another OTP.

const fs = require('fs');
const path = require('path');

const DIR = process.env.BLU_DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DIR, 'sessions.json');

function ensureDir() {
  fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
}

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return { current: null, sessions: {} };
  }
}

function writeAll(db) {
  ensureDir();
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, FILE);
}

// The active session, or the one for `username` when given.
function load(username) {
  const db = readAll();
  const user = username || db.current;
  if (!user) return null;
  return db.sessions[user] || null;
}

function save(s) {
  if (!s || !s.username) return;
  const db = readAll();
  db.sessions[s.username] = s;
  db.current = s.username;
  writeAll(db);
}

function clear(username) {
  const db = readAll();
  const user = username || db.current;
  if (!user) return;
  delete db.sessions[user];
  if (db.current === user) db.current = Object.keys(db.sessions)[0] || null;
  writeAll(db);
}

function users() {
  return Object.keys(readAll().sessions);
}

// A token is usable if it exists and still has a minute of life left.
function isFresh(s) {
  if (!s || !s.token || !s.expiresAt) return false;
  return Date.now() < s.expiresAt - 60_000;
}

module.exports = { load, save, clear, users, isFresh, FILE, DIR };
