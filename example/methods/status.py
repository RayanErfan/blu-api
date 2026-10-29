#!/usr/bin/env python3
"""Session status

GET /status

Login state, device id and remaining token life. The token renews itself on
the next call, so `tokenFresh: false` is not an error.

Recorded response: output/status.json
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import blu

result = blu.get("status")
blu.show("Session status", result)
