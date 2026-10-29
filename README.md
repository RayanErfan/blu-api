# blu-api

A personal HTTP API for **Blu Bank** (`com.samanpr.blu`). It speaks the bank's own
gateway protocol directly — no browser, no app, no scraping.

```
npm install
BLU_PROXY=socks5h://127.0.0.1:1080 npm run login     # once
BLU_PROXY=socks5h://127.0.0.1:1080 npm start
```

`data/` is created on first login and holds the session. See `.env.example` for
the available settings.

Then call it:

```
curl -s localhost:8088/balance
curl -s -X POST localhost:8088/transfers -H 'content-type: application/json' \
     -d '{"amount":100000,"to":"6104335551234567"}'
```

`example/` has a Python script per endpoint and a recorded response for each,
with the account details replaced by fake ones. See `example/README.md`.

---

## Why a proxy

`openapi.sdb247.com` is split-horizon DNS: outside Iran it resolves to a dead
German address. All traffic must leave from an Iranian IP. Point `BLU_PROXY` at
any SOCKS5 or HTTP proxy that exits there — `socks5h` is preferred so DNS is
resolved remotely.

The gateway also only speaks **HTTP/2**. An HTTP/1.1 ClientHello is dropped at
the handshake, so the transport is `http2.connect` with explicit
`:method`/`:path`/`:scheme`/`:authority` pseudo-headers.

## How auth works

Recovered from the PWA bundle and verified live:

1. `POST /openapi/v0/session/key-exchange` — the client sends an ECDH P-256
   public key (DER SPKI). The server answers with its own SPKI and a `kid`.
2. The raw ECDH shared secret is used **directly** as two keys, with no KDF:
   an AES-256-GCM key and an HMAC-SHA256 key.
3. `POST /openapi/v0/session/login` — the password is sealed with AES-256-GCM
   (`nonce ‖ ciphertext ‖ tag`) and sent as a protobuf field.
4. Every authenticated call carries an `x-jws-signature`: a detached-payload JWS
   (RFC 7797, `b64:false`, `crit:["b64"]`) whose `requestId` header claim is
   bound to the `x-request-id` header, over the exact request body. A Bearer
   token alone is not enough — the gateway answers 401.
5. The token is an RS256 JWT from WSO2 API Manager with a 900 s TTL.

### Session persistence

The device id is a random UUID that is written to `data/sessions.json` and reused
forever. Once a device has completed an OTP it is **trusted**, and login returns
the token straight away with no OTP. That is what makes the tool usable:

- the token, its expiry, the device id, the ECDH private key and the credentials
  live in `data/sessions.json` (mode `0600`), one slot per username;
- `ensure()` hands back a live token, and silently re-logs-in when it has run
  out — no OTP, no user interaction;
- a 401 on any call triggers one renewal and a retry;
- concurrent callers share a single renewal round trip.

So the session survives restarts and renews itself for as long as the bank keeps
trusting the device. `npm run logout` wipes it.

## Layout

| file | role |
| --- | --- |
| `src/proto.js` | protobuf wire encode/decode + JSON renderer |
| `src/crypto.js` | ECDH, AES-256-GCM seal/open, detached JWS signer |
| `src/client.js` | device identity, key exchange, login, OTP, HTTP/2 transport |
| `src/session.js` | on-disk session store |
| `src/api.js` | one method per gateway route |
| `src/derive.js` | balance / source-card extraction |
| `server.js` | HTTP API |
| `cli.js` | login, OTP, status, raw calls |
| `example/` | Python examples, one per endpoint, plus captured responses |

## Endpoints

Set `BLU_API_KEY` to require an `x-api-key` header on everything but `/health`.

| method | path | notes |
| --- | --- | --- |
| GET | `/health` | liveness |
| GET | `/status` | login state, token TTL |
| POST | `/login` | `{username,password}`; reports `otpRequired` |
| POST | `/otp` | `{code}` to finish a fresh-device login |
| POST | `/logout` | drop the stored session |
| GET | `/profile` | identity, phone, party id |
| GET | `/profiles` | account profiles |
| GET | `/balance` | summed available balance |
| GET | `/balances` | every deposit with available/current |
| GET | `/cards` | recent transfer cards |
| GET | `/cards/all` | own cards |
| GET | `/cards/processed` | processed card orders |
| GET | `/owner/:identifier` | owner lookup for a card or IBAN |
| GET | `/transactions` | full transaction history |
| GET | `/transactions/categories` | merchant categories |
| GET | `/transactions/hashtags` | hashtags |
| GET | `/transfers/recent` | recent transfer destinations |
| GET | `/transfers/scheduled` | scheduled transfer contracts |
| GET | `/transfers/:id` | one transfer |
| POST | `/transfers/:id/cancel` | cancel a transfer |
| POST | `/transfers` | `{amount,to,bank?,method?,source?}` |
| GET | `/charge/recent-phones` | recent top-up numbers |
| GET | `/internet/recent-phones` | recent internet packages |
| GET | `/bill/favorites` | saved bills |
| GET | `/banks` | bank directory |
| GET | `/banners` | dashboard banners |
| GET | `/onboarding` | onboarding slides |
| GET | `/junior` | junior accounts |
| GET | `/identities` | identity traits |
| GET | `/cashback/categories` | cashback categories |
| GET | `/cashback/vendors` | cashback vendors |
| GET | `/cheques` | cheque registry |
| GET | `/contacts` | recent contacts |
| GET | `/raw/{path}` | escape hatch, `?req=&resp=` message types |

Transfer methods: `24` card-to-card, `25` instant (Pol), `26` Paya, `27` Satna.
The default is `24`.

## CLI

```
node cli.js login [user] [pass]
node cli.js otp <code>
node cli.js status
node cli.js balance
node cli.js logout
node cli.js call account/deposit/list/all '{"req":"solutions.saman.bluebank.services.AccountListAllRequest","resp":"...Response"}'
```

## Notes

- Request bodies are raw protobuf with no `.proto`; fields are addressed by
  number. Most routes take the shared app block plus route fields.
- Payment routes carry a `blubank://payment-service/<name>` URI nested two
  levels deep in field 3.
- `identities` is the one JSON route.
- The gateway is rate-sensitive; a burst of unknown routes can return 500s for
  a minute.

Built for personal use.

`example/` has a Python script per endpoint and a recorded response for each,
so the shape of every route is readable without running anything.
