CREATE TABLE IF NOT EXISTS "twitch_event_inbox" (
  "id" text PRIMARY KEY NOT NULL,
  "guild_id" text NOT NULL REFERENCES "guilds"("id"),
  "received_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "twitch_event_inbox_received_at_idx"
  ON "twitch_event_inbox" ("received_at");
