# Security boundaries

- Store Twitch OAuth tokens and provider keys only in backend environment/secret storage. `.env` is ignored by Git; use `.env.example` for names, never values.
- Request the minimum Twitch permissions needed. Separate broadcaster authorization from bot chat identity and validate OAuth state before exchanging a code.
- Treat EventSub payloads, browser commands and AI output as untrusted. Validate shape and bounds at each boundary; normalize platform events before dispatch.
- Only the application service invokes domain transitions. Never expose a direct browser-to-domain authority path in production.
- Give OBS a read-only, scoped, revocable stream token. Do not put creator controls or secrets in the overlay URL.
- CORS is a browser origin policy, not authentication. Never expose command routes or realtime snapshots publicly until streamer sessions and scoped OBS credentials are enforced server-side.
- Apply user cooldowns, per-quest contribution caps, channel rate limits, replay protection and moderation before accepting actions.
- Redact authorization headers and access/refresh tokens from logs. Avoid retaining raw chat unless there is a defined moderation or product need.
- AI proposals must validate against schemas, allowlists and numeric limits. Use a timeout and authored fallback; never execute generated code or treat prose as a command.
- Use event sequence numbers and transactional outbox delivery. A reconnecting client requests a fresh snapshot after gaps; duplicate events are idempotently rejected.
- Keep the backend a single deployable modular monolith until measured demand justifies a split.

The API currently refuses production startup because authenticated streamer and overlay sessions are not yet implemented. See [production readiness](../operations/production-readiness.md) for remaining gates.
