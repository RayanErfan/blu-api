#!/usr/bin/env python3
"""Raw gateway call

GET /raw/{path}?req=...&resp=...

Escape hatch for routes without a dedicated endpoint. `req` and `resp` are the
protobuf message type names the gateway expects in the content-type; the body is
the app block only, so this only covers routes that need nothing else.

    python3 raw.py account/deposit/list/all \
        solutions.saman.bluebank.services.AccountListAllRequest \
        solutions.saman.bluebank.services.AccountListAllResponse

Recorded response: output/raw.json
"""
import sys
import urllib.parse

import blu

path = sys.argv[1] if len(sys.argv) > 1 else "account/deposit/list/all"
req = sys.argv[2] if len(sys.argv) > 2 else "solutions.saman.bluebank.services.AccountListAllRequest"
resp = sys.argv[3] if len(sys.argv) > 3 else "solutions.saman.bluebank.services.AccountListAllResponse"

query = urllib.parse.urlencode({"req": req, "resp": resp})
blu.show(path, blu.get(f"raw/{path}?{query}"))
