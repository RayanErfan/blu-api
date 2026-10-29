#!/usr/bin/env python3
"""Recent internet packages

GET /internet/recent-phones

Recently purchased internet packages.

Recorded response: output/internet_recent_phones.json
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import blu

result = blu.get("internet/recent-phones")
blu.show("Recent internet packages", result)
