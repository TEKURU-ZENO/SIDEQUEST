# SIDEQUEST

**The living community world engine.** Every stream creates a chapter. Every viewer leaves a mark.

SIDEQUEST lets Twitch creators turn their audience into a persistent collaborative community through shared adventures, deterministic encounters, adaptive storytelling and collective progression. The world owns history, the game engine owns rules, AI proposes and narrates experiences, and Twitch is the first platform adapter.

## Current milestone: Phase 0

This branch establishes the monorepo foundation and migrates the browser prototype into React apps. The original prototype is preserved in the `prototype-v1` Git tag and its root files remain available until migrated features are checked. No Twitch credentials or AI key are required for local development.

## Prerequisites and setup

- Node.js 22 or newer
- pnpm 11.25 or newer
- Docker Desktop (only when starting PostgreSQL)

```sh
pnpm install
pnpm dev
```

The dashboard is at `http://localhost:5173`, the OBS overlay at `http://localhost:5174`, and the API at `http://localhost:4000/health`. The local dashboard sends game commands through the API; the overlay receives versioned Socket.IO snapshots. The local API currently uses an in-memory repository, so state resets when it restarts.

Copy `.env.example` to `.env` to configure local settings. Do not commit secrets. Start PostgreSQL when needed with `docker compose -f infrastructure/docker/compose.yaml up -d`; apply explicit migrations from `packages/persistence/migrations` before connecting a production repository.

Useful commands:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Capture the preserved pre-migration UI with `pnpm capture:prototype`. The archived images are [dashboard](docs/architecture/prototype-screenshots/dashboard.png) and [overlay](docs/architecture/prototype-screenshots/overlay.png).

## Workspace map

| Workspace                | Responsibility                                                     |
| ------------------------ | ------------------------------------------------------------------ |
| `apps/api`               | Express API, Socket.IO gateway, local in-memory adapter            |
| `apps/dashboard`         | Streamer command center and demo chat controls                     |
| `apps/overlay`           | Transparent, read-only OBS scene connected to snapshots            |
| `packages/domain`        | Pure deterministic game rules, state and domain events             |
| `packages/application`   | Validated command use cases and repository ports                   |
| `packages/contracts`     | Zod schemas for commands, envelopes, API and realtime events       |
| `packages/twitch`        | Twitch event normalization into domain commands                    |
| `packages/intelligence`  | Validated AI quest proposals, world context and authored fallback  |
| `packages/persistence`   | Drizzle schema, PostgreSQL and explicit SQL migration/outbox shape |
| `packages/ui`            | Shared React UI primitives and theme tokens                        |
| `packages/observability` | Pino logger with credential redaction and OTel API dependency      |
| `packages/config`        | Environment parsing and safe defaults                              |
| `packages/testing`       | Reusable local demo fixtures                                       |

`apps/viewer` is reserved and intentionally not implemented. See [architecture overview](docs/architecture/overview.md), [prototype migration matrix](docs/architecture/prototype-migration.md), [security boundaries](docs/security/boundaries.md), and [ADRs](docs/adr/).

## Invariants

- Only validated application commands mutate game state.
- The domain imports no framework, database, Twitch SDK or AI provider.
- Twitch messages are normalized and runtime-validated before becoming commands.
- AI output is schema checked and can propose content only; it cannot award rewards or alter authoritative state.
- Persist domain events, snapshots and outbox work in a single database transaction before publishing realtime updates.
- Realtime consumers receive versioned snapshots with sequence numbers and can request a fresh snapshot after a missed update.
- Start as one modular backend. Do not split into services before measured scale requires it.

## Phase plan

0. Architecture foundation and prototype migration.
1. Deterministic encounters, roles, lifecycle and replayable simulations.
2. Persistent guilds, identities, progression and verified world history.
3. PostgreSQL repositories, transactional event/outbox and realtime recovery.
4. Twitch OAuth, EventSub, chat moderation and reconnection.
5. Adaptive quest, narrative and world chronicler services with fallbacks.
6. Creator controls and production OBS integration.
7. Creator validation, reliability, security and operational maturity.

The next phase must not begin until Phase 0 checks pass and migrated behavior is reviewed.
