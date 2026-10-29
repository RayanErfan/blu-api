#!/usr/bin/env python3
"""Transaction hashtags

GET /transactions/hashtags

Hashtags applied to transactions. Empty on this account.

Recorded response: output/transactions_hashtags.json
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import blu

result = blu.get("transactions/hashtags")
blu.show("Transaction hashtags", result)
