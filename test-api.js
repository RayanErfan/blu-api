'use strict';
// Smoke test: exercises every read route against the stored session.
const { BluClient } = require('./src/client');
const { Api } = require('./src/api');
const P = require('./src/proto');
const D = require('./src/derive');

const METHODS = [
  'profile', 'profiles', 'banners', 'deposits', 'cards', 'allCards', 'processedCards',
  'transactions', 'merchantCategories', 'transactionHashtags', 'cashbackCategories',
  'cashbackVendors', 'cheques', 'recentContacts', 'juniorChildren', 'banks',
  'onboardingSlides', 'identities', 'recentTransferAccounts', 'scheduledTransfers',
  'chargeRecentPhones', 'internetRecentPhones', 'billFavorites',
];

(async () => {
  const c = new BluClient();
  await c.ensure();
  const a = new Api(c);
  let bad = 0;
  for (const m of METHODS) {
    try {
      const r = await a[m]();
      console.log(m.padEnd(24), 'OK', r.length);
    } catch (e) {
      bad++;
      console.log(m.padEnd(24), 'FAIL', e.status, (e.body || Buffer.alloc(0)).toString('utf8').slice(0, 80).replace(/\s+/g, ' '));
    }
  }
  // cardOtp needs a pan, so it is exercised on its own.
  try {
    const all = await a.allCards();
    const card = P.first(P.first(P.first(all, 3), 2), 1).toString('utf8');
    const otp = D.cardOtp(await a.cardOtp(card), c.s._secret);
    if (!otp.code) throw new Error('no code');
    console.log('cardOtp'.padEnd(24), 'OK', otp.code);
  } catch (e) {
    bad++;
    console.log('cardOtp'.padEnd(24), 'FAIL', e.status || '', e.message);
  }

  // The transfer method table: the codes the client documents must be the ones
  // the gateway sends, and every row must carry an enabled flag. Both the
  // object and the bare-number call shape are checked.
  try {
    const recent = D.toJson(await a.recentTransferAccounts());
    const row = (recent['3'] || [])[0];
    const pan = row && row['1'] && row['1']['2'] && row['1']['2']['1'];
    if (!pan) throw new Error('no recent destination to probe');
    const bank = row['1']['2']['2'] && row['1']['2']['2']['1'];
    const dest = { card: pan, bank, formatted: row['1']['2']['3'] };

    for (const arg of [{ value: 1000 }, 1000]) {
      const table = D.toJson(await a.transferMethods(arg, dest));
      const rows = table['2'] || [];
      const codes = rows.map((m) => (m['1'] || {})['1']);
      for (const want of [1, 21, 22, 24, 25]) {
        if (!codes.includes(String(want))) throw new Error(`method ${want} missing from the table`);
      }
      if (rows.some((m) => typeof m['6'] !== 'string')) throw new Error('a row has no enabled flag');
      const enabled = rows.filter((m) => m['6'] === '1').map((m) => (m['1'] || {})['1']);
      if (!enabled.length) throw new Error('no enabled method for this destination');
      console.log('transferMethods'.padEnd(24), 'OK', `${typeof arg === 'number' ? 'number' : 'object'} arg, enabled ${enabled.join(',')}`);
    }
  } catch (e) {
    bad++;
    console.log('transferMethods'.padEnd(24), 'FAIL', e.status || '', e.message);
  }

  console.log(bad ? `${bad} failed` : 'all ok');
  process.exit(bad ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e.status || '', e.message);
  if (e.body) console.error(e.body.toString('utf8').slice(0, 300));
  process.exit(1);
});
