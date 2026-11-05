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
// The gateway ignores the type filter and returns every profile, so the
// filter is applied here.
app.get('/profiles', wrap(async (req) => {
  const types = String(req.query.types || '').split(',').map((x) => Number(x)).filter(Boolean);
  const j = D.toJson(await api.profiles());
  if (!types.length) return j;
  const list = j['3'];
  if (Array.isArray(list)) {
    j['3'] = list.filter((p) => types.includes(Number(p['5'] && p['5']['1'])));
  }
  return j;
}));
// Parsed view: one entry per profile plus the account kinds the user may open.
app.get('/profiles/summary', wrap(async () => {
  const j = D.toJson(await api.profiles());
  return { profiles: D.profiles(j), kinds: D.accountKinds(j) };
}));

// Every account on the party, personal and business.
app.get('/accounts', wrap(async () => {
  const p = D.toJson(await api.profile());
  const party = p['2'] && p['2']['2'];
  const b = D.balances(D.toJson(await api.deposits(party)));
  return { accounts: b };
}));

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
// `?account=` scopes the list to one deposit (business profile included).
app.get('/cards/all', raw((req) => api.allCards(req.query.account)));
app.get('/cards/processed', raw(() => api.processedCards()));

// Dynamic second password (رمز دوم پویا) for one card, valid for about two
// minutes. `card` is the PAN.
app.get('/cards/:card/otp', wrap(async (req) => {
  const res = await api.cardOtp(req.params.card);
  return D.cardOtp(res, client.s && client.s._secret);
}));

app.get('/owner/:identifier', raw((req) => api.owner(req.params.identifier)));

// ---- transactions ----

// `?account=` scopes history to one deposit; `page`/`size` page through it.
app.get('/transactions', raw((req) => api.transactions(req.query.account, {
  size: Math.min(Number(req.query.size) || 20, 100),
  page: Math.max(Number(req.query.page) || 1, 1),
})));
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

// ---- payment links (لینک پرداخت) ----

// These routes only answer for a business profile. The previously selected
// profile is restored afterwards so the rest of the API is unaffected.
const withBusiness = async (fn) => {
  await client.ensure();
  const prev = {
    profileId: client.s.profileId,
    profileRef: client.s.profileRef,
    profileType: client.s.profileType,
  };
  await api.useProfile('business');
  try {
    return await fn();
  } finally {
    client.s.profileId = prev.profileId;
    client.s.profileRef = prev.profileRef;
    client.s.profileType = prev.profileType;
    store.save(client.strip());
  }
};

// The «لینک‌ها و پرداخت‌ها» tab: every created link, and one row per payment
// once a link has been paid. Also carries the permanent general link and the
// amount range a new link must fall inside.
app.get('/payment-links', wrap(async (req) => {
  const count = Math.min(Number(req.query.count) || 20, 100);
  const j = D.toJson(await withBusiness(() => api.paymentLinks({ count })));
  return {
    links: D.paymentLinks(j),
    generalLink: D.paymentLinkGeneral(j),
    creationRestriction: D.paymentLinkRestriction(j),
  };
}));

app.get('/payment-links/general', wrap(async () => {
  const j = D.toJson(await withBusiness(() => api.paymentLinks({ count: 1 })));
  return D.paymentLinkGeneral(j);
}));

app.post('/payment-links/create', wrap(async (req) => {
  const { amount, description } = req.body || {};
  if (amount === undefined || amount === null) throw new Error('amount is required');
  const j = D.toJson(await withBusiness(() => api.createPaymentLink({ amount, description })));
  return D.paymentLink(j['2']);
}));

// Payer-side check. Uses the current profile, not the business one.
app.post('/payment-links/validate', wrap(async (req) => {
  const { id, amount } = req.body || {};
  if (!id) throw new Error('id is required');
  return D.paymentLinkValidity(D.toJson(await api.validatePaymentLink(id, amount)));
}));

app.get('/payment-links/:id/receipt', wrap(async (req) => {
  return D.toJson(await withBusiness(() => api.paymentLinkReceipt(req.params.id)));
}));

// ---- transfers ----

app.get('/transfers/recent', raw(() => api.recentTransferAccounts()));
app.get('/transfers/scheduled', raw(() => api.scheduledTransfers()));

app.get('/transfers/:id', raw((req) => api.transferGet(req.params.id)));
app.post('/transfers/:id/cancel', raw((req) => api.transferCancel(req.params.id)));

// { amount, to, bank?, method?, source? }
// `to` is a card number or IBAN; `bank` is the destination bank code.
//
// The gateway decides which methods the destination accepts: most destinations
// support card-to-card (24), but a Blu-to-Blu destination (e.g. a Blu Junior
// card) only takes method 1 («بلو به بلو») and rejects every interbank rail.
// The requested `method` is used only when the gateway lists it as enabled;
// otherwise the first enabled method in PREFERENCE order is picked, and if none
// is enabled the call fails with the gateway's reason instead of submitting a
// doomed create.
//
// `result` carries the receipt. The gateway reports the outcome in
// `result.3.6` (f1 «1» = انتقال موفق, «4» = انتقال ناموفق, f2 = the Persian
// message); anything but «1» is a failed transfer and is returned as an error,
// never as ok:true. A reply with no receipt tree at all is not a failure: the
// outcome is looked up by transfer id and, if that is inconclusive too, the
// call returns ok:null instead of guessing.
const METHOD_PREFERENCE = [1, 24, 25, 21, 22];

app.post('/transfers', wrap(async (req, res) => {
  const { to, bank, method, source } = req.body || {};
  const amount = Number(req.body && req.body.amount);
  if (!Number.isSafeInteger(amount) || amount <= 0) return { error: 'amount must be a positive integer (IRR)' };
  if (typeof to !== 'string' || !to.trim()) return { error: 'to required' };

  const owner = D.toJson(await api.owner(to));
  const destBank = bank || (owner && owner['2'] && owner['2']['1'] && owner['2']['1']['2'] && owner['2']['1']['2']['1']);
  const dest = { card: to, bank: destBank, formatted: owner && owner['2'] && owner['2']['3'] };

  const src = source || D.primarySource(D.toJson(await api.allCards()));
  if (!src) return { error: 'no source card found' };

  const methods = D.toJson(await api.transferMethods({ value: amount }, dest));
  const list = Array.isArray(methods['2']) ? methods['2'] : [];
  const enabled = list.filter((m) => (m['6'] || '') === '1');

  let chosen;
  if (method != null) {
    const wanted = String(method);
    const match = list.find((m) => String((m['1'] || {})['1']) === wanted);
    if (match && (match['6'] || '') === '1') {
      chosen = Number(wanted);
    } else {
      const reasons = [...new Set(list.map((m) => m['15']).filter(Boolean))];
      return { ok: false, error: 'requested transfer method is not available for this destination', method: Number(wanted), methods: list, reason: reasons[0] || null };
    }
  } else {
    const byCode = new Map(enabled.map((m) => [Number((m['1'] || {})['1']), m]));
    const preferred = METHOD_PREFERENCE.find((c) => byCode.has(c));
    chosen = preferred !== undefined ? preferred : null;
    if (!chosen) {
      const reasons = [...new Set(list.map((m) => m['15']).filter(Boolean))];
      return { ok: false, error: 'no transfer method available for this destination', methods: list, reason: reasons[0] || null };
    }
  }

  let created;
  try {
    created = D.toJson(await api.transferCreate({ amount: { value: amount }, source: src, dest, method: chosen }));
  } catch (e) {
    if (e instanceof BluError) {
      let msg = null;
      try { const b = JSON.parse(e.body.toString('utf8')); msg = b.message || null; } catch { /* keep null */ }
      res.status(502).json({
        ok: false,
        error: 'gateway rejected the transfer',
        method: chosen,
        source: src.card,
        destination: to,
        gatewayStatus: e.status,
        message: msg,
        availableMethods: list,
      });
      return;
    }
    throw e;
  }
  const r = created && created['3'] && created['3']['6'];
  let status = r && r['1'];
  // result.2 is the id as a bare string on success and a {1:id, 6:{…}} message
  // on failure, so accept both shapes.
  const rawId = created && created['2'];
  const idText = (typeof rawId === 'string' ? rawId : (rawId && rawId['1'])) || '';
  const lookupId = idText.replace(/^\n/, '');
  const id = idText.replace(/^\n\$?/, '') || null;
  let gatewayMsg = (typeof rawId === 'object' && rawId && rawId['6'] && rawId['6']['15']) || null;

  // No receipt tree at all: the gateway may have accepted the transfer and just
  // not reported it. Ask again by id before calling it a failure.
  if (status === undefined && lookupId) {
    try {
      const got = D.toJson(await api.transferGet(lookupId));
      const gr = got && got['3'] && got['3']['6'];
      if (gr && gr['1'] !== undefined) {
        status = gr['1'];
        gatewayMsg = gr['2'] || gatewayMsg;
      }
    } catch {
      // keep status undefined
    }
  }

  if (status === undefined) {
    return {
      ok: null,
      error: 'transfer outcome unknown',
      method: chosen,
      transferId: id,
      source: src.card,
      destination: to,
      availableMethods: list,
      result: created,
    };
  }

  if (status !== '1') {
    return {
      ok: false,
      error: 'transfer failed',
      method: chosen,
      status: r && r['2'],
      reason: r && r['3'],
      gatewayMessage: gatewayMsg,
      transferId: id,
      source: src.card,
      destination: to,
      availableMethods: list,
      result: created,
    };
  }
  return { ok: true, method: chosen, source: src.card, destination: to, availableMethods: list, result: created };
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
