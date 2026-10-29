#!/usr/bin/env python3
"""Log in

POST /login   {"username": "...", "password": "..."}

On a device the bank already trusts this returns `otpRequired: false` and the
session is stored server-side. On a fresh device it returns `otpRequired: true`
and you finish with otp.py.

Recorded response: output/login.json
"""
import os

import blu

username = os.environ.get("BLU_USER", "rezaei")
password = os.environ.get("BLU_PASS", "Test@1234")

result = blu.post("login", {"username": username, "password": password})
blu.show("Login", result)

if result.get("otpRequired"):
    print("\nOTP needed. Run: python3 otp.py <code>")
