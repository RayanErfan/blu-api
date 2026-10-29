#!/usr/bin/env python3
"""Scheduled transfers

GET /transfers/scheduled

Scheduled transfer contracts. Only the cursor comes back when none exist.

Recorded response: output/transfers_scheduled.json
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import blu

result = blu.get("transfers/scheduled")
blu.show("Scheduled transfers", result)
