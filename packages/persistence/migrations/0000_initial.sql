CREATE TABLE IF NOT EXISTS "guilds" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "game_snapshots" (
  "id" text PRIMARY KEY NOT NULL,
  "guild_id" text NOT NULL REFERENCES "guilds"("id"),
  "sequence" integer NOT NULL,
  "state" jsonb NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "game_snapshots_guild_sequence_uq" UNIQUE("guild_id", "sequence")
);
CREATE TABLE IF NOT EXISTS "domain_events" (
  "id" text PRIMARY KEY NOT NULL,
  "guild_id" text NOT NULL REFERENCES "guilds"("id"),
  "sequence" integer NOT NULL,
  "type" text NOT NULL,
  "payload" jsonb NOT NULL,
  "occurred_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "outbox" (
  "id" text PRIMARY KEY NOT NULL,
  "event_id" text NOT NULL REFERENCES "domain_events"("id"),
  "channel" text NOT NULL,
  "payload" jsonb NOT NULL,
  "published_at" timestamptz
);
