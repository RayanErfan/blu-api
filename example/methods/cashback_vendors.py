#!/usr/bin/env python3
"""Cashback vendors

GET /cashback/vendors

Vendors participating in cashback.

Recorded response: output/cashback_vendors.json
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import blu

result = blu.get("cashback/vendors")
blu.show("Cashback vendors", result)
