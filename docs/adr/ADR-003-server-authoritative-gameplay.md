# ADR-003: Server-authoritative gameplay

**Status:** Accepted

**Context:** Browser and Twitch inputs are untrusted and viewers must share one consistent encounter.

**Decision:** Only validated application commands can change authoritative state; clients submit intent and receive snapshots.

**Alternatives:** Trust each client (easy to spoof); let the model write state (unsafe and inconsistent).

**Consequences:** Local demo also goes through API commands. Production adds identity, permissions, cooldowns and persistence at the same boundary.
