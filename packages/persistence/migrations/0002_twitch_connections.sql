CREATE TABLE IF NOT EXISTS "twitch_connections" (
  "guild_id" text PRIMARY KEY NOT NULL REFERENCES "guilds"("id"),
  "broadcaster_id" text NOT NULL UNIQUE,
  "login" text NOT NULL,
  "display_name" text NOT NULL,
  "access_token_ciphertext" text NOT NULL,
  "refresh_token_ciphertext" text NOT NULL,
  "scopes" jsonb NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "twitch_connections_broadcaster_uq"
  ON "twitch_connections" ("broadcaster_id");
