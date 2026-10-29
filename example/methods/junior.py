#!/usr/bin/env python3
"""Junior accounts

GET /junior

Child accounts. Empty on this account.

Recorded response: output/junior.json
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import blu

result = blu.get("junior")
blu.show("Junior accounts", result)
