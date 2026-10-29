#!/usr/bin/env python3
"""Find a transaction

GET /transactions/find/{code}

One transaction by its receipt number (کد پیگیری). The gateway has no lookup
by receipt, so the server walks the history page by page until one matches —
pass `?pages=` on the HTTP route to search further back.

Recorded response: output/transaction_find.json
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import blu

code = sys.argv[1] if len(sys.argv) > 1 else "249042"

result = blu.get("transactions/find/" + code)
if result.get("error"):
    sys.exit(result["error"])
blu.show("Transaction " + code, result)
