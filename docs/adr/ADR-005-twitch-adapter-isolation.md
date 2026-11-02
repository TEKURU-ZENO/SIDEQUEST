# ADR-005: Twitch adapter isolation

**Status:** Accepted

**Context:** Twitch is the first live platform, while game rules should stay platform independent.

**Decision:** OAuth, EventSub and chat parsing live in `packages/twitch`; normalized messages become shared application commands.

**Alternatives:** Embed Twitch SDKs in game logic (fast but hard to test or extend); generalize several platforms now (premature scope).

**Consequences:** Start Twitch-first and add another adapter only after Twitch use is validated. Persist platform identity mappings outside the domain core.
