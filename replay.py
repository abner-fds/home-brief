#!/usr/bin/env python3
import hashlib
import hmac
import json
import os
import sys
from urllib import request

SECRET = os.environ.get("WEBHOOK_SECRET", "take-home-secret")


def send_event_line(url, line):
    payload = line.encode("utf-8")
    sig = "sha256=" + hmac.new(SECRET.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    req = request.Request(url, data=payload, headers={"Content-Type": "application/json", "X-Signature": sig})
    with request.urlopen(req, timeout=10) as response:
        response.read()
        return response.status


def main():
    if len(sys.argv) < 2:
        print("Usage: python replay.py http://localhost:3000/webhooks/dialpad")
        raise SystemExit(1)
    url = sys.argv[1]
    path = os.path.join(os.path.dirname(__file__), "events.ndjson")
    if not os.path.exists(path):
        raise FileNotFoundError("events.ndjson not found; place the sample data file next to replay.py")
    with open(path, "r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            send_event_line(url, line)
    print(f"Sent {sum(1 for _ in open(path, 'r', encoding='utf-8'))} events to {url}")


if __name__ == "__main__":
    main()
