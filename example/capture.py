#!/usr/bin/env python3
"""Capture one JSON response per endpoint into output/.

Nothing account-specific is hardcoded: the destination card for the owner
lookup and the test transfer is taken from the account's own recent-card list,
so this works against any logged-in account.

    python3 capture.py [destination-card]
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ.get("BLU_BASE", "http://127.0.0.1:8088")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output")

GETS = [
    "status", "profile", "profiles", "balance", "balances", "cards", "cards/all",
    "cards/processed", "transactions", "transactions/categories", "transactions/hashtags",
    "transfers/recent", "transfers/scheduled", "charge/recent-phones",
    "internet/recent-phones", "bill/favorites", "banks", "banners", "onboarding",
    "junior", "identities", "cashback/categories", "cashback/vendors", "cheques",
    "contacts",
]


def call(path, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + "/" + path, data=data, method=method)
    if data:
        req.add_header("content-type", "application/json")
    key = os.environ.get("BLU_API_KEY")
    if key:
        req.add_header("x-api-key", key)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, json.load(e)


def save(name, payload):
    os.makedirs(OUT, exist_ok=True)
    p = os.path.join(OUT, name + ".json")
    with open(p, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"{name:<28} {os.path.getsize(p):>8} bytes")


def destination():
    """A card to send the test transfer to: argv, else one of the account's own."""
    if len(sys.argv) > 1:
        return sys.argv[1]
    # cards/all carries the full pan; cards only the masked one.
    _, payload = call("cards/all")
    card = (((payload.get("3") or {}).get("2") or {}).get("1") or "").strip()
    if not card:
        _, payload = call("cards")
        card = ((payload.get("3") or {}).get("1") or "").strip()
    if not card:
        sys.exit("no card found, pass one as an argument")
    return card


def main():
    for path in GETS:
        status, payload = call(path)
        save(path.replace("/", "_"), payload)
        if status != 200:
            print(f"  -> {status}")

    to = destination()

    status, payload = call("owner/" + to)
    save("owner", payload)

    status, payload = call(f"cards/{to}/otp")
    save("card_otp", payload)

    # One transaction by its receipt number, taken from the newest transaction.
    _, recent = call("transactions")
    rows = recent.get("3") or []
    if rows:
        _, detail = call("transactions/detail/" + urllib.parse.quote(rows[0]["1"], safe=""))
        receipt = detail.get("receipt")
        if receipt:
            status, payload = call("transactions/find/" + receipt)
            save("transaction_find", payload)

    status, payload = call("transfers", "POST", {"amount": 1000, "to": to})
    save("transfers_create", payload)

    tid = ((payload.get("result") or {}).get("2") or "").strip()
    if tid:
        status, payload = call(f"transfers/{tid}")
        save("transfers_get", payload)


if __name__ == "__main__":
    sys.exit(main())
