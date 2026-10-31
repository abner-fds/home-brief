import hashlib
import hmac
import json
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

SECRET = "take-home-secret"

CLIENTS = [
    {
        "client_id": "C-101",
        "name": "Maria Lopez",
        "phone_hashes": [
            "eb17c0e3b9069a5042236c38fea7ce09a19722d2e1f38ae62a6af577f06a929b"
        ],
        "cases": [
            {"case_id": "CASE-9001", "status": "closed", "opened_at": "2025-01-14", "closed_at": "2025-03-02"},
            {"case_id": "CASE-9417", "status": "open", "opened_at": "2026-06-11", "closed_at": None},
        ],
    },
    {
        "client_id": "C-102",
        "name": "James Carter",
        "phone_hashes": [
            "65e5cd5db364b55c145681e2db0975fc30e6831c10fe0d8ccf018122ae2fd723"
        ],
        "cases": [
            {"case_id": "CASE-8820", "status": "open", "opened_at": "2025-11-04", "closed_at": None},
            {"case_id": "CASE-9550", "status": "closed", "opened_at": "2026-07-20", "closed_at": "2026-09-01"},
        ],
    },
    {
        "client_id": "C-103",
        "name": "Linda Nguyen",
        "phone_hashes": [
            "1f2bd916d9e93906157a1bd4abfc024b1b64cb83eeef7ebfd1eebacf31065326"
        ],
        "cases": [
            {"case_id": "CASE-9102", "status": "open", "opened_at": "2026-02-03", "closed_at": None},
        ],
    },
    {
        "client_id": "C-104",
        "name": "Robert Nguyen",
        "phone_hashes": [
            "1f2bd916d9e93906157a1bd4abfc024b1b64cb83eeef7ebfd1eebacf31065326",
            "9b14d1e2164fe73cc354febb883730741e6217f7b685af9ab4403f25c94970a6",
        ],
        "cases": [
            {"case_id": "CASE-9103", "status": "open", "opened_at": "2026-02-03", "closed_at": None},
        ],
    },
    {
        "client_id": "C-105",
        "name": "David Kim",
        "phone_hashes": [
            "ca8c01ad6c7826451572958a5b1eaa41d5b4ad178d837b0769705cef902687cd"
        ],
        "cases": [
            {"case_id": "CASE-7740", "status": "closed", "opened_at": "2024-08-19", "closed_at": "2025-12-10"},
        ],
    },
    {
        "client_id": "C-106",
        "name": "Angela Brooks",
        "phone_hashes": [
            "060767c859e08016ace3d3821bc002aaecbd295d9afce078030224d2deee2c87"
        ],
        "cases": [
            {"case_id": "CASE-9612", "status": "open", "opened_at": "2026-08-28", "closed_at": None},
        ],
    },
]

COMPANY_LINES = [
    {"number": "+14155550100", "label": "Main line"},
    {"number": "+14155550101", "label": "Intake"},
]

CALL_STORE = {}


def normalize_phone(value):
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    digits = re.sub(r"\D+", "", text)
    if not digits:
        return None
    if len(digits) == 10:
        digits = "1" + digits
    elif len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
        digits = "1" + digits
    return "+" + digits


def hash_phone_number(number):
    if number is None:
        return None
    cleaned = normalize_phone(number)
    if cleaned is None:
        return None
    digits = cleaned.replace("+", "")
    return hashlib.sha256(digits.encode("utf-8")).hexdigest()


def verify_signature(body, signature_header, secret):
    if not signature_header or not signature_header.startswith("sha256="):
        return False
    expected = signature_header.split("=", 1)[1]
    actual = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(actual, expected)


def build_call_record(existing, event):
    record = dict(existing or {})
    for key in [
        "call_id",
        "direction",
        "state",
        "external_number",
        "internal_number",
        "date_started",
        "date_ended",
        "duration",
        "recording_url",
    ]:
        value = event.get(key)
        if value is not None:
            record[key] = value
    if "last_updated_at" not in record or event.get("last_updated_at") is not None:
        record["last_updated_at"] = event.get("last_updated_at") or record.get("last_updated_at") or 0
    return record


def pick_latest_open_case(client):
    open_cases = [case for case in (client.get("cases") or []) if case.get("status") == "open"]
    if not open_cases:
        return None
    open_cases.sort(key=lambda item: item.get("opened_at") or "", reverse=True)
    return open_cases[0]


def match_client_for_call(external_number, clients, company_lines):
    normalized = normalize_phone(external_number)
    if normalized is None:
        return {"status": "unmatched", "client_id": None, "case_id": None, "reason": "invalid_number"}

    internal = {normalize_phone(item["number"]) for item in company_lines}
    if normalized in internal:
        return {"status": "internal", "client_id": None, "case_id": None, "reason": "company_line"}

    candidate_hash = hash_phone_number(normalized)
    matches = [
        client for client in clients if candidate_hash in set(client.get("phone_hashes") or [])
    ]

    if len(matches) > 1:
        return {
            "status": "needs_review",
            "client_id": None,
            "case_id": None,
            "reason": "multiple_clients_match",
            "matched_clients": [client["client_id"] for client in matches],
        }

    if not matches:
        return {"status": "unmatched", "client_id": None, "case_id": None, "reason": "no_client_match"}

    client = matches[0]
    case = pick_latest_open_case(client)
    if case:
        return {
            "status": "matched",
            "client_id": client["client_id"],
            "client_name": client["name"],
            "case_id": case["case_id"],
            "reason": "latest_open_case",
        }

    return {
        "status": "customer_only",
        "client_id": client["client_id"],
        "client_name": client["name"],
        "case_id": None,
        "reason": "no_open_case",
    }


def queue_for_review(call_id, record):
    return {
        "call_id": call_id,
        "direction": record.get("direction"),
        "state": record.get("state"),
        "external_number": record.get("external_number"),
        "internal_number": record.get("internal_number"),
        "status": record.get("match_status") or "needs_review",
    }


def process_call_event(event, clients=None, company_lines=None):
    clients = clients or CLIENTS
    company_lines = company_lines or COMPANY_LINES
    if not event or not event.get("call_id"):
        raise ValueError("call_id is required")

    call_id = event["call_id"]
    existing = CALL_STORE.get(call_id, {})
    updated = build_call_record(existing, event)
    updated["match"] = match_client_for_call(updated.get("external_number"), clients, company_lines)
    updated["match_status"] = updated["match"]["status"]
    CALL_STORE[call_id] = updated
    return updated


def render_queue_html(rows=None):
    rows = rows or list(CALL_STORE.values())
    entries = []
    for row in rows:
        match = row.get("match") or {}
        status = match.get("status", "pending")
        case_label = match.get("case_id") or "No open case"
        client_label = match.get("client_name") or "—"
        entries.append(
            "<tr>"
            f"<td>{row.get('call_id', '—')}</td>"
            f"<td>{row.get('direction', '—')}</td>"
            f"<td>{row.get('state', '—')}</td>"
            f"<td>{row.get('external_number', '—')}</td>"
            f"<td>{client_label}</td>"
            f"<td>{case_label}</td>"
            f"<td>{status}</td>"
            "</tr>"
        )
    html = f"""
    <!doctype html>
    <html>
      <head><meta charset="utf-8"><title>Ops Review Queue</title></head>
      <body>
        <h1>Ops Review Queue</h1>
        <table border="1" cellpadding="6">
          <thead>
            <tr>
              <th>Call ID</th>
              <th>Direction</th>
              <th>State</th>
              <th>External Number</th>
              <th>Client</th>
              <th>Case</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {''.join(entries) if entries else '<tr><td colspan="7">No calls queued</td></tr>'}
          </tbody>
        </table>
      </body>
    </html>
    """
    return html


class DialpadHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/":
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(render_queue_html().encode("utf-8"))
            return
        if parsed.path == "/calls":
            payload = json.dumps(list(CALL_STORE.values())).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != "/webhooks/dialpad":
            self.send_response(404)
            self.end_headers()
            return

        length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(length)
        signature = self.headers.get("X-Signature", "")
        if not verify_signature(raw_body, signature, SECRET):
            self.send_response(401)
            self.end_headers()
            self.wfile.write(b"invalid signature")
            return

        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except json.JSONDecodeError:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b"invalid json")
            return

        if isinstance(payload, list):
            events = payload
        else:
            events = [payload]

        results = []
        for event in events:
            result = process_call_event(event)
            results.append(result)

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        payload_out = json.dumps(results).encode("utf-8")
        self.send_header("Content-Length", str(len(payload_out)))
        self.end_headers()
        self.wfile.write(payload_out)

    def log_message(self, format, *args):
        return


def start_server(host="127.0.0.1", port=3000):
    server = ThreadingHTTPServer((host, port), DialpadHandler)
    print(f"Serving on http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    start_server()
