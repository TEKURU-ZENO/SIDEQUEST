# SIDEQUEST partner demo

**Target length:** 5–7 minutes. Use a local seeded demo or an approved pilot channel. Do not imply that Twitch live redemptions or production authentication have passed validation unless they have.

## 1. Start with the viewer problem (30 seconds)

“A viewer can help with a stream moment today, but the story usually resets tomorrow. SIDEQUEST makes those actions part of a community world that persists.”

## 2. Show the creator loop (60 seconds)

- Open the command center.
- Request a quest proposal.
- Show the creator approval step and explain that the model proposes content; the game engine owns rules and state.
- Launch the approved quest.

## 3. Show participation and fairness (90 seconds)

- Join a viewer and assign a role.
- Apply an encounter action from chat or a configured Channel Points reward.
- Show the same state update in the dashboard and OBS overlay.
- Explain that rewards map to bounded, role-checked actions; redemption text is ignored and viewer actions do not bypass game limits.

## 4. Show persistence and auditability (60 seconds)

- Resolve the encounter.
- Show the chapter consequence and the latest participation recap.
- Open the game history verification endpoint or dashboard link to show replay validation.
- Restart only if using PostgreSQL; local in-memory demo state resets on restart.

## 5. Close with the partner value (30 seconds)

“This gives your creators a repeatable audience game loop and gives your product a persistent engagement feature. We propose a limited pilot to measure repeat participation, creator setup burden, completion rates and reliability before expanding the integration.”

## Demo checklist

- Use a test channel and a small, clearly named reward set.
- Ensure the matching role is assigned before redeeming a role-specific action.
- Configure Twitch OAuth scopes for the selected integration and check `/api/twitch/status`.
- Run with PostgreSQL when demonstrating cross-restart persistence.
- Keep a local chat-command path available in case EventSub or the broadcaster connection drops.
- Do not expose the API publicly as a production service until authenticated streamer sessions and scoped read-only overlay credentials are complete.
