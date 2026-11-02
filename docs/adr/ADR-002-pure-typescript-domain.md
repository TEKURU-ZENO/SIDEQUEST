# ADR-002: Pure TypeScript game domain

**Status:** Accepted

**Context:** Gameplay outcomes must be explainable, repeatable and testable independently from Twitch and AI.

**Decision:** Implement rules and transitions as pure TypeScript functions with typed commands, states and events.

**Alternatives:** Put rules in API handlers (fast start, but couples transport and game); let an LLM decide outcomes (flexible prose, nondeterministic authority).

**Consequences:** Changes arrive as explicit domain logic and replayable test cases. Domain has no framework or infrastructure dependency.
