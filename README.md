# SIDEQUEST

SIDEQUEST turns a Twitch community into a persistent, collaborative adventure. This repository currently contains a browser based vertical slice of the streamer command center, a deterministic encounter loop, a world memory panel, and an OBS overlay composition preview.

## Run the demo

Open `index.html` in a browser, or serve this folder from a local web server. For an OBS browser source, use `overlay.html` as a visual composition preview. The overlay is currently a static sample; it is not yet connected to the command center's live state.

The demo chat box accepts `!join`, `!attack`, `!heal`, `!scout`, `!vote 1`, and `!sabotage`. Select a role before using an action. The role cards and **+** button let you add local demo viewers. Resolve the encounter to see the outcome feed into the following quest. The outcome is determined by fixed game rules, not by an LLM.

## Product plan

1. **Prove the stream loop.** Run the same encounter with a few real creators. Optimize time from a viewer's first action to visible feedback, and check that viewers understand their contribution without streamer explanation.
2. **Connect Twitch securely.** Add backend OAuth for broadcaster and bot identities, minimum chat scopes, EventSub WebSocket subscription, reconnect/resubscribe behavior, message normalization and rate limits. Keep tokens server side. Make connection status and failure recovery visible to the streamer.
3. **Harden deterministic play.** Put the state machine on the server. Define role abilities, cooldowns, per-viewer contribution caps, vote windows, round timing, duplicate event handling and moderation controls. Persist versioned session snapshots and community progression in SQLite.
4. **Add bounded AI services.** Generate quest content as schema-validated JSON, use a reviewed fallback pack, and summarize aggregate session outcomes for the next quest. AI may propose objectives and narration; only the validated rules engine can change health, rewards or progression. Never send every chat message to the model.
5. **Make the overlay live.** Serve a read-only, per-stream overlay URL over Socket.IO. Support transparent backgrounds, 1080p safe areas, compact/full layouts and clear animations for role joins, objective progress and outcomes. Avoid exposing control or credential routes in the browser source.
6. **Validate repeat use.** Pilot 3–5 small streamers over two streams each. Track setup completion, join conversion, unique contributors, repeat actions, contribution spread, moderation load and second-session retention. Expand game categories only after creators reuse the loop.

## Suggested first production slice

- **One game, one quest type, one boss, four roles.** Avoid a generic game platform until a second-session retention signal exists.
- **Server owns truth.** Normalize Twitch events into typed actions; validate permissions, cooldowns and phase before applying them. Broadcast a versioned state snapshot to dashboard and overlay.
- **AI is a content dependency, not a rules dependency.** Validate model output against schemas and game bounds. Time out quickly and fall back to authored quests and narration.
- **Useful reliability signals.** Log event receipt, rejection reason, state transition, overlay broadcast and AI fallback without storing unnecessary chat history.

## Next engineering milestone

Replace the local action handler with an Express + Socket.IO server and a typed shared game-state module. Add OAuth and EventSub only after the local server is in place, then bind both dashboard and overlay to its authoritative state. The current frontend is an interaction prototype; no Twitch account, OAuth, live chat, AI provider or database is connected yet.
