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

  console.log(bad ? `${bad} failed` : 'all ok');
  process.exit(bad ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e.status || '', e.message);
  if (e.body) console.error(e.body.toString('utf8').slice(0, 300));
  process.exit(1);
});
