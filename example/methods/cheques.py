#!/usr/bin/env python3
"""Cheque registry

GET /cheques

Registered cheques. Only the cursor comes back when none exist.

Recorded response: output/cheques.json
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import blu

result = blu.get("cheques")
blu.show("Cheque registry", result)
