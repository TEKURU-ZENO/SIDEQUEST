# Phase 7 production readiness

## Implemented in this phase

- `/health/live` reports process liveness without waiting on external services.
- `/health/ready` and `/health` wait for application initialization and check PostgreSQL with `SELECT 1` when configured. Local in-memory mode reports database as not configured.
- HTTP responses include a generated or validated request ID, and return it in `x-request-id`.
- JSON request bodies remain capped at 32 KB. Invalid JSON, oversized bodies and unhandled failures receive bounded JSON errors; internal exception details are logged, not returned to clients.
- Basic browser security headers disable MIME sniffing, framing, referrer forwarding and caching of API responses.
- SIGINT/SIGTERM stop Twitch EventSub, close Socket.IO connections and drain the PostgreSQL pool.
- Logger redaction covers authorization/cookie headers and common token/API key fields.
- EventSub WebSocket notifications are bounded by Twitch's signed TLS connection, message timestamps, and in-process message ID replay protection. Twitch webhook HMAC verification applies only if the integration is changed to webhook transport.
- Public chat and generated quest/narrative text pass through OpenAI moderation before reaching game or overlay content. Viewer input fails closed when moderation is unconfigured or errors; generated content falls back to authored text.
- Accepted Twitch participation persists viewer membership and reputation in world history. `/api/game/recap` reports participants, actions, new members, and outcome for the latest quest; encounter results remain deterministic and replay-verifiable.

## Required before public production traffic

- Add authenticated streamer sessions and scoped, revocable read-only OBS credentials. CORS origin restrictions do not authenticate clients; Socket.IO snapshots and command routes are not safe to expose publicly yet.
- Add per-account and per-IP HTTP limits, WebSocket connection limits and replay-safe identity binding. Existing cooldowns only protect normalized Twitch chat actions.
- Configure an OpenAI moderation provider for live chat actions. Without it, viewer actions are intentionally held; authored game content and fallback recaps remain available.
- Deploy behind TLS and a trusted proxy; configure exact `APP_ORIGINS`, redirect URIs, secret storage, and trusted proxy settings together.
- Configure PostgreSQL backups, restore drills, migration rollback/forward procedures, pool saturation alerts and outbox backlog alerts.
- Add request latency/error metrics, provider usage/cost tracking, EventSub disconnect alerts, and a documented incident/contact path.
- Complete creator pilots, Twitch OAuth/EventSub live validation, OpenAI provider validation, and OBS reconnect/browser-source validation.
- Remove the production startup guard only after the authentication and overlay credential gates above are implemented and reviewed.

## Probe behavior

Use `/health/live` for container liveness. Use `/health/ready` for traffic readiness. A database outage returns HTTP 503 from readiness while liveness remains HTTP 200 so the process can recover its dependency connection without restart loops.
