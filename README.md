# SIDEQUEST

**The living community world engine.** Every stream creates a chapter. Every viewer leaves a mark.

SIDEQUEST lets Twitch creators turn their audience into a persistent collaborative community through shared adventures, deterministic encounters, adaptive storytelling and collective progression. The world owns history, the game engine owns rules, AI proposes and narrates experiences, and Twitch is the first platform adapter.

## Current milestone: Phase 0.2 — Gameplay Integrity and World Integration

The Phase 0.1 engineering audit found gameplay integrity gaps despite the later feature slices. This milestone repairs role effects, consecutive encounter state, game replay, durable Twitch deduplication, and gameplay-to-world history before Phase 0 can be accepted. The in-memory adapter remains available when `DATABASE_URL` is unset. Production API startup remains disabled until authenticated streamer and overlay sessions are implemented. The original prototype is preserved in the `prototype-v1` Git tag. No Twitch credentials or AI key are required for local development.

## Prerequisites and setup

- Node.js 22 or newer
- pnpm 11.25 or newer
- Docker Desktop (only when starting PostgreSQL)

```sh
pnpm install
pnpm dev
```

The dashboard is at `http://localhost:5173`, the OBS overlay at `http://localhost:5174`, and the API at `http://localhost:4000/health`. The API uses an in-memory repository when `DATABASE_URL` is unset. To retain game and world state across restarts, create `.env` from `.env.example`, start PostgreSQL, run the migration command below, and start the apps:

```sh
docker compose -f infrastructure/docker/compose.yaml up -d
pnpm --filter @sidequest/persistence db:migrate
pnpm dev
```

PostgreSQL writes domain events, snapshots and realtime outbox rows in one transaction. The outbox publisher retries failed deliveries. Production startup remains disabled until authenticated streamer and overlay sessions are implemented.

To enable Twitch locally, register `http://localhost:4000/auth/twitch/callback` as the app redirect URI, then set `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` in `.env`. With PostgreSQL enabled, also set `TWITCH_TOKEN_ENCRYPTION_KEY` to a fresh 32-byte key represented as 64 hexadecimal characters. Open `http://localhost:4000/auth/twitch` to connect the broadcaster. Twitch credentials and tokens stay on the backend; do not expose them in the dashboard or overlay.

Optional Twitch Channel Points actions are configured with `TWITCH_CHANNEL_POINT_REWARDS`, a JSON map from custom reward UUIDs to `attack`, `heal`, `scout`, `vote`, or `sabotage`. When enabled, SIDEQUEST requests `channel:manage:redemptions` so it can fulfill successful actions and cancel rejected ones. See the [Channel Points setup guide](docs/integrations/twitch-channel-points.md). Use only rewards that fit the corresponding game role; chat and reward actions still obey encounter limits.

`.env` is ignored by Git; keep credentials there and never commit them. The production repository remains unavailable until authentication is implemented.

Useful commands:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Vercel multi-service deployment

The root [`vercel.json`](vercel.json) defines three Vercel services in one project: an Express API, a Vite dashboard, and a Vite OBS overlay. The public routes send `/api/*`, `/auth/*`, `/health*`, and `/socket.io/*` to the API, `/overlay/*` to the overlay, and remaining paths to the dashboard. See the [Vercel deployment notes](docs/operations/deployment-vercel.md) for how the clients use the shared routes and the remaining production gate.

Capture the preserved pre-migration UI with `pnpm capture:prototype`. The archived images are [dashboard](docs/architecture/prototype-screenshots/dashboard.png) and [overlay](docs/architecture/prototype-screenshots/overlay.png).

## Workspace map

| Workspace                | Responsibility                                                        |
| ------------------------ | --------------------------------------------------------------------- |
| `apps/api`               | Express API, Socket.IO gateway, local or PostgreSQL adapter           |
| `apps/dashboard`         | Streamer command center and demo chat controls                        |
| `apps/overlay`           | Transparent, read-only OBS scene connected to snapshots               |
| `packages/domain`        | Pure deterministic game rules, state and domain events                |
| `packages/application`   | Validated command use cases and repository ports                      |
| `packages/contracts`     | Zod schemas for commands, envelopes, API and realtime events          |
| `packages/twitch`        | Twitch event normalization into domain commands                       |
| `packages/intelligence`  | Validated AI quest proposals, world context and authored fallback     |
| `packages/persistence`   | PostgreSQL repositories, explicit migrations and transactional outbox |
| `packages/ui`            | Shared React UI primitives and theme tokens                           |
| `packages/observability` | Pino logger with credential redaction and OTel API dependency         |
| `packages/config`        | Environment parsing and safe defaults                                 |
| `packages/testing`       | Reusable local demo fixtures                                          |

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

0.1. Architecture foundation and prototype migration (audit found Phase 0 not accepted).
0.2. Gameplay integrity and world integration (in progress; see [acceptance tracker](docs/operations/phase-0.2-progress.md)).

1. Persistent world aggregate: guild identity, member progression, adventures, chapters, decisions, artifacts, relationships and append-only history; deterministic encounters and replayable simulations.
2. Persistent guilds, identities, progression and verified world history (domain and application foundation implemented).
3. PostgreSQL repositories, transactional event/outbox and realtime recovery (in progress).
4. Twitch OAuth, EventSub chat ingestion, command rate limits and reconnection (in progress).
5. Adaptive quest, narrative and world chronicler services with fallbacks (initial API slice implemented; creator approval and live provider validation remain open).
6. Creator controls and production OBS integration (initial proposal approval and configurable overlay slice implemented; production deployment remains gated).
7. Creator validation, reliability, security and operational maturity (health probes, graceful shutdown and safe request errors implemented; public launch gates remain open).

Phase 1 began before all Phase 0 acceptance gaps were closed. Phase 0 remains open; production authentication, live Twitch validation, live AI provider validation, PostgreSQL integration execution and full frontend parity remain acceptance work. See the [Phase 7 production readiness checklist](docs/operations/production-readiness.md) for deployment gates and probe behavior.

### Phase 5 API slice

The API exposes `POST /api/intelligence/quest-proposal`, `POST /api/intelligence/narrative` (requires a completed `adventureId`), and `GET /api/intelligence/world-summary`. Quest and narrative routes use OpenAI Responses structured JSON output when `OPENAI_API_KEY` is configured; otherwise they return bounded authored fallback content and a `source` field. Set `OPENAI_MODEL` to choose the model. These endpoints return proposals and summaries only: they do not launch adventures, grant XP, or write world events. Provider output is locally schema-validated, provider calls have an 8 second timeout, and request storage is disabled.

### Phase 6 creator and OBS slice

The command center can request a quest proposal, show its AI/fallback source, and require an explicit creator approval before launch. Approved quest display content is attached to the game launch event and snapshots so the overlay can show the title, premise, and objectives. The game domain still controls encounter rules and fixed rewards; the proposal's suggested XP is informational. In a Vercel deployment, both clients use same-origin `/api` and `/socket.io` routes; `?api=https%3A%2F%2Fapi.example.com` remains available when hosting the API separately. Configure `APP_ORIGINS` as the exact frontend origins when using separate hosts. OBS can also use `?layout=compact&accent=%239be8c3`. Production API startup is still disabled until authenticated streamer and overlay sessions are implemented.
