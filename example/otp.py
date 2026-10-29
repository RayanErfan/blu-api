#!/usr/bin/env python3
"""Finish a fresh-device login

POST /otp   {"code": "123456"}

Only needed when login.py reported `otpRequired: true`. The code is the six
digits sent to the registered phone. The device becomes trusted after this, so
later logins skip the OTP entirely.

Recorded response: output/otp.json
"""
import sys

import blu

code = sys.argv[1] if len(sys.argv) > 1 else input("otp code: ").strip()

result = blu.post("otp", {"code": code})
blu.show("OTP verify", result)
