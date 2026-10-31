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

// One transaction in full. The receipt number (کد پیگیری) is f17.1 and the
// rest is the usual amount, date, direction and counterparty tree.
function transactionDetail(row) {
  const at = (node, ...path) => path.reduce((x, k) => (x == null ? x : x[k]), node);
  return {
    receipt: text(at(row, '17', '1')),
    status: text(at(row, '17', '3')),
    type: text(at(row, '3', '2')),
    amount: text(at(row, '4', '1', '15')),
    currency: text(at(row, '4', '1', '2', '15')),
    date: text(at(row, '5', '1', '2', '4')),
    time: text(at(row, '5', '1', '3', '3')),
    direction: text(at(row, '6', '15')),
    counterparty: text(at(row, '10', '2', '1')),
    counterpartyCard: text(at(row, '10', '1', '15')),
    subject: text(at(row, '14')),
    description: text(at(row, '15')),
    receiptText: text(at(row, '17', '5', '1', '1')),
    tracking: text(at(row, '1')),
  };
}

// Account profiles on the party. f3[] carries one entry per profile:
// f1 = profile id ("main" for the personal one, a UUID for the rest),
// f2 = account block, f5 = type, f6 = completion, f3 = profile name.
function profiles(node) {
  const list = node && node['3'];
  if (!list) return [];
  const rows = Array.isArray(list) ? list : [list];
  return rows.map((p) => ({
    id: text(p['1']),
    name: text(p['3']),
    accountNumber: text(p['2'] && p['2']['1'] && p['2']['1']['1']),
    iban: text(p['2'] && p['2']['5'] && p['2']['5']['1'] && p['2']['5']['1']['1']),
    card: text(p['2'] && p['2']['5'] && p['2']['5']['2'] && p['2']['5']['2']['1']),
    type: text(p['5'] && p['5']['1']),
    kind: text(p['5'] && p['5']['15']),
    completion: text(p['6'] && p['6']['15']),
  }));
}

// Account kinds the user may open (f4[]): type, label, whether the bank will
// accept a request right now, and the reason when it will not.
function accountKinds(node) {
  const list = node && node['4'];
  if (!list) return [];
  const rows = Array.isArray(list) ? list : [list];
  return rows.map((o) => ({
    type: text(o['1'] && o['1']['1']),
    label: text(o['1'] && o['1']['15']),
    available: text(o['2']) === '1',
    reason: text(o['3'] && o['3']['3']),
    description: text(o['15']),
  }));
}

// Cards list. f3[] carries one entry per card: f2.1 = PAN, f4 = account block,
// f4.4 = status, f4.6 = balance.
function cards(node) {
  const list = node && node['3'];
  if (!list) return [];
  const rows = Array.isArray(list) ? list : [list];
  return rows.map((c) => ({
    pan: text(c['2'] && c['2']['1']),
    accountNumber: text(c['4'] && c['4']['1'] && c['4']['1']['1']),
    status: text(c['4'] && c['4']['4'] && c['4']['4']['1']),
    available: amount(c['4'] && c['4']['6'] && c['4']['6']['1']),
  }));
}

// Payment link enums, as the gateway numbers them.
const LINK_STATUS = {
  0: 'نامشخص',
  1: 'منتظر پرداخت',
  2: 'پرداخت‌شده',
  3: 'تسویه‌شده',
  4: 'منقضی',
  5: 'لغوشده',
};
const LINK_TYPE = { 0: 'نامشخص', 1: 'لینک عمومی', 2: 'لینک اختصاصی' };
const GENERAL_STATUS = { 0: 'نامشخص', 1: 'فعال', 2: 'غیرفعال' };

// The `details` block on a link is a list of label/value rows (مبلغ، لینک،
// وضعیت، انقضا، توضیحات). Flatten it so callers can read it by label.
function detailRows(node) {
  const list = node && node['7'];
  if (!list) return {};
  const rows = Array.isArray(list) ? list : [list];
  const out = {};
  for (const r of rows) {
    const label = text(r['1']);
    if (label) out[label] = text(r['2']);
  }
  return out;
}

// One PaymentLink: f1 id, f2 title, f4 amount, f5 status, f7 details,
// f9 link URI, f10 transaction id (once paid), f11 share text, f12 type.
function paymentLink(node) {
  const status = text(node['5']);
  const type = text(node['12']);
  const details = detailRows(node);
  return {
    id: text(node['1']),
    title: text(node['2']),
    amount: amount(node['4']),
    amountLabel: text(node['4'] && node['4']['15']),
    status,
    statusLabel: LINK_STATUS[status] || details['وضعیت'] || null,
    type,
    typeLabel: LINK_TYPE[type] || null,
    link: text(node['9'] && node['9']['1']),
    display: text(node['9'] && node['9']['15']),
    transactionId: text(node['10']),
    messageContent: text(node['11']),
    details,
  };
}

// f3[] is the «لینک‌ها و پرداخت‌ها» list: one row per created link, and one per
// payment once the link has been paid.
function paymentLinks(node) {
  const list = node && node['3'];
  if (!list) return [];
  const rows = Array.isArray(list) ? list : [list];
  return rows.map(paymentLink);
}

// f5 is the permanent «لینک عمومی» of a business profile. f5.5 is its status
// (1 active), f5.4 is an optional notice {1: code, 3: text}.
function paymentLinkGeneral(node) {
  const g = node && node['5'];
  if (!g) return null;
  const status = text(g['5']);
  return {
    title: text(g['1']),
    url: text(g['2'] && g['2']['1']),
    display: text(g['2'] && g['2']['15']),
    status,
    statusLabel: GENERAL_STATUS[status] || null,
    notice: text(g['4'] && g['4']['3']),
    messageContent: text(g['6']),
  };
}

// f4 is the amount range a new link must fall inside.
function paymentLinkRestriction(node) {
  const r = node && node['4'];
  if (!r) return null;
  return {
    minimum: amount(r['1']),
    maximum: amount(r['2']),
    minimumLabel: text(r['1'] && r['1']['15']),
    maximumLabel: text(r['2'] && r['2']['15']),
  };
}

// Validate / landing replies are a oneof: f2 = payable transfer info,
// f3 = the reason it cannot be paid.
function paymentLinkValidity(node) {
  const invalid = node && node['3'];
  const transfer = node && node['2'];
  return {
    valid: Boolean(transfer) && !invalid,
    transfer: transfer
      ? {
          amount: amount(transfer['1']),
          owner: text(transfer['2'] && transfer['2']['15']),
          settleCode: text(transfer['3']),
          occurrenceType: text(transfer['4']),
        }
      : null,
    invalid: invalid
      ? { title: text(invalid['1']), message: text(invalid['2']) }
      : null,
  };
}

module.exports = {
  text,
  amount,
  balances,
  primarySource,
  cardOtp,
  transactionDetail,
  profiles,
  accountKinds,
  cards,
  paymentLink,
  paymentLinks,
  paymentLinkGeneral,
  paymentLinkRestriction,
  paymentLinkValidity,
  toJson: P.toJson,
};
