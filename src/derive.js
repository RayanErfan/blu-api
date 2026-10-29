'use strict';
// Presentation helpers: turn the raw protobuf trees into flat JSON and pull out
// the few values the API needs (balances, a source card).

const P = require('./proto');
const X = require('./crypto');

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

// The dynamic second password (رمز دوم پویا) for a card. The reply carries an
// otpRequest window in f2 and the password sealed under the session key in f3.
//
// The sealed blob is 34 bytes (12 nonce, 6 digits, 16 tag) and it usually
// starts with bytes that look like a protobuf header, so a JSON view of the
// reply cuts it short. This walks the raw bytes instead: every length-delimited
// field under f3 is a candidate, outer before inner, and the first one that
// authenticates wins.
function sealedCandidates(buf, out = []) {
  if (!buf || !buf.length) return out;
  out.push(buf);
  let fields;
  try {
    fields = P.decode(buf);
  } catch {
    return out;
  }
  for (const f of fields) if (f.wire === 2) sealedCandidates(f.value, out);
  return out;
}

function cardOtp(res, secret) {
  const req = P.toJson(P.first(res, 2)) || {};
  const validFrom = Number((req['2'] && req['2']['1']) || 0);
  const duration = Number((req['3'] && req['3']['1']) || 0);

  let code = null;
  for (const buf of sealedCandidates(P.first(res, 3))) {
    try {
      code = X.aesOpen(secret, buf).toString('utf8');
      break;
    } catch {
      // try the next one
    }
  }

  return {
    code,
    otpRequest: text(req['1']),
    validFrom,
    expiresIn: duration,
    expiresAt: validFrom ? (validFrom + duration) * 1000 : null,
  };
}

module.exports = { text, amount, balances, primarySource, cardOtp, toJson: P.toJson };
