#!/usr/bin/env python3
"""Send a transfer

POST /transfers   {"amount": 1000, "to": "6037..."}

`to` is a card number or IBAN. The server resolves the owner, picks the source
card automatically and asks the gateway which methods are available; the reply
carries their fees before the transfer is submitted.

The destination defaults to the first card in your recent-transfer list, which
is usually a real counterparty. A card of your own works too, but the account's
own Blu card cannot be used (source and destination must differ).

Optional fields:
  bank    destination bank code, inferred from the owner lookup when omitted
  method  24 card-to-card (default), 25 instant, 26 Paya, 27 Satna
  source  {"card": "...", "bank": "..."} to override the source card

This moves real money. The default is 1,000 IRR.

Recorded response: output/transfers_create.json
"""
import sys

import blu

amount = int(sys.argv[1]) if len(sys.argv) > 1 else 1000
if len(sys.argv) > 2:
    to = sys.argv[2]
else:
    recent = blu.get("cards")
    to = ((recent.get("3") or {}).get("1") or "").strip()
    if not to:
        sys.exit("no recent card to send to, pass one: python3 transfer.py 1000 6037...")

result = blu.post("transfers", {"amount": amount, "to": to})
blu.show(f"Transfer {amount} IRR to {to}", result)

receipt = (result.get("result") or {}).get("3") or {}
if receipt:
    print("\nreference:", receipt.get("1"), "| status:", receipt.get("3"))
