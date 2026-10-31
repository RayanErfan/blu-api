#!/usr/bin/env python3
"""Payment links and payments

GET /payment-links

The «لینک‌ها و پرداخت‌ها» tab of a business profile, in one call:

  links               every created link, and one row per payment once paid
  generalLink         the permanent «لینک عمومی» of the business
  creationRestriction the amount range a new link must fall inside

Each link carries its amount, status (منتظر پرداخت / پرداخت‌شده / …), the
public URL, the share text and, once paid, the transaction id.

Recorded response: output/payment_links.json
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import blu

result = blu.get("payment-links?count=20")
blu.show("Payment links", result)
