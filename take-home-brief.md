# Call matching take-home

Attach every phone call to the right client and case, and give the ops team a quick way to sort out the calls the system can't place.

**Stages:** plan, build, review · **Time:** about 1 hour, then up to 4 hours · **Stack:** your choice; TypeScript preferred

## The situation

We build internal tools for a US firm that helps veterans with VA disability claims. Case managers and intake staff talk to clients by phone all day. Our phone system sends us an event for each step of every call.

We want each call attached to the right client and the right case automatically, so a case manager who opens a case sees every conversation on it. When the system can't be sure, someone on the ops team has to sort it out. The ops team works in US Central time, and they are not engineers.

## What to build

- An endpoint that receives call events: `POST /webhooks/dialpad`.
- One record per call, kept correct as its events arrive.
- Matching each call to a client and a case, starting from these rules:
  - Match on the other party's number, `external_number`. We store client phone numbers only as SHA-256 hashes, in the same format our system uses for phone numbers everywhere (the format you see in `company_lines`).
  - Calls between our own company lines are not client calls.
  - If a client has more than one case, attach the call to their newest case.
- A screen where the ops team deals with the calls the system couldn't attach confidently, and fixes any it got wrong.

> The screen is deliberately underspecified. Work out what the ops person is trying to get done and design for that.

## The call events

Each call produces several events as it goes: `ringing` → `connected` → `hangup` (or `voicemail`).

- The phone system can send the same event more than once and can deliver events out of order. The real one does both.
- Each request is signed. The `X-Signature` header is `sha256=` followed by the hex HMAC-SHA256 of the raw request body. For this exercise the shared secret is `take-home-secret`. Reject any request with a wrong signature and don't store it.

| Field | Meaning |
|---|---|
| `call_id` | Stable ID for the call, the same on every event for that call. |
| `state` | `ringing`, `connected`, `hangup` or `voicemail`. |
| `direction` | `inbound` or `outbound`. |
| `external_number` | The other party's number, as the phone system captured it. Formats vary. |
| `internal_number` | Our line that took or placed the call, e.g. `+14155550100`. |
| `date_started`, `date_ended` | Milliseconds since the Unix epoch (UTC). `date_ended` is null until the call ends. |
| `duration` | Seconds. Null until the call ends. |
| `recording_url` | Link to the call recording. Null until the recording is ready, which can be after the call ends. |

## How it runs

1. **Plan** (about 1 hour; send within 2 days of starting). Send a `PLAN.md` of one page at most, covering:
   - who uses the ops screen, and what they are trying to get done;
   - how you'll keep each call's record correct as events arrive;
   - your matching rules, including the cases the rules above don't cover;
   - the questions you would ask the ops team before building.

   We reply within one business day with comments and answers. Our reply may change a requirement, as happens in real work.
2. **Build** (up to 4 hours; send within 5 days of our reply). Please stop at 4 hours and tell us how long you actually spent. You may not finish everything, and that's expected: choose what to build first, and say in `NOTES.md` what you left out and why. A smaller thing done carefully beats a bigger thing done loosely.
3. **Review** (60-minute video call). You run it against `replay.py` and walk us through the ops screen. Then we review the code together, the way we would review a teammate's pull request, and finish with some general technical questions.

## What to send after the build

- A git repository, as a zip or an invite to a private repo. Keep the history and commit as you go; we read it.
- A README with one command to run it and one to run the tests.
- Tests for the parts that matter most.
- A `NOTES.md` covering:
  - your decisions and trade-offs;
  - what you verified, and how;
  - what you did not verify or test;
  - what you would do next with another day;
  - how you used AI tools.

## Ground rules

- **Stack.** Use whatever you're fastest in. We work in TypeScript (NestJS, React) and Go, so TypeScript is a plus but not required. Any database is fine, SQLite included.
- **AI tools.** Use them; we use Claude Code every day. You own every line, and in the review we'll ask you to walk through any part of it.
- **Questions.** If something blocks you, message the person who sent you this brief. Say what you tried and what you need. A good question beats a silent guess.
- **Login.** Assume the ops screen sits behind our existing login. You don't need to build authentication.

## What we look for

- Whether an ops person can do their job on your screen quickly and with confidence.
- Whether we can trust the data: the right call on the right client and case, with nothing duplicated or lost.
- How clearly you tell us what you checked and what you didn't.

## Sample data

All names and numbers below are fictional; 555-01xx numbers are reserved for fiction. Save these three files side by side, start your server, then run:

```
python3 replay.py http://localhost:3000/webhooks/dialpad
```

Any port works. The script sends every event in the order and manner the real phone system would.

### clients.json

```json
{
  "clients": [
    {
      "client_id": "C-101",
      "name": "Maria Lopez",
      "phone_hashes": [
        "eb17c0e3b9069a5042236c38fea7ce09a19722d2e1f38ae62a6af577f06a929b"
      ],
      "cases": [
        {
          "case_id": "CASE-9001",
          "status": "closed",
          "opened_at": "2025-01-14",
          "closed_at": "2025-03-02"
        },
        {
          "case_id": "CASE-9417",
          "status": "open",
          "opened_at": "2026-06-11",
          "closed_at": null
        }
      ]
    },
    {
      "client_id": "C-102",
      "name": "James Carter",
      "phone_hashes": [
        "65e5cd5db364b55c145681e2db0975fc30e6831c10fe0d8ccf018122ae2fd723"
      ],
      "cases": [
        {
          "case_id": "CASE-8820",
          "status": "open",
          "opened_at": "2025-11-04",
          "closed_at": null
        },
        {
          "case_id": "CASE-9550",
          "status": "closed",
          "opened_at": "2026-07-20",
          "closed_at": "2026-09-01"
        }
      ]
    },
    {
      "client_id": "C-103",
      "name": "Linda Nguyen",
      "phone_hashes": [
        "1f2bd916d9e93906157a1bd4abfc024b1b64cb83eeef7ebfd1eebacf31065326"
      ],
      "cases": [
        {
          "case_id": "CASE-9102",
          "status": "open",
          "opened_at": "2026-02-03",
          "closed_at": null
        }
      ]
    },
    {
      "client_id": "C-104",
      "name": "Robert Nguyen",
      "phone_hashes": [
        "1f2bd916d9e93906157a1bd4abfc024b1b64cb83eeef7ebfd1eebacf31065326",
        "9b14d1e2164fe73cc354febb883730741e6217f7b685af9ab4403f25c94970a6"
      ],
      "cases": [
        {
          "case_id": "CASE-9103",
          "status": "open",
          "opened_at": "2026-02-03",
          "closed_at": null
        }
      ]
    },
    {
      "client_id": "C-105",
      "name": "David Kim",
      "phone_hashes": [
        "ca8c01ad6c7826451572958a5b1eaa41d5b4ad178d837b0769705cef902687cd"
      ],
      "cases": [
        {
          "case_id": "CASE-7740",
          "status": "closed",
          "opened_at": "2024-08-19",
          "closed_at": "2025-12-10"
        }
      ]
    },
    {
      "client_id": "C-106",
      "name": "Angela Brooks",
      "phone_hashes": [
        "060767c859e08016ace3d3821bc002aaecbd295d9afce078030224d2deee2c87"
      ],
      "cases": [
        {
          "case_id": "CASE-9612",
          "status": "open",
          "opened_at": "2026-08-28",
          "closed_at": null
        }
      ]
    }
  ],
  "company_lines": [
    {
      "number": "+14155550100",
      "label": "Main line"
    },
    {
      "number": "+14155550101",
      "label": "Intake"
    }
  ]
}
```

### events.ndjson

```
{"call_id":"7001","state":"ringing","direction":"inbound","external_number":"+15125550142","internal_number":"+14155550100","date_started":1791208931000,"date_ended":null,"duration":null,"recording_url":null}
{"call_id":"7001","state":"connected","direction":"inbound","external_number":"+15125550142","internal_number":"+14155550100","date_started":1791208931000,"date_ended":null,"duration":null,"recording_url":null}
{"call_id":"7002","state":"ringing","direction":"inbound","external_number":"(210) 555-0177","internal_number":"+14155550100","date_started":1791209740000,"date_ended":null,"duration":null,"recording_url":null}
{"call_id":"7001","state":"hangup","direction":"inbound","external_number":"+15125550142","internal_number":"+14155550100","date_started":1791208931000,"date_ended":1791209243000,"duration":312,"recording_url":null}
{"call_id":"7001","state":"hangup","direction":"inbound","external_number":"+15125550142","internal_number":"+14155550100","date_started":1791208931000,"date_ended":1791209243000,"duration":312,"recording_url":null}
{"call_id":"7003","state":"ringing","direction":"inbound","external_number":"2105550178","internal_number":"+14155550101","date_started":1791214265000,"date_ended":null,"duration":null,"recording_url":null}
{"call_id":"7002","state":"hangup","direction":"inbound","external_number":"(210) 555-0177","internal_number":"+14155550100","date_started":1791209740000,"date_ended":1791209835000,"duration":95,"recording_url":null}
{"call_id":"7003","state":"hangup","direction":"inbound","external_number":"2105550178","internal_number":"+14155550101","date_started":1791214265000,"date_ended":1791214513000,"duration":248,"recording_url":null}
{"call_id":"7004","state":"hangup","direction":"outbound","external_number":"+1 619-555-0123","internal_number":"+14155550100","date_started":1791217200000,"date_ended":1791217261000,"duration":61,"recording_url":null}
{"call_id":"7005","state":"hangup","direction":"inbound","external_number":"+14155550101","internal_number":"+14155550100","date_started":1791219810000,"date_ended":1791219850000,"duration":40,"recording_url":null}
{"call_id":"7006","state":"hangup","direction":"inbound","external_number":"+13055550166","internal_number":"+14155550100","date_started":1791226082000,"date_ended":1791226216000,"duration":134,"recording_url":null}
{"call_id":"7007","state":"hangup","direction":"inbound","external_number":"+13055550190","internal_number":"+14155550100","date_started":1791226364000,"date_ended":1791226367000,"duration":3,"recording_url":null}
{"call_id":"7008","state":"hangup","direction":"inbound","external_number":"+18305550111","internal_number":"+14155550100","date_started":1791227109000,"date_ended":1791227529000,"duration":420,"recording_url":null}
{"call_id":"7009","state":"hangup","direction":"inbound","external_number":"+17375550199","internal_number":"+14155550100","date_started":1791261677000,"date_ended":1791261857000,"duration":180,"recording_url":null}
{"call_id":"7009","state":"ringing","direction":"inbound","external_number":"+17375550199","internal_number":"+14155550100","date_started":1791261677000,"date_ended":null,"duration":null,"recording_url":null}
{"call_id":"7001","state":"hangup","direction":"inbound","external_number":"+15125550142","internal_number":"+14155550100","date_started":1791208931000,"date_ended":1791209243000,"duration":312,"recording_url":"https://recordings.example.com/7001.mp3"}
{"call_id":"7010","state":"voicemail","direction":"inbound","external_number":"+15125550142","internal_number":"+14155550100","date_started":1791235800000,"date_ended":1791235822000,"duration":22,"recording_url":null}
{"call_id":"7011","state":"hangup","direction":"inbound","external_number":"+16195550123","internal_number":"+14155550100","date_started":1791231000000,"date_ended":1791231075000,"duration":75,"recording_url":null}
```

### replay.py

```python
#!/usr/bin/env python3
"""Send the events in events.ndjson to your webhook, in file order, the way our
provider would. Python 3.8+, standard library only.

    python3 replay.py http://localhost:3000/webhooks/dialpad

Each request body is one line of events.ndjson, sent byte for byte. The
X-Signature header is "sha256=" plus the hex HMAC-SHA256 of that raw body,
keyed with WEBHOOK_SECRET (default: take-home-secret). Like the real provider,
this script may send an event more than once, out of order, or with a bad
signature.
"""
import hashlib
import hmac
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

SECRET = os.environ.get("WEBHOOK_SECRET", "take-home-secret").encode()
BAD_SIGNATURE_LINES = {18}  # 1-based line numbers signed with the wrong key


def sign(body, key):
    return "sha256=" + hmac.new(key, body, hashlib.sha256).hexdigest()


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    url = sys.argv[1]
    path = Path(__file__).with_name("events.ndjson")
    lines = [ln for ln in path.read_bytes().splitlines() if ln.strip()]
    for n, body in enumerate(lines, start=1):
        key = b"not-the-secret" if n in BAD_SIGNATURE_LINES else SECRET
        req = urllib.request.Request(url, data=body, method="POST", headers={
            "Content-Type": "application/json",
            "X-Signature": sign(body, key),
        })
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                status = resp.status
        except urllib.error.HTTPError as e:
            status = e.code
        except urllib.error.URLError as e:
            sys.exit(f"line {n}: could not reach {url}: {e.reason}")
        print(f"line {n:2d}  {status}  {body[:72].decode()}")
        time.sleep(0.2)


if __name__ == "__main__":
    main()
```
