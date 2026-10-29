#!/usr/bin/env python3
"""Identity traits

GET /identities

The one JSON route: traits sent to the identity service.

Recorded response: output/identities.json
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import blu

result = blu.get("identities")
blu.show("Identity traits", result)
