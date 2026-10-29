#!/usr/bin/env node
'use strict';
// Command line front end for the same client the HTTP API uses.
//
//   node cli.js login [username] [password]   log in (prompts for what is missing)
//   node cli.js otp <code>                    finish a login that needs an OTP
//   node cli.js status                        show the stored session
//   node cli.js logout                        forget the session
//   node cli.js call <path> [json]            raw gateway call
//   node cli.js balance                       balances as JSON

const readline = require('readline');
const { BluClient, BluError } = require('./src/client');
const { Api } = require('./src/api');
const D = require('./src/derive');
const store = require('./src/session');

const client = new BluClient();
const api = new Api(client);

function ask(question, hidden) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    if (!hidden) return rl.question(question, (a) => { rl.close(); resolve(a.trim()); });
    process.stdout.write(question);
    const stdin = process.stdin;
    stdin.resume();
    let buf = '';
    const onData = (c) => {
      const s = c.toString();
      if (s.includes('\n') || s.includes('\r')) {
        stdin.removeListener('data', onData);
        stdin.pause();
        process.stdout.write('\n');
        rl.close();
        resolve(buf);
      } else {
        buf += s;
      }
    };
    stdin.on('data', onData);
  });
}

const out = (v) => console.log(JSON.stringify(v, null, 2));

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);

  if (cmd === 'login') {
    const username = rest[0] || (await ask('username: '));
    const password = rest[1] || (await ask('password: ', true));
    const { token, otp } = await client.login(username, password);
    if (token) {
      console.log('logged in; token valid for', Math.round((client.s.expiresAt - Date.now()) / 1000), 's');
      return;
    }
    console.log('OTP required for otp_request', otp && otp.id);
    const code = await ask('otp code: ');
    await client.otpVerify(code, null, otp);
    console.log('logged in');
    return;
  }

  if (cmd === 'otp') {
    const code = rest[0] || (await ask('otp code: '));
    await client.otpVerify(code);
    console.log('logged in');
    return;
  }

  if (cmd === 'status') {
    const s = store.load();
    out({
      loggedIn: Boolean(s && s.username),
      username: s && s.username,
      deviceId: s && s.deviceId,
      tokenFresh: store.isFresh(s),
      expiresIn: s && s.expiresAt ? Math.max(0, Math.round((s.expiresAt - Date.now()) / 1000)) : 0,
    });
    return;
  }

  if (cmd === 'logout') {
    store.clear();
    console.log('session cleared');
    return;
  }

  if (cmd === 'balance') {
    await client.ensure();
    out(D.balances(D.toJson(await api.deposits())));
    return;
  }

  if (cmd === 'call') {
    const path = rest[0];
    if (!path) throw new Error('usage: call <path> [json]');
    const payload = rest[1] ? JSON.parse(rest[1]) : {};
    const req = payload.req || 'BareRequest';
    const resp = payload.resp || 'BareResponse';
    const body = payload.body ? Buffer.from(payload.body, 'base64') : Buffer.alloc(0);
    out(D.toJson(await client.call(path, req, resp, body)));
    return;
  }

  console.log('usage: node cli.js <login|otp|status|logout|balance|call>');
}

main().catch((e) => {
  if (e instanceof BluError) {
    console.error('gateway', e.status, e.path);
    console.error(e.body.toString('utf8').slice(0, 600));
  } else {
    console.error(e.message);
  }
  process.exit(1);
});
