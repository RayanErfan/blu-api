#!/usr/bin/env python3
"""Transaction history

GET /transactions

Full history, newest first. Each row carries a base64 transaction id.

Recorded response: output/transactions.json
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import blu

result = blu.get("transactions")
blu.show("Transaction history", result)
