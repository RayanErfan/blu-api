#!/usr/bin/env python3
"""Recent top-up numbers

GET /charge/recent-phones

Recently topped-up mobile numbers, with operator.

Recorded response: output/charge_recent_phones.json
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import blu

result = blu.get("charge/recent-phones")
blu.show("Recent top-up numbers", result)
