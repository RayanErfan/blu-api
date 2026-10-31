#!/usr/bin/env python3
"""Create a payment link

POST /payment-links/create

Body: {"amount": 1000000, "description": "سفارش ۱۲۳"}

A unique link for a fixed amount in IRR. The server assigns the title and the
expiry (about 24 hours). The amount must sit inside the `creationRestriction`
returned by GET /payment-links; on a fresh business profile that is
1,000,000 to 100,000,000 IRR.

This example uses a fake amount. Point BLU_BASE at a server logged into a
business profile to create a real link.

Recorded response: output/payment_link_create.json
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import blu

result = blu.post("payment-links/create", {"amount": 1000000, "description": "سفارش ۱۲۳"})
blu.show("Created payment link", result)
