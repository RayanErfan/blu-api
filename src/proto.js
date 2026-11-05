'use strict';
// Minimal protobuf wire-format helpers. Blu speaks raw protobuf over
// application/x-protobuf; there is no .proto shipped, so fields are handled
// by number with the wire type they actually use.

function varint(n) {
  const out = [];
  let v = typeof n === 'bigint' ? n : BigInt(n);
  if (v < 0n) v += 1n << 64n;
  while (v > 0x7fn) {
    out.push(Number((v & 0x7fn) | 0x80n));
    v >>= 7n;
  }
  out.push(Number(v));
  return Buffer.from(out);
}

function tag(field, wire) {
  return varint((field << 3) | wire);
}

// length-delimited
function bytes(field, buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return Buffer.concat([tag(field, 2), varint(b.length), b]);
}

function str(field, s) {
  return bytes(field, Buffer.from(s, 'utf8'));
}

function num(field, n) {
  return Buffer.concat([tag(field, 0), varint(n)]);
}

function msg(field, parts) {
  return bytes(field, Buffer.concat(parts));
}

// ---- decoding ----

function readVarint(buf, i) {
  let r = 0n, sh = 0n;
  for (;;) {
    if (i >= buf.length) throw new Error('truncated varint');
    const c = buf[i++];
    r |= BigInt(c & 0x7f) << sh;
    sh += 7n;
    if (!(c & 0x80)) return [r, i];
  }
}

// Returns [{field, wire, value}] where value is Buffer (wire 2), BigInt (wire 0),
// or Buffer (wire 5/1).
function decode(buf) {
  const out = [];
  let i = 0;
  while (i < buf.length) {
    let k;
    [k, i] = readVarint(buf, i);
    const field = Number(k >> 3n);
    const wire = Number(k & 7n);
    if (wire === 0) {
      let v;
      [v, i] = readVarint(buf, i);
      out.push({ field, wire, value: v });
    } else if (wire === 2) {
      let l;
      [l, i] = readVarint(buf, i);
      const n = Number(l);
      if (i + n > buf.length) throw new Error('truncated length-delimited field');
      out.push({ field, wire, value: buf.subarray(i, i + n) });
      i += n;
    } else if (wire === 5) {
      if (i + 4 > buf.length) throw new Error('truncated fixed32 field');
      out.push({ field, wire, value: buf.subarray(i, i + 4) });
      i += 4;
    } else if (wire === 1) {
      if (i + 8 > buf.length) throw new Error('truncated fixed64 field');
      out.push({ field, wire, value: buf.subarray(i, i + 8) });
      i += 8;
    } else {
      throw new Error('unsupported wire type ' + wire);
    }
  }
  return out;
}

function first(buf, field) {
  const f = decode(buf).find((x) => x.field === field);
  return f ? f.value : undefined;
}

function all(buf, field) {
  return decode(buf).filter((x) => x.field === field).map((x) => x.value);
}

module.exports = { varint, tag, bytes, str, num, msg, decode, first, all, toJson };

// Best-effort JSON view of a protobuf blob: nested messages are expanded,
// printable/UTF-8 leaves become strings, everything else becomes base64.
//
// A truncated tail costs only the tail: the fields that decoded cleanly are
// still rendered and the unreadable remainder is attached as `_b64`, instead of
// collapsing the whole message into one opaque blob.
function toJson(buf, depth = 0) {
  if (!buf || !buf.length) return null;
  if (isText(buf)) return buf.toString('utf8');
  if (depth > 8) return { b64: buf.toString('base64') };
  const { fields, rest } = decodePartial(buf);
  if (!fields.length && rest) return { b64: buf.toString('base64') };
  const out = {};
  for (const f of fields) {
    let v;
    if (f.wire === 0) v = f.value.toString();
    else v = toJson(f.value, depth + 1);
    if (out[f.field] === undefined) out[f.field] = v;
    else {
      if (!Array.isArray(out[f.field])) out[f.field] = [out[f.field]];
      out[f.field].push(v);
    }
  }
  if (rest && rest.length) out._b64 = rest.toString('base64');
  return out;
}

// decode() but tolerant: stops at the first field it cannot read in full and
// hands the unread bytes back instead of throwing.
function decodePartial(buf) {
  const out = [];
  let i = 0;
  while (i < buf.length) {
    const start = i;
    let k;
    try { [k, i] = readVarint(buf, i); } catch { return { fields: out, rest: buf.subarray(start) }; }
    const field = Number(k >> 3n);
    const wire = Number(k & 7n);
    if (wire === 0) {
      let v;
      try { [v, i] = readVarint(buf, i); } catch { return { fields: out, rest: buf.subarray(start) }; }
      out.push({ field, wire, value: v });
    } else if (wire === 2) {
      let l;
      try { [l, i] = readVarint(buf, i); } catch { return { fields: out, rest: buf.subarray(start) }; }
      const n = Number(l);
      if (i + n > buf.length) return { fields: out, rest: buf.subarray(start) };
      out.push({ field, wire, value: buf.subarray(i, i + n) });
      i += n;
    } else if (wire === 5) {
      if (i + 4 > buf.length) return { fields: out, rest: buf.subarray(start) };
      out.push({ field, wire, value: buf.subarray(i, i + 4) });
      i += 4;
    } else if (wire === 1) {
      if (i + 8 > buf.length) return { fields: out, rest: buf.subarray(start) };
      out.push({ field, wire, value: buf.subarray(i, i + 8) });
      i += 8;
    } else {
      return { fields: out, rest: buf.subarray(start) };
    }
  }
  return { fields: out, rest: null };
}

// A leaf is text when it decodes as valid UTF-8 without control bytes.
function isText(buf) {
  if (buf.length < 2) return false;
  let s;
  try {
    s = new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return false;
  }
  return !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s);
}
