# Twitch Channel Points actions

SIDEQUEST can map selected Twitch custom reward redemptions to existing deterministic encounter actions. This is an opt-in transport adapter; reward input text is ignored, and game rules still enforce quest lifecycle, player role and per-player contribution limits.

## Configure

1. Create Twitch custom rewards for the actions you want to offer. Reward IDs are the stable UUIDs shown by Twitch's Helix API; reward titles are not used as identifiers.
2. Set `TWITCH_CHANNEL_POINT_REWARDS` in `.env` to a JSON object mapping reward IDs to actions:

   ```dotenv
   TWITCH_CHANNEL_POINT_REWARDS={"92af127c-7326-4483-a52b-b0da0be61c01":"attack","cfa2d965-4b7f-4e9a-a11b-99ce5eb4b8c3":"heal"}
   ```

3. Reconnect the broadcaster through `/auth/twitch`. When the mapping is nonempty, SIDEQUEST requests `channel:manage:redemptions` in addition to `user:read:chat` so it can fulfill a successful redemption or cancel an action rejected by the game rules.
4. Start a quest and redeem a mapped reward from an eligible Twitch account. Attack/scout rewards require the scout role, heal requires healer, vote requires strategist, and sabotage requires saboteur. A viewer without a current game character is joined using the mapped action's role; an existing character with another role receives a canceled redemption and keeps their existing role.

The viewer's free-form reward input is never interpreted as a command. Unmapped reward IDs are ignored. Twitch redemptions are deduplicated by the EventSub message ID and the persisted redemption ID on the game command path.

## Pilot guidance

Start with a small number of low-cost rewards and one creator. Keep actions non-random and bounded; channel points do not bypass role requirements or action caps. Observe redemption failures and creator workload before enabling several reward types. This integration still needs live Twitch validation with a broadcaster account before it should be described as generally available.
