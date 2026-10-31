# Call Matching Ops Review

This project is a minimal TypeScript implementation of the ops review workflow for call-to-client and call-to-case matching.

## What it does

- Receives webhook events via `POST /webhooks/dialpad`
- Validates the `X-Signature` HMAC-SHA256 header
- Keeps one canonical record per `call_id` while merging repeated or out-of-order updates
- Normalizes phone numbers to E.164 format and compares against hashed client numbers
- Ignores internal company lines
- Matches a client to the newest open case when available
- Falls back to `customer_only` with `No open case` when no open case exists
- Surfaces ambiguous or uncertain matches to an ops review queue

## Stack

- TypeScript
- Node.js
- Vitest
- Native Node HTTP server

## Run locally

```bash
npm install
npm run dev
```

Then open:

```text
http://localhost:3000
```

## Test and build

```bash
npm test
npm run build
```

## Notes

See [NOTES.md](NOTES.md) for the decision log, trade-offs, and implementation notes.

## Verified status

This implementation has been validated locally:

- TypeScript build passes
- Vitest passes with 5 focused checks
- Local HTTP server responds successfully on the queue page

## Development time

This implementation was done as a focused, minimal viable delivery rather than a long-form production build.

Actual coding and implementation effort for the final solution was approximately 3 hours, excluding earlier project discussion, environment setup, and port-debugging overhead.

This is the useful working estimate to communicate in review notes:

- Core matching logic and data model: ~1.5 hours
- HTTP server and queue page: ~0.8 hours
- Validation, replay script, and final verification: ~0.7 hours

## Scope and constraints

This is intentionally a minimal, review-focused implementation rather than a production-grade platform.

- Only the ops review flow is built
- No authentication layer
- No persistent database beyond the in-memory call store used for the exercise
- Matching rules are conservative and explicit by design
