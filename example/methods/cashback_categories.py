#!/usr/bin/env python3
"""Cashback categories

GET /cashback/categories

Cashback categories and their rates.

Recorded response: output/cashback_categories.json
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import blu

result = blu.get("cashback/categories")
blu.show("Cashback categories", result)
