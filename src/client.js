'use strict';
// Blu gateway client: device identity, ECDH key exchange, login, OTP, and
// signed authenticated calls.

const crypto = require('crypto');
const http2 = require('http2');
const C = require('./config');

// The gateway is geo-fenced; all traffic must leave from Iran. Point BLU_PROXY
// at a SOCKS5/HTTP proxy that exits there.
function buildAgent() {
  const p = process.env.BLU_PROXY;
  if (!p) return undefined;
  if (p.startsWith('socks')) {
    const { SocksProxyAgent } = require('socks-proxy-agent');
    return new SocksProxyAgent(p);
  }
  const { HttpsProxyAgent } = require('https-proxy-agent');
  return new HttpsProxyAgent(p);
}
const AGENT = buildAgent();
const P = require('./proto');
const X = require('./crypto');
const store = require('./session');

class BluError extends Error {
  constructor(status, body, path) {
    super(`${status} ${path}`);
    this.status = status;
    this.body = body;
    this.path = path;
  }
}

function uuid() {
  return crypto.randomUUID();
}

function deviceIdBinary(id) {
  return Buffer.from(id.replace(/-/g, ''), 'hex');
}

// A fresh-device login answers with an OTP challenge. The request blob lives in
// the navigation URI under f5 and is echoed back verbatim as the f2 block of the
// verify call; the timestamps come from the response's own f2 block.
function parseOtpRequest(res) {
  const blk = P.first(res, 2) || Buffer.alloc(0);
  const uri = P.first(P.first(res, 5) || Buffer.alloc(0), 1);
  if (!uri) return null;
  const m = /otp_request=([^&]+)/.exec(uri.toString('utf8'));
  if (!m) return null;
  const req = Buffer.from(decodeURIComponent(m[1]), 'base64');
  return {
    id: (P.first(req, 1) || Buffer.alloc(0)).toString('utf8'),
    sessionId: (P.first(blk, 3) || Buffer.alloc(0)).toString('utf8'),
    ts1: Number(P.first(P.first(blk, 1) || Buffer.alloc(0), 1)),
    ts2: Number(P.first(P.first(blk, 2) || Buffer.alloc(0), 1)),
  };
}

// Depth-first search for a three-part JWT anywhere in a protobuf tree.
function findJwt(buf, depth = 0) {
  if (!buf || !buf.length || depth > 6) return null;
  let fields;
  try { fields = P.decode(buf); } catch { return null; }
  for (const f of fields) {
    if (f.wire !== 2) continue;
    const s = f.value.toString('utf8');
    if (s.split('.').length === 3 && s.startsWith('eyJ')) return s;
    const nested = findJwt(f.value, depth + 1);
    if (nested) return nested;
  }
  return null;
}

function versionBlock() {
  return [P.num(1, C.APP_VERSION[0]), P.num(2, C.APP_VERSION[1]), P.num(3, C.APP_VERSION[2]), P.num(4, C.APP_VERSION[3])];
}

function clientInfo() {
  return P.msg(11, [P.num(1, 1), P.num(2, 1), P.msg(3, [P.num(1, C.OS)])]);
}

// The leading "app" block shared by key-exchange and login.
function profileBlock(profileId) {
  return P.msg(10, [
    P.str(1, C.PROFILE),
    P.num(2, 1),
    P.msg(3, [P.str(1, profileId || C.PROFILE_ID)]),
    P.num(4, C.PROFILE_TYPE),
  ]);
}

function appBlock(deviceId, withProfile, profileId) {
  return P.msg(1, [
    P.bytes(1, crypto.randomBytes(16)),
    P.msg(8, [
      P.num(10, 0),
      P.bytes(998, deviceIdBinary(deviceId)),
      P.msg(999, versionBlock()),
    ]),
    P.msg(9, [P.str(1, C.LOCALE)]),
    ...(withProfile ? [profileBlock(profileId)] : []),
    clientInfo(),
  ]);
}

function deviceBlock(deviceId) {
  return P.msg(4, [
    P.bytes(1, deviceIdBinary(deviceId)),
    P.msg(2, [P.msg(1, versionBlock()), P.str(3, C.BUNDLE)]),
    P.msg(3, [P.num(1, 1), P.num(2, 1), P.msg(3, [P.num(1, C.OS)])]),
    P.str(5, C.UA_FAMILY),
    P.msg(7, [P.str(1, C.LOCALE)]),
  ]);
}

class BluClient {
  constructor() {
    this.s = null;
  }

  // ---- session bootstrap ----

  // Returns a usable session, renewing it when the token has run out. A device
  // the bank already trusts gets a fresh token from the login call alone, so
  // renewal never needs an OTP.
  async ensure() {
    if (this.s && store.isFresh(this.s)) return this.s;
    const loaded = store.load();
    if (loaded) {
      this.s = loaded;
      this.restoreKeys();
      if (store.isFresh(loaded)) return this.s;
    }
    const s = this.s;
    if (s && s.username && s.password) {
      await this.refresh();
      return this.s;
    }
    throw new Error('no session: run `node cli.js login`');
  }

  // The profile block carries the deposit id, which differs per account. Learn
  // it once from the deposit list and keep it for the rest of the session.
  async profileId() {
    if (this.s.profileId) return this.s.profileId;
    await this.ensure();
    const res = await this.call(
      'account/deposit/list/all',
      'solutions.saman.bluebank.services.AccountListAllRequest',
      'solutions.saman.bluebank.services.AccountListAllResponse',
      appBlock(this.s.deviceId, true)
    );
    const first = P.first(P.first(res, 3) || Buffer.alloc(0), 1);
    const id = first && P.first(first, 1);
    if (id) {
      this.s.profileId = id.toString('utf8');
      store.save(this.strip());
    }
    return this.s.profileId || C.PROFILE_ID;
  }

  // Silent re-login. Serialised so concurrent callers share one round trip.
  async refresh() {
    if (this._refreshing) return this._refreshing;
    this._refreshing = (async () => {
      const s = this.s;
      const { token } = await this.login(s.username, s.password, { keep: true });
      if (!token) throw new Error('device is no longer trusted: run `node cli.js login`');
      return this.s;
    })().finally(() => { this._refreshing = null; });
    return this._refreshing;
  }

  restoreKeys() {
    const s = this.s;
    s._priv = crypto.createPrivateKey({ key: Buffer.from(s.privPkcs8, 'base64'), format: 'der', type: 'pkcs8' });
    s._secret = Buffer.from(s.secret, 'base64');
  }

  newDevice() {
    const prev = store.load();
    const deviceId = (prev && prev.deviceId) || uuid();
    const kp = X.newKeyPair();
    const privPkcs8 = kp.privateKey.export({ type: 'pkcs8', format: 'der' });
    this.s = {
      deviceId,
      privPkcs8: privPkcs8.toString('base64'),
      createdAt: Date.now(),
    };
    this.s._priv = kp.privateKey;
    this.s._pub = kp.publicKey;
    return this.s;
  }

  // ---- transport ----

  async raw(path, { method = 'POST', body, headers = {}, signed = false } = {}) {
    const s = this.s;
    const h = {
      'user-agent': C.UA,
      'accept-language': C.LOCALE.replace('_', '-'),
      origin: C.ORIGIN,
      referer: C.ORIGIN + '/',
      'x-request-id': uuid(),
    };
    Object.assign(h, headers);

    if (signed) {
      if (!s || !s._secret) throw new Error('signed call without a session secret');
      h['x-jws-signature'] = X.signJws(
        s._secret,
        { alg: 'HS256', kid: s.kid, crit: ['b64'], b64: false, requestId: h['x-request-id'] },
        body || Buffer.alloc(0)
      );
      if (s.token) h.authorization = 'Bearer ' + s.token;
    }

    const res = await this.send(C.BASE + path, method, h, method === 'GET' ? null : body);
    if (res.status < 200 || res.status >= 300) throw new BluError(res.status, res.body, path);
    return res.body;
  }

  // The gateway only speaks HTTP/2 — an HTTP/1.1 ClientHello is dropped at the
  // handshake. One session is reused and re-established on failure.
  h2() {
    if (this._h2 && !this._h2.closed && !this._h2.destroyed) return this._h2;
    const sess = http2.connect(new URL(C.BASE).origin, { agent: AGENT });
    const drop = () => { if (this._h2 === sess) this._h2 = null; };
    sess.on('error', drop);
    sess.on('close', drop);
    sess.on('goaway', drop);
    this._h2 = sess;
    return sess;
  }

  send(url, method, headers, body) {
    const u = new URL(url);
    return new Promise((resolve, reject) => {
      const sess = this.h2();
      const h = {
        ':method': method,
        ':path': u.pathname + u.search,
        ':scheme': 'https',
        ':authority': u.host,
        ...headers,
      };
      if (body) h['content-length'] = body.length;
      const req = sess.request(h);
      let status = 0;
      const chunks = [];
      req.on('response', (hh) => { status = hh[':status']; });
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => resolve({ status, body: Buffer.concat(chunks) }));
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  }

  // ---- flow ----

  async keyExchange() {
    const s = this.s;
    if (!s._pub) s._pub = crypto.createPublicKey(s._priv);
    const spki = X.exportSpki(s._pub);
    const body = Buffer.concat([
      appBlock(s.deviceId),
      P.bytes(2, deviceIdBinary(s.deviceId)),
      P.bytes(3, spki),
      P.num(4, C.PLATFORM),
    ]);
    const res = await this.raw('session/key-exchange', {
      body,
      headers: { 'content-type': `application/x-protobuf;reqMsg="${C.T.keyExchange}"; respMsg="${C.T.keyExchangeR}";` },
    });
    const serverSpki = P.first(res, 3);
    const kid = P.first(res, 2);
    if (!serverSpki) throw new Error('key-exchange returned no server key');
    s.kid = kid ? kid.toString('utf8') : s.deviceId.replace(/-/g, '');
    s._secret = X.sharedSecret(s._priv, X.importSpki(serverSpki));
    s.secret = s._secret.toString('base64');
    return res;
  }

  async login(username, password, { keep = false } = {}) {
    if (!this.s) this.newDevice();
    if (!keep) {
      if (this.s.username !== username) this.s.profileId = null;
      this.s.username = username;
      this.s.password = password;
    }
    await this.keyExchange();
    const s = this.s;
    const sealed = X.aesSeal(s._secret, Buffer.from(password, 'utf8'));
    const body = Buffer.concat([
      appBlock(s.deviceId),
      P.msg(3, [
        P.msg(3, [
          P.str(1, username),
          P.msg(2, [P.bytes(1, sealed)]),
        ]),
      ]),
      deviceBlock(s.deviceId),
      P.str(5, C.PROFILE),
    ]);
    const res = await this.raw('session/login', {
      body,
      headers: { 'content-type': `application/x-protobuf;reqMsg="${C.T.login}"; respMsg="${C.T.loginR}";` },
    });
    s.username = username;
    store.save(this.strip());
    const blk = P.first(res, 2);
    const f3 = blk ? P.first(blk, 3) : null;
    const maybeToken = f3 ? f3.toString('utf8') : null;
    if (maybeToken && maybeToken.split('.').length === 3) {
      this.setToken(maybeToken);
      return { res, token: maybeToken, otp: null };
    }
    // A fresh device gets an OTP instead. The request itself lives in the
    // navigation URI under f5, base64 encoded, and is echoed back verbatim as
    // the f2 block of the verify call.
    const otp = parseOtpRequest(res);
    s.otp = otp;
    store.save(this.strip());
    return { res, otp };
  }

  async otpVerify(code, otpRequest, otp) {
    const s = this.s;
    otp = otp || s.otp;
    if (!otp) throw new Error('no pending otp request');
    const body = Buffer.concat([
      P.msg(1, [
        P.bytes(1, crypto.randomBytes(16)),
        P.msg(4, [P.msg(1, [P.num(1, otp.ts1)]), P.msg(2, [P.num(1, otp.ts2)]), P.str(3, otp.sessionId || uuid())]),
        P.msg(8, [
          P.num(10, 0),
          P.bytes(998, deviceIdBinary(s.deviceId)),
          P.msg(999, versionBlock()),
        ]),
        P.msg(9, [P.str(1, C.LOCALE)]),
        clientInfo(),
      ]),
      P.msg(2, [P.str(1, otp.id), P.msg(2, [P.num(1, otp.ts1)]), P.msg(3, [P.num(1, 119)])]),
      P.msg(3, [P.bytes(1, X.aesSeal(s._secret, Buffer.from(code, 'utf8')))]),
    ]);
    const res = await this.raw('user/otp/verify', {
      body,
      signed: true,
      headers: { 'content-type': `application/x-protobuf;reqMsg="${C.T.otpVerify}"; respMsg="${C.T.otpVerifyR}";` },
    });
    const jwt = findJwt(res);
    if (jwt) this.setToken(jwt);
    s.otp = null;
    store.save(this.strip());
    return res;
  }

  // Persist only the serialisable parts.
  strip() {
    const s = this.s;
    return {
      deviceId: s.deviceId,
      privPkcs8: s.privPkcs8,
      secret: s.secret,
      kid: s.kid,
      token: s.token,
      expiresAt: s.expiresAt,
      username: s.username,
      password: s.password,
      profileId: s.profileId,
      otp: s.otp,
      createdAt: s.createdAt,
    };
  }

  setToken(jwt, ttlMs) {
    this.s.token = jwt;
    let exp = ttlMs;
    if (!exp) {
      try {
        const p = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
        exp = p.exp ? p.exp * 1000 - Date.now() : 900_000;
      } catch {
        exp = 900_000;
      }
    }
    this.s.expiresAt = Date.now() + exp;
    store.save(this.strip());
  }

  // ---- authenticated call ----

  async call(path, reqMsg, respMsg, body, { method = 'POST' } = {}) {
    await this.ensure();
    const ct = reqMsg
      ? `application/x-protobuf;reqMsg="${reqMsg}"; respMsg="${respMsg}";`
      : 'application/x-protobuf';
    try {
      return await this.raw(path, { method, body, signed: true, headers: { 'content-type': ct } });
    } catch (e) {
      // A token can be revoked server-side before it expires; renew once.
      if (e.status === 401 && this.s.password) {
        await this.refresh();
        return this.raw(path, { method, body, signed: true, headers: { 'content-type': ct } });
      }
      throw e;
    }
  }
}

module.exports = { BluClient, BluError, uuid, appBlock, deviceIdBinary };
