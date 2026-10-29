'use strict';
// Smoke test: exercises every read route against the stored session.
const { BluClient } = require('./src/client');
const { Api } = require('./src/api');

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
  console.log(bad ? `${bad} failed` : 'all ok');
  process.exit(bad ? 1 : 0);
})().catch((e) => {
  console.error('FATAL', e.status || '', e.message);
  if (e.body) console.error(e.body.toString('utf8').slice(0, 300));
  process.exit(1);
});
