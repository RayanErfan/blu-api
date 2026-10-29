#!/usr/bin/env python3
"""Account profiles

GET /profiles

The personal/legal profiles the account can act as.

Recorded response: output/profiles.json
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import blu

result = blu.get("profiles")
blu.show("Account profiles", result)
