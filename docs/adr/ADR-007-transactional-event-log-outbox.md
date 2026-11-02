# ADR-007: Transactional event log and outbox

**Status:** Accepted

**Context:** A saved game state without its event or realtime publication can leave clients and history inconsistent.

**Decision:** Commit domain events, state snapshot and outbox records in one database transaction; publish outbox records asynchronously and idempotently.

**Alternatives:** Publish before commit (can announce failed changes); write only to Socket.IO (missed events disappear); adopt a broker now (unnecessary for initial load).

**Consequences:** Add delivery status, retry and observability. Start with PostgreSQL-backed outbox in the modular monolith.
