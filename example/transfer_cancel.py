#!/usr/bin/env python3
"""Cancel a transfer

POST /transfers/{id}/cancel

Only unsettled transfers can be cancelled; a settled one comes back as a
business error from the gateway. The id is read from the last recorded transfer
when no argument is given.

Recorded response: output/transfers_cancel.json
"""
import sys

import blu

if len(sys.argv) > 1:
    tid = sys.argv[1]
else:
    tid = ((blu.captured("transfers_create").get("result") or {}).get("2") or "").strip()

try:
    blu.show("Cancel", blu.post(f"transfers/{tid}/cancel", {}))
except blu.ApiError as e:
    print(f"{e.status} {e.payload}")
