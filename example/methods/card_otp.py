#!/usr/bin/env python3
"""Dynamic second password

GET /cards/{card}/otp

The رمز دوم پویا a card payment asks for: six digits, single use, valid for
about two minutes. The card is the full PAN and defaults to the first card in
your card list.

The reply carries the window as well:

    {"code": "123456", "otpRequest": "73443",
     "validFrom": 1793282709, "expiresIn": 120, "expiresAt": 1793282829000}

Fetch it immediately before paying — the clock starts on the server, not here.

Recorded response: output/card_otp.json
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import blu

if len(sys.argv) > 1:
    card = sys.argv[1]
else:
    # cards/all carries the full pan; cards only the masked one.
    all_cards = blu.get("cards/all")
    card = (((all_cards.get("3") or {}).get("2") or {}).get("1") or "").strip()
    if not card:
        sys.exit("no card, pass one: python3 card_otp.py 6037...")

result = blu.get("cards/" + card + "/otp")
blu.show(f"Dynamic password for {card}", result)
print("\nvalid for", result.get("expiresIn"), "seconds")
