#!/usr/bin/env python3
"""Profile summary

GET /profiles/summary

One entry per profile on the party plus the account kinds the user may open.
A party can hold a personal profile (type 1), a personal-business profile
(type 2, «حساب تجاری» / «حساب کسب‌وکار») and a legal profile (type 3).
Each profile has its own account number, IBAN and card.

Recorded response: output/profiles_summary.json
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import blu

result = blu.get("profiles/summary")
blu.show("Profile summary", result)
