#!/usr/bin/env python3
"""All accounts on the party

GET /accounts

A plain deposit list shows only the active profile. Asking by the party id
returns every account, business included, with balances.

Recorded response: output/accounts.json
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import blu

result = blu.get("accounts")
blu.show("Accounts", result)
