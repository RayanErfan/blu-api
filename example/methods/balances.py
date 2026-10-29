#!/usr/bin/env python3
"""Per-account balances

GET /balances

Every deposit with its IBAN, available and current amounts.

Recorded response: output/balances.json
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import blu

result = blu.get("balances")
blu.show("Per-account balances", result)
