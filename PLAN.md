# Plan

Ops screen users are intake and operations staff, not engineers, and they work in US Central time. Their job is to answer one thing quickly: “Which client and case does this call belong to, or do we need to correct it?” They are not reviewing raw event payloads; they are triaging a live queue of phone calls that need to be attached to the correct record or escalated for review.

I would keep each call record correct as events arrive by storing one canonical record per call_id and treating every event as an update to that same record. I would keep the latest known state, end time, duration, and recording URL, while ignoring exact duplicates and processing late or out-of-order events deterministically. This protects against repeated events, delayed arrivals, and the fact that the same call can send several states before it is complete. The record is always the latest true state of the call, not a log of every event.

Matching would start by normalizing the external_number into the same canonical phone format we use across the system, then hashing it with SHA-256 and comparing it to the client phone hashes we store. Calls where the other party is one of our own company lines are ignored before matching so internal calls are not treated as client calls. If a client has multiple cases, I would attach the call to the newest case based on the most recent relevant case timeline, while keeping any ambiguous or historic cases out of the auto-match path. If the system cannot match confidently, the call is routed to an ops review queue rather than auto-assigned.

The rules above do not cover a few edge cases I would explicitly handle in the design:
- multiple clients sharing the same normalized phone number;
- calls where the number format varies but resolves to the same person;
- cases where a client has multiple active or recently closed cases and “newest” is not obvious;
- calls that are clearly internal or misrouted, which should never be treated as client contacts.

Before building, I would ask the ops team:
- What information must be visible on the review screen to make a confident decision in under a few seconds?
- What do they consider “low confidence” versus “wrong match” for an auto-attached call?
- Should they be able to reassign both the client and case, or only the case?
- How should unresolved calls be prioritized: oldest first, most recent first, or by case urgency?
- Do they want a single queue for all exceptions, or separate queues for “needs review” versus “needs correction”?

This plan keeps the system simple and trustworthy: one accurate record per call, a clear matching policy, and a fast human review path for the calls we cannot place automatically.
