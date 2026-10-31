#!/usr/bin/env python3
"""Business profile vs personal

A Blu party can hold more than one profile. The ordinary one is type 1
(«حساب شخصی»); the business one is type 2 («حساب کسب‌وکار», also called
«حساب تجاری», advertised with a higher transfer ceiling). They share the
party, the login, the token and every route — what changes is the account
number you put in the query.

This example finds the business account and lists its card and its history.

No recorded response: the numbers below are the live ones from your session.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import blu

summary = blu.get("profiles/summary")
for profile in summary["profiles"]:
    print(f"{profile['type']}  {profile['kind']:<16} {profile['accountNumber']}  {profile['card']}")

business = next((p for p in summary["profiles"] if p["type"] == "2"), None)
if not business:
    print("no business profile on this party")
    raise SystemExit(0)

account = business["accountNumber"]
print("\nbusiness card:")
blu.show("", blu.get("cards/all?account=" + account))
print("business history (3 rows):")
blu.show("", blu.get("transactions?account=" + account + "&size=3&page=1"))
