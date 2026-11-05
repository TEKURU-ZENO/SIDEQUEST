# SIDEQUEST — partner brief

## A persistent story layer for live creator products

**SIDEQUEST turns audience participation into a shared world that remembers what happened between streams.** Viewers act through chat or selected Channel Points rewards; deterministic game rules resolve the encounter; the world records each chapter and viewer contribution; a creator-approved story and OBS browser overlay make the outcome visible.

## The product gap

Most live-stream interactions are momentary: a chat command, alert or poll ends when the event is over. Creator platforms help audiences participate in a stream, but creators still have to invent a repeatable game loop and carry its story forward themselves.

## What SIDEQUEST adds

- **A persistent community world:** viewer profiles, reputation, decisions and completed chapters are backed by ordered domain history.
- **Fair game rules:** commands and rewards map to deterministic actions with role and contribution limits; replay can verify the result.
- **Creator control:** AI can propose quests and recaps, but the creator approves a quest before it launches. Generated public text passes moderation and uses an authored fallback.
- **A visible output:** a separate OBS browser overlay reflects live state; the dashboard shows participation and chapter recaps.
- **An integration boundary:** platform events normalize into shared game commands instead of putting Twitch-specific logic inside the game engine.

## Best-fit partners

1. **StreamElements** is the strongest integration hypothesis: it already brings overlays, alerts, chatbot, tipping and loyalty into a creator platform. SIDEQUEST could extend that experience with persistent chapters and deterministic community gameplay. [StreamElements overview](https://docs.streamelements.com/getting-started)
2. **Streamlabs** is an adjacent platform target with widgets, chat, loyalty points and gameful creator widgets. The pitch is a persistent world module that adds cross-stream story continuity. [Streamlabs widgets](https://streamlabs.com/stream-widgets)
3. **Twitch Extensions** are a distribution route, not a presumed buyer. A panel or overlay extension could place viewer interaction inside Twitch. [Twitch Extensions](https://dev.twitch.tv/docs/extensions)

Potential commercial shapes to validate: co-branded integration, white-label module, or licensed API/overlay package. These are researched prospect hypotheses, not confirmed buying interest, signed offers or proven pricing. See the [partner target notes](partner-targets.md).

## Pilot offer

Run a short, instrumented pilot with one creator and a limited reward set. Track:

- viewers who participate at least once;
- repeat participants in a later chapter;
- quest completion and reward rejection rates;
- creator setup time and intervention frequency;
- overlay reconnects and API errors.

The pilot should use earned Channel Points or free chat actions for gameplay. Paid cheers and subscriptions can create cosmetic or collective moments, never a stronger combat advantage.

## What is ready and what is not

**Demonstrable now:** Twitch chat command flow, persistent world and chapter history, deterministic encounters, creator-reviewed quest proposals, moderation gates, a browser overlay, and a dashboard recap. Channel Points reward mapping is implemented in the integration branch and awaits live Twitch validation.

**Required before public production:** authenticated creator sessions, scoped revocable overlay credentials, production database/backup operations, and a live-stream reliability and safety review. Production API startup remains deliberately gated until the auth requirements are met.

## 30-second pitch

“SIDEQUEST gives creator platforms a persistent game layer for live streams. Viewers use chat or channel rewards to shape a deterministic encounter, and their choices become part of a shared world that carries into the next stream. Creators stay in control: quests require approval, actions obey game rules, and the overlay shows the result live. We’re looking for one platform partner and a small creator cohort to measure whether persistent progression brings viewers back.”

## The ask

Explore a pilot with one integration owner and a handful of creators. We will agree on the event mapping, setup flow, safety controls and success measures before a wider launch.
