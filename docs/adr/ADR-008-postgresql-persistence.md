# ADR-008: PostgreSQL production persistence

**Status:** Accepted

**Context:** Guild history, encounters and event ordering need durable relational storage and transactional guarantees.

**Decision:** Use PostgreSQL with Drizzle and reviewed SQL migrations. Keep local demo state in memory.

**Alternatives:** SQLite (easy local storage but less aligned with concurrent production sessions); document DB (flexible shape, weaker fit for ordered relational history).

**Consequences:** Database changes are explicit migrations. The app can run in demo mode without a DB URL; production startup must fail clearly when required DB config is absent.
