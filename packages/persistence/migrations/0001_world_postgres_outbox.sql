ALTER TABLE "domain_events"
  ADD COLUMN IF NOT EXISTS "aggregate_type" text NOT NULL DEFAULT 'game';

CREATE UNIQUE INDEX IF NOT EXISTS "domain_events_aggregate_sequence_uq"
  ON "domain_events" ("guild_id", "aggregate_type", "sequence");

CREATE TABLE IF NOT EXISTS "world_snapshots" (
  "guild_id" text PRIMARY KEY NOT NULL REFERENCES "guilds"("id"),
  "sequence" integer NOT NULL,
  "state" jsonb NOT NULL,
  "genesis" jsonb NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE "outbox"
  ADD COLUMN IF NOT EXISTS "attempts" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "created_at" timestamptz DEFAULT now() NOT NULL,
  ADD COLUMN IF NOT EXISTS "locked_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "last_error" text;

CREATE UNIQUE INDEX IF NOT EXISTS "outbox_event_channel_uq"
  ON "outbox" ("event_id", "channel");
CREATE INDEX IF NOT EXISTS "outbox_pending_created_idx"
  ON "outbox" ("published_at", "created_at");
