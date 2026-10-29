#!/usr/bin/env python3
"""Fetch one transfer

GET /transfers/{id}

The id is the one carried in `result.2` of output/transfers_create.json, which
is what this reads when no argument is given.

The gateway only resolves ids minted by the two-step transfer/init + submit
flow. Ids from transfer/create (the one-shot route) come back as 404 or 500, so
this is expected to fail on a freshly created transfer.

Recorded response: output/transfers_get.json
"""
import sys

import blu

if len(sys.argv) > 1:
    tid = sys.argv[1]
else:
    tid = ((blu.captured("transfers_create").get("result") or {}).get("2") or "").strip()

try:
    blu.show("Transfer", blu.get("transfers/" + tid))
except blu.ApiError as e:
    print(f"{e.status} {e.payload}")
