#!/usr/bin/env python3
"""Own cards

GET /cards/all

The account's own cards, with bank and PAN.

Recorded response: output/cards_all.json
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import blu

result = blu.get("cards/all")
blu.show("Own cards", result)
