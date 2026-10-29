'use strict';
// HTTP API over the Blu gateway. Start with `npm start`, then log in once with
// `npm run login`; the session is reused and renewed automatically until the
// device stops being trusted.

const express = require('express');
const { BluClient, BluError } = require('./src/client');
const { Api } = require('./src/api');
const D = require('./src/derive');
const P = require('./src/proto');
const store = require('./src/session');

const PORT = Number(process.env.PORT || 8088);
const KEY = process.env.BLU_API_KEY || '';

const client = new BluClient();
const api = new Api(client);

const app = express();
app.use(express.json({ limit: '1mb' }));

// Optional shared-secret gate.
app.use((req, res, next) => {
  if (!KEY) return next();
  if (req.path === '/health') return next();
  const got = req.get('x-api-key') || req.query.key;
  if (got === KEY) return next();
  res.status(401).json({ error: 'bad or missing x-api-key' });
});

// Runs a handler and renders protobuf results as JSON.
const wrap = (fn) => async (req, res) => {
  try {
    const out = await fn(req, res);
    if (out === undefined) return;
    res.json(out);
  } catch (e) {
    if (e instanceof BluError) {
      const body = e.body.toString('utf8');
      let parsed;
      try { parsed = JSON.parse(body); } catch { parsed = body.slice(0, 500); }
      return res.status(e.status).json({ error: 'gateway', status: e.status, path: e.path, detail: parsed });
    }
    res.status(500).json({ error: e.message });
  }
};

const raw = (fn) => async (req, res) => {
  try {
    const out = await fn(req);
    res.json(Buffer.isBuffer(out) ? D.toJson(out) : out);
  } catch (e) {
    if (e instanceof BluError) return res.status(e.status).json({ error: 'gateway', status: e.status, detail: e.body.toString('utf8').slice(0, 300) });
    res.status(500).json({ error: e.message });
  }
};

// ---- meta ----

app.get('/health', (req, res) => res.json({ ok: true }));

app.get('/status', wrap(async () => {
  const s = store.load();
  return {
    loggedIn: Boolean(s && s.username),
    username: s && s.username,
    deviceId: s && s.deviceId,
    tokenFresh: store.isFresh(s),
    expiresIn: s && s.expiresAt ? Math.max(0, Math.round((s.expiresAt - Date.now()) / 1000)) : 0,
  };
}));

// ---- auth ----

app.post('/login', wrap(async (req) => {
  const { username, password } = req.body || {};
  if (!username || !password) return { error: 'username and password required' };
  const { token, otp } = await client.login(username, password);
  if (token) return { ok: true, otpRequired: false };
  return { ok: true, otpRequired: true, otpRequest: otp && otp.id };
}));

app.post('/otp', wrap(async (req) => {
  const { code } = req.body || {};
  if (!code) return { error: 'code required' };
  const s = store.load();
  await client.otpVerify(code, null, s && s.otp);
  return { ok: true, tokenFresh: store.isFresh(store.load()) };
}));

app.post('/logout', wrap(async () => {
  store.clear();
  client.s = null;
  return { ok: true };
}));

// ---- account ----

app.get('/profile', raw(() => api.profile()));
app.get('/profiles', raw(() => api.profiles()));

app.get('/balances', raw(async () => {
  const b = D.balances(D.toJson(await api.deposits()));
  return { accounts: b };
}));

app.get('/balance', wrap(async () => {
  const b = D.balances(D.toJson(await api.deposits()));
  const total = b.reduce((sum, a) => sum + Number(a.available && a.available.value || 0), 0);
  return {
    currency: 'IRR',
    total: String(total),
    accounts: b.map((a) => ({ iban: a.iban, available: a.available, current: a.current })),
  };
}));

app.get('/cards', raw(() => api.cards()));
app.get('/cards/all', raw(() => api.allCards()));
app.get('/cards/processed', raw(() => api.processedCards()));

// Dynamic second password (رمز دوم پویا) for one card, valid for about two
// minutes. `card` is the PAN.
app.get('/cards/:card/otp', wrap(async (req) => {
  const res = await api.cardOtp(req.params.card);
  return D.cardOtp(res, client.s && client.s._secret);
}));

app.get('/owner/:identifier', raw((req) => api.owner(req.params.identifier)));

// ---- transactions ----

app.get('/transactions', raw(() => api.transactions()));
app.get('/transactions/categories', raw(() => api.merchantCategories()));
app.get('/transactions/hashtags', raw(() => api.transactionHashtags()));

// One transaction by its receipt number (کد پیگیری). There is no lookup by
// receipt, so this walks the history; `?pages=` bounds how far back it goes.
app.get('/transactions/find/:code', wrap(async (req) => {
  const pages = Math.min(Number(req.query.pages) || 50, 500);
  const row = await api.findTransaction(req.params.code, { pages });
  if (!row) return { error: 'no transaction with that receipt number', receipt: req.params.code };
  return D.transactionDetail(D.toJson(row));
}));

// One transaction by the row id from the list. The id is base64 and can contain
// `/`, so callers must percent-encode it.
app.get('/transactions/detail/:id', wrap(async (req) => {
  const res = await api.transactionDetail(req.params.id);
  const row = P.first(res, 3);
  if (!row) return { error: 'no such transaction' };
  return D.transactionDetail(D.toJson(row));
}));

// ---- transfers ----

app.get('/transfers/recent', raw(() => api.recentTransferAccounts()));
app.get('/transfers/scheduled', raw(() => api.scheduledTransfers()));

app.get('/transfers/:id', raw((req) => api.transferGet(req.params.id)));
app.post('/transfers/:id/cancel', raw((req) => api.transferCancel(req.params.id)));

// { amount, to, bank?, method?, source? }
// `to` is a card number or IBAN; `bank` is the destination bank code.
app.post('/transfers', wrap(async (req) => {
  const { amount, to, bank, method = 24, source } = req.body || {};
  if (!amount || !to) return { error: 'amount and to required' };

  const owner = D.toJson(await api.owner(to));
  const destBank = bank || (owner && owner['2'] && owner['2']['1'] && owner['2']['1']['2'] && owner['2']['1']['2']['1']);
  const dest = { card: to, bank: destBank, formatted: owner && owner['2'] && owner['2']['3'] };

  const src = source || D.primarySource(D.toJson(await api.allCards()));
  if (!src) return { error: 'no source card found' };

  const methods = D.toJson(await api.transferMethods({ value: amount }, dest));
  const res = await api.transferCreate({ amount: { value: amount }, source: src, dest, method });
  return { ok: true, method, source: src.card, destination: to, availableMethods: methods, result: D.toJson(res) };
}));

// ---- payments ----

app.get('/charge/recent-phones', raw(() => api.chargeRecentPhones()));
app.get('/internet/recent-phones', raw(() => api.internetRecentPhones()));
app.get('/bill/favorites', raw(() => api.billFavorites()));

// ---- general ----

app.get('/banks', raw(() => api.banks()));
app.get('/banners', raw(() => api.banners()));
app.get('/onboarding', raw(() => api.onboardingSlides()));
app.get('/junior', raw(() => api.juniorChildren()));
app.get('/identities', raw(async () => {
  const buf = await api.identities();
  try { return JSON.parse(buf.toString('utf8')); } catch { return buf.toString('utf8'); }
}));
app.get('/cashback/categories', raw(() => api.cashbackCategories()));
app.get('/cashback/vendors', raw(() => api.cashbackVendors()));
app.get('/cheques', raw(() => api.cheques()));
app.get('/contacts', raw(() => api.recentContacts()));

// ---- escape hatch ----

app.get('/raw/{*path}', raw((req) => api._post(req.params.path.join('/'), req.query.req || 'BareRequest', req.query.resp || 'BareResponse')));

app.listen(PORT, () => {
  console.log(`blu api on http://127.0.0.1:${PORT}`);
  if (!process.env.BLU_PROXY) console.log('warning: BLU_PROXY is unset, the gateway is geo-fenced');
});
