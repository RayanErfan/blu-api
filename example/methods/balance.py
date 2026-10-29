#!/usr/bin/env python3
"""Total balance

GET /balance

Available balance summed over every deposit, in IRR.

Recorded response: output/balance.json
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import blu

result = blu.get("balance")
blu.show("Total balance", result)
