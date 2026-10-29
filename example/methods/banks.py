#!/usr/bin/env python3
"""Bank directory

GET /banks

Every bank with its code and logo, used to build transfer destinations.

Recorded response: output/banks.json
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import blu

result = blu.get("banks")
blu.show("Bank directory", result)
