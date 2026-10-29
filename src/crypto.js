'use strict';
// Transport crypto for the Blu gateway.
//
// Blu signs every authenticated request with a detached-payload JWS (RFC 7797,
// b64:false) keyed by an ECDH P-256 shared secret negotiated at session start.
// The same secret doubles as the AES-256-GCM key that encrypts the password
// field on login. WebCrypto derives both keys as the raw ECDH output, so no KDF
// step is involved.

const crypto = require('crypto');

const CURVE = 'prime256v1';

function newKeyPair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: CURVE });
  return { privateKey, publicKey };
}

// DER SubjectPublicKeyInfo — exactly what the client puts in the key-exchange body.
function exportSpki(publicKey) {
  return publicKey.export({ type: 'spki', format: 'der' });
}

function importSpki(der) {
  return crypto.createPublicKey({ key: der, format: 'der', type: 'spki' });
}

// Raw ECDH output. Used directly as both the HMAC and AES key.
function sharedSecret(privateKey, peerPublicKey) {
  return crypto.diffieHellman({ privateKey, publicKey: peerPublicKey });
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

// header + "." + rawBody, signed, emitted as header + ".." + sig (detached payload).
function signJws(hmacKey, header, body) {
  const h = b64url(Buffer.from(JSON.stringify(header), 'utf8'));
  const input = Buffer.concat([Buffer.from(h + '.', 'utf8'), body || Buffer.alloc(0)]);
  const sig = crypto.createHmac('sha256', hmacKey).update(input).digest();
  return h + '..' + b64url(sig);
}

// nonce(12) || ciphertext || tag(16)
function aesSeal(aesKey, plaintext) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
  const ct = Buffer.concat([c.update(plaintext), c.final()]);
  return Buffer.concat([iv, ct, c.getAuthTag()]);
}

function aesOpen(aesKey, blob) {
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(blob.length - 16);
  const ct = blob.subarray(12, blob.length - 16);
  const d = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}

module.exports = { newKeyPair, exportSpki, importSpki, sharedSecret, signJws, aesSeal, aesOpen, b64url };
