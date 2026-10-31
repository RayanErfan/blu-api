#!/usr/bin/env python3
"""General payment link

GET /payment-links/general

The permanent «لینک عمومی» of a business profile: one URL that is always
open for customers, unlike the unique links created for a fixed amount.
`status` 1 is active, 2 inactive; `notice` explains a restriction, such as
gateway payments being disabled for this business.

Recorded response: output/payment_link_general.json
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import blu

result = blu.get("payment-links/general")
blu.show("General payment link", result)
