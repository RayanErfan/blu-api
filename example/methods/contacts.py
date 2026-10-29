#!/usr/bin/env python3
"""Recent contacts

GET /contacts

Contacts available as transfer destinations.

Recorded response: output/contacts.json
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import blu

result = blu.get("contacts")
blu.show("Recent contacts", result)
