#!/usr/bin/env python3
"""Processed card orders

GET /cards/processed

Card orders that have been processed. Empty on this account.

Recorded response: output/cards_processed.json
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import blu

result = blu.get("cards/processed")
blu.show("Processed card orders", result)
