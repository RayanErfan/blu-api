#!/usr/bin/env python3
"""Merchant categories

GET /transactions/categories

Merchant category tree used to classify spending.

Recorded response: output/transactions_categories.json
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import blu

result = blu.get("transactions/categories")
blu.show("Merchant categories", result)
