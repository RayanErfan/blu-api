'use strict';
// Presentation helpers: turn the raw protobuf trees into flat JSON and pull out
// the few values the API needs (balances, a source card).

const P = require('./proto');

// Persian digits and the RTL mark are common in formatted strings.
function text(v) {
  if (v === undefined || v === null) return null;
  if (Buffer.isBuffer(v)) return v.toString('utf8');
  return String(v);
}

function amount(node) {
  if (!node) return null;
  const raw = node['1'];
  return { value: text(raw && raw['1']), currency: text(node['2'] && node['2']['1']) };
}

// Deposits come back as f3[] with f1=f10 number, f5=f1 IBAN, f6 balances.
function balances(deposits) {
  const list = deposits && deposits['3'];
  if (!list) return [];
  const rows = Array.isArray(list) ? list : [list];
  return rows.map((d) => ({
    depositNumber: text(d['1'] && d['1']['1']),
    iban: text(d['5'] && d['5']['1'] && d['5']['1']['1']),
    type: text(d['15']),
    owner: text(d['10'] && d['10']['2']),
    available: amount(d['6'] && d['6']['1']),
    current: amount(d['6'] && d['6']['2']),
  }));
}

// First card in f3[] with a usable pan + bank.
function primarySource(cards) {
  const list = cards && cards['3'];
  if (!list) return null;
  const rows = Array.isArray(list) ? list : [list];
  for (const c of rows) {
    const pan = c['2'] && c['2']['1'];
    const bank = c['2'] && c['2']['2'] && c['2']['2']['1'];
    if (pan && bank) {
      return { card: text(pan), bank: text(bank), formatted: text(c['2'] && c['2']['3']) };
    }
  }
  return null;
}

module.exports = { text, amount, balances, primarySource, toJson: P.toJson };
