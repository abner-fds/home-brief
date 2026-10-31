# Call Matching Ops Review

This project is a minimal implementation of the ops review workflow for call-to-client/case matching.

## What it does

- Receives call events via `POST /webhooks/dialpad`
- Validates the webhook signature
- Deduplicates repeated events and merges late-arriving updates by `call_id`
- Normalizes phone numbers and matches against hashed client phone numbers
- Ignores internal/company numbers
- Attaches calls to the most recent open case for a matched client
- Falls back to the client record with `No open case` when no open case exists
- Sends ambiguous or uncertain matches to an operations review queue

## Scope and constraints

This is intentionally a minimal, review-focused implementation.

- Only the ops review flow is built
- No full authentication layer
- No production-grade persistence beyond the in-scope minimal store
- Matching logic is explicit and conservative by design

## Run locally

```bash
# start the app
python app.py
```

## Test

```bash
pytest -q
```

## Notes

See [NOTES.md](NOTES.md) for the decision log, trade-offs, and implementation notes.

## Actual time spent

This submission was built as a focused minimum viable version within the requested time budget.
The working scope intentionally prioritizes correctness, clarity, and reviewability over broader feature completeness.
