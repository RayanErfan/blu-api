#!/usr/bin/env python3
"""Dashboard banners

GET /banners

Promotional banners with their navigation targets.

Recorded response: output/banners.json
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import blu

result = blu.get("banners")
blu.show("Dashboard banners", result)
