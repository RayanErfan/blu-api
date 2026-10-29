#!/usr/bin/env python3
"""Recent transfer cards

GET /cards

Cards previously used as transfer destinations.

Recorded response: output/cards.json
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import blu

result = blu.get("cards")
blu.show("Recent transfer cards", result)
