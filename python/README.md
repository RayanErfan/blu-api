# bluapi

Python client for the [Blu Bank](https://blubank.com) HTTP API.

The bank's own gateway speaks protobuf over HTTP/2 and only answers from an
Iranian IP, so the protocol is handled by the companion
[`blu-api`](https://github.com/RayanErfan/blu-api) server. This package is a
thin, typed client for that server.

```
pip install bluapi
```

## Use

Start the server first (see the `blu-api` README), then:

```python
import bluapi

with bluapi.Client() as blu:
    print(blu.balance()["total"])
    print(blu.owner("6104335551234567"))
```

`Client` defaults to `http://127.0.0.1:8088`, or `$BLU_API_URL` when set. Pass
`api_key=` (or set `$BLU_API_KEY`) if the server was started with `BLU_API_KEY`.

### Session

```python
blu.login("username", "password")   # otpRequired: true on a fresh device
blu.otp("123456")                   # only then
blu.logout()
```

A device the bank has already trusted logs in without a code, and the server
renews the token silently, so in practice you log in once.

### Money

```python
blu.transfer(1000, "6104335551234567")             # card to card
blu.transfer(1000, "IR000560611828001111111101", method=bluapi.PAYA)
```

Amounts are IRR. Source and destination must differ, so the account's own Blu
card cannot be the destination. This moves real money.

### Everything else

```python
blu.status()            blu.profile()          blu.balances()
blu.cards()             blu.all_cards()        blu.transactions()
blu.recent_transfers()  blu.scheduled_transfers()
blu.banks()             blu.contacts()         blu.cheques()
blu.cashback_categories()                      blu.cashback_vendors()
blu.recent_charges()    blu.recent_internet_packages()
blu.favorite_bills()    blu.banners()          blu.onboarding()
blu.junior()            blu.identities()       blu.processed_cards()
blu.transfer_get(id)    blu.transfer_cancel(id)
```

Responses are the server's JSON. Gateway payloads are protobuf on the wire and
arrive as nested dicts keyed by field number.

### Raw routes

```python
blu.raw(
    "account/deposit/list/all",
    "solutions.saman.bluebank.services.AccountListAllRequest",
    "solutions.saman.bluebank.services.AccountListAllResponse",
)
```

## Errors

`ApiError` carries `status` and `payload`. `GatewayError` is a subclass raised
when the bank itself rejected the call, and carries `detail`. Both derive from
`BluApiError`.

```python
try:
    blu.owner("0000000000000000")
except bluapi.GatewayError as exc:
    print(exc.status, exc.detail)
```

## Command line

```
bluapi status
bluapi balance
bluapi call owner 6104335551234567
```

## Notes

- Python 3.8+, standard library only.
- The server is single-account: whichever session is active answers.
- `transfer_get` and `transfer_cancel` only resolve ids from the two-step
  `transfer/init` + `submit` flow, so an id from `transfer()` usually answers
  404 or 500.

## License

MIT.
