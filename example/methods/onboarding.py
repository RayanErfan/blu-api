#!/usr/bin/env python3
"""Onboarding slides

GET /onboarding

Onboarding slides. Empty on this account.

Recorded response: output/onboarding.json
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import blu

result = blu.get("onboarding")
blu.show("Onboarding slides", result)
