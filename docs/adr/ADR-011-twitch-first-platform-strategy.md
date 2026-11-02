# ADR-011: Twitch-first platform strategy

**Status:** Accepted

**Context:** Each streaming platform has different auth, event, moderation and rate-limit details.

**Decision:** Validate onboarding, participation and repeat use on Twitch before adding another platform adapter.

**Alternatives:** Multi-platform launch (larger test matrix); generic platform layer before a working Twitch loop (abstraction without evidence).

**Consequences:** The domain remains platform-independent, but platform configuration and product experiments prioritize Twitch.
