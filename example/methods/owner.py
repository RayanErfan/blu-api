#!/usr/bin/env python3
"""Owner lookup

GET /owner/{card-or-iban}

Resolves the owner name and bank behind a card or IBAN before a transfer. The
identifier defaults to the first card in your recent-transfer list.

Recorded response: output/owner.json
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import blu

if len(sys.argv) > 1:
    identifier = sys.argv[1]
else:
    recent = blu.get("cards")
    identifier = ((recent.get("3") or {}).get("1") or "").strip()
    if not identifier:
        sys.exit("no recent card to look up, pass one: python3 owner.py 6037...")

blu.show("Owner", blu.get("owner/" + identifier))
