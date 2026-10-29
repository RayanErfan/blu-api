#!/usr/bin/env python3
"""Saved bills

GET /bill/favorites

Bills saved as favourites. Empty on this account.

Recorded response: output/bill_favorites.json
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import blu

result = blu.get("bill/favorites")
blu.show("Saved bills", result)
