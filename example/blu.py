#!/usr/bin/env python3
"""Minimal client for the local blu-api server.

Every example in this folder imports `blu` and calls one of the helpers below.
Only the standard library is used, so nothing needs installing.

    import blu
    print(blu.get("balance"))

Set BLU_BASE to point somewhere else, and BLU_API_KEY if the server requires it.
"""

import json
import os
import urllib.error
import urllib.request

BASE = os.environ.get("BLU_BASE", "http://127.0.0.1:8088").rstrip("/")
KEY = os.environ.get("BLU_API_KEY", "")


class ApiError(Exception):
    def __init__(self, status, payload):
        super().__init__(f"{status}: {payload}")
        self.status = status
        self.payload = payload


def _request(path, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + "/" + path.lstrip("/"), data=data, method=method)
    if data:
        req.add_header("content-type", "application/json")
    if KEY:
        req.add_header("x-api-key", KEY)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise ApiError(e.code, json.load(e)) from None


def get(path):
    return _request(path)


def post(path, body):
    return _request(path, "POST", body)


def show(title, payload):
    """Print a result under a heading, wrapped to the terminal."""
    print(f"--- {title} " + "-" * max(0, 60 - len(title)))
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def captured(name):
    """Load the recorded response for this method from output/."""
    here = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, "output", name + ".json"), encoding="utf-8") as f:
        return json.load(f)
