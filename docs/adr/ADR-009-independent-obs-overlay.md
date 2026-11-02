# ADR-009: Independent OBS overlay application

**Status:** Accepted

**Context:** Overlay layout, refresh and access constraints differ from streamer controls.

**Decision:** Build a separate React/Vite app that consumes read-only, versioned realtime state.

**Alternatives:** Bundle overlay controls into dashboard (risks exposing controls and couples layout); render everything server side (less flexible for animation and browser-source tuning).

**Consequences:** Overlay has its own build and scoped stream token. It never receives Twitch or AI credentials and recovers from missed updates through snapshots.
