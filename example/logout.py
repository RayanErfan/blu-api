#!/usr/bin/env python3
"""Forget the session

POST /logout

Deletes data/session.json server-side. The device id goes with it, so the next
login needs an OTP again.

Recorded response: output/logout.json
"""
import blu

result = blu.post("logout", {})
blu.show("Logout", result)
