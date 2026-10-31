import hashlib

from app import (
    build_call_record,
    hash_phone_number,
    match_client_for_call,
    normalize_phone,
    verify_signature,
)


def test_normalize_phone_adds_us_country_code():
    assert normalize_phone("(210) 555-0177") == "+12105550177"
    assert normalize_phone("2105550178") == "+12105550178"


def test_hash_phone_number_matches_client_phone_hashes():
    number = "+12105550177"
    hash_value = hashlib.sha256(number.replace("+", "").encode("utf-8")).hexdigest()
    assert hash_phone_number(number) == hash_value


def test_verify_signature_accepts_valid_hmac():
    secret = "take-home-secret"
    body = b'{"call_id":"7001","state":"ringing"}'
    expected = "sha256=" + hashlib.sha256(
        hmac := __import__("hmac").new(secret.encode(), body, hashlib.sha256).hexdigest()
    )
    assert verify_signature(body, expected, secret) is True


def test_match_client_uses_newest_open_case():
    client = {
        "client_id": "C-101",
        "name": "Maria Lopez",
        "phone_hashes": [hash_phone_number("+12105550178")],
        "cases": [
            {"case_id": "CASE-1", "status": "closed", "opened_at": "2025-01-01", "closed_at": "2025-05-01"},
            {"case_id": "CASE-2", "status": "open", "opened_at": "2026-06-11", "closed_at": None},
            {"case_id": "CASE-3", "status": "open", "opened_at": "2026-07-01", "closed_at": None},
        ],
    }
    result = match_client_for_call(
        "+12105550178",
        [client],
        [
            {"number": "+14155550100", "label": "Main line"},
            {"number": "+14155550101", "label": "Intake"},
        ],
    )
    assert result["client_id"] == "C-101"
    assert result["case_id"] == "CASE-3"
    assert result["status"] == "matched"


def test_build_call_record_keeps_latest_non_null_values():
    record = build_call_record({"call_id": "7001", "state": "ringing", "direction": "inbound"})
    record = build_call_record(record, {"call_id": "7001", "state": "connected", "date_ended": None})
    record = build_call_record(record, {"call_id": "7001", "state": "hangup", "date_ended": 1234, "duration": 10})
    assert record["state"] == "hangup"
    assert record["date_ended"] == 1234
    assert record["duration"] == 10
