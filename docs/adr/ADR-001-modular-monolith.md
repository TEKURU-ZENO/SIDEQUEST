# ADR-001: Modular monolith

**Status:** Accepted

**Context:** SIDEQUEST is early and needs reliable changes across game rules, Twitch and realtime state without distributed-system overhead.

**Decision:** Ship one deployable API with explicit internal modules and package boundaries.

**Alternatives:** Microservices (more independent scaling, but adds network failure and operations work); a single unstructured app (simpler now, harder to evolve).

**Consequences:** Modules may be extracted later when ownership or load justifies it. CI enforces boundaries and the app owns adapter composition.
