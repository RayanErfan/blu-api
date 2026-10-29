#!/usr/bin/env python3
"""Recent transfer destinations

GET /transfers/recent

Previously used destination accounts with bank metadata.

Recorded response: output/transfers_recent.json
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import blu

result = blu.get("transfers/recent")
blu.show("Recent transfer destinations", result)
