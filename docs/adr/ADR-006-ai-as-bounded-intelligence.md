# ADR-006: AI as bounded intelligence

**Status:** Accepted

**Context:** AI can make quests and narrative adaptive, but cannot be trusted to enforce game rules.

**Decision:** The model proposes schema-validated content and narrative; application and domain validate all consequential changes.

**Alternatives:** Free-form model output (poorly bounded); no AI (safe, but loses product differentiator).

**Consequences:** Define generator ports, bounded JSON schemas, timeouts, authored fallbacks and aggregate context. Never call an LLM per chat message or allow generated code.
