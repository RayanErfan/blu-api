# examples

Small Python scripts, one per endpoint, plus the responses they return.

The API is protobuf over HTTP/2, which is awkward to read by hand. These
scripts talk to the local HTTP wrapper in the parent directory instead, so each
example is a couple of lines and the reply is plain JSON.

Everything here is standard library only — nothing to install.

## Data

The account in the examples is made up. Replace the credentials in `login.py`
(or set `BLU_USER` / `BLU_PASS`) with your own.

| | |
| --- | --- |
| username | `rezaei` |
| password | `Test@1234` |
| card | `6104335551234567` |
| IBAN | `IR000560611828001111111101` |

`output/` holds the real shape of every response, captured from a live account
and then rewritten with the same fake details, so the scripts and the captures
agree with each other.

## Running

Start the server first:

```
cd ..
BLU_PROXY=socks5h://127.0.0.1:1080 npm start
```

Then, from this folder:

```
python3 login.py
python3 methods/balance.py
```

Set `BLU_BASE` if the server is not on `http://127.0.0.1:8088`, and
`BLU_API_KEY` if it was started with one.

## Files

| file | role |
| --- | --- |
| `blu.py` | the client every script imports |
| `login.py` | start a session |
| `otp.py` | finish a fresh-device login |
| `logout.py` | drop the session |
| `transfer.py` | send money |
| `methods/card_otp.py` | dynamic second password for a card |
| `methods/transaction_find.py` | one transaction by its receipt number |
| `transfer_get.py` | fetch one transfer |
| `transfer_cancel.py` | cancel a transfer |
| `raw.py` | call a gateway route with no dedicated endpoint |
| `capture.py` | re-record everything in `output/` |
| `gen.py` | regenerate `methods/` |

`methods/` is one script per read endpoint, named after the route:

```
status  profile  profiles  profiles_summary  accounts  balance  balances
cards  cards_all  cards_processed  business
owner  card_otp  transaction_find  transactions  transactions_categories
transactions_hashtags  transfers_recent  transfers_scheduled
charge_recent_phones  internet_recent_phones  bill_favorites  banks  banners
onboarding  junior  identities  cashback_categories  cashback_vendors  cheques
contacts
```

## Capturing

`capture.py` records a fresh response for every route into `output/`. It also
performs one real 1,000 IRR transfer, because the transfer receipt is the most
interesting response in the set.

```
python3 capture.py 6104335551234567
```

The argument is the destination card. Without it the script uses the first card
in your recent-transfer list. A card of your own works; your own Blu card does
not, because source and destination must differ.

`login.json` and `otp.json` are recorded separately, by hand, since they need a
code from the phone.

## Notes

- `transfers_get` and `transfers_cancel` are captured as errors. The gateway
  only resolves ids minted by the two-step `transfer/init` + `submit` flow, and
  `transfer/create` — the one-shot route used by `transfer.py` — returns a
  different kind of id.
- `identities` is the one route that takes JSON rather than protobuf.
- A few routes answer `null` when the account has nothing to show, for example
  `junior` and `onboarding`.
