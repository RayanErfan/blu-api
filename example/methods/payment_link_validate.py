#!/usr/bin/env python3
"""Validate a payment link

POST /payment-links/validate

Body: {"id": "<link id>", "amount": 1000000}

Payer-side check before the checkout opens. The reply is either a payable
`transfer` block or an `invalid` reason. A business whose gateway is disabled
gets the latter even though the link exists.

The link id is taken from the account's own list so the script runs as-is.

Recorded response: output/payment_link_validate.json
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import blu

links = blu.get("payment-links?count=1")["links"]
if not links:
    sys.exit("no payment link to validate; run methods/payment_link_create.py first")

link = links[0]
result = blu.post("payment-links/validate", {"id": link["id"], "amount": link["amount"]["value"]})
blu.show("Validate payment link", result)
