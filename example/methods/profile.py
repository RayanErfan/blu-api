#!/usr/bin/env python3
"""Own profile

GET /profile

Identity record: username, party id, phone, avatar, birth date.

Recorded response: output/profile.json
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import blu

result = blu.get("profile")
blu.show("Own profile", result)
