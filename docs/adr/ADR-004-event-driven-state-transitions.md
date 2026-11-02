# ADR-004: Event-driven transitions

**Status:** Accepted

**Context:** Community history, replay and realtime delivery need a clear record of why state changed.

**Decision:** Domain transitions return ordered, versioned events; state is a projection of accepted commands.

**Alternatives:** Mutate rows in place without a log (less storage, limited audit/replay); adopt a full event-sourcing platform immediately (unneeded operations burden).

**Consequences:** Persist event log and snapshots, with sequence numbers and idempotency. Keep the transition API small enough to change while the domain is young.
