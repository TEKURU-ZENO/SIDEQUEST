import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const guilds = pgTable("guilds", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const gameSnapshots = pgTable(
  "game_snapshots",
  {
    id: text("id").primaryKey(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id),
    sequence: integer("sequence").notNull(),
    state: jsonb("state").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("game_snapshots_guild_sequence_uq").on(
      table.guildId,
      table.sequence,
    ),
  ],
);

export const worldSnapshots = pgTable("world_snapshots", {
  guildId: text("guild_id")
    .primaryKey()
    .references(() => guilds.id),
  sequence: integer("sequence").notNull(),
  state: jsonb("state").notNull(),
  genesis: jsonb("genesis").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const domainEvents = pgTable(
  "domain_events",
  {
    id: text("id").primaryKey(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id),
    aggregateType: text("aggregate_type").notNull().default("game"),
    sequence: integer("sequence").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("domain_events_aggregate_sequence_uq").on(
      table.guildId,
      table.aggregateType,
      table.sequence,
    ),
  ],
);

export const outbox = pgTable(
  "outbox",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => domainEvents.id),
    channel: text("channel").notNull(),
    payload: jsonb("payload").notNull(),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    lastError: text("last_error"),
  },
  (table) => [
    index("outbox_pending_created_idx").on(table.publishedAt, table.createdAt),
    uniqueIndex("outbox_event_channel_uq").on(table.eventId, table.channel),
  ],
);

export const twitchConnections = pgTable(
  "twitch_connections",
  {
    guildId: text("guild_id")
      .primaryKey()
      .references(() => guilds.id),
    broadcasterId: text("broadcaster_id").notNull(),
    login: text("login").notNull(),
    displayName: text("display_name").notNull(),
    accessTokenCiphertext: text("access_token_ciphertext").notNull(),
    refreshTokenCiphertext: text("refresh_token_ciphertext").notNull(),
    scopes: jsonb("scopes").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("twitch_connections_broadcaster_uq").on(table.broadcasterId),
  ],
);

export const twitchEventInbox = pgTable(
  "twitch_event_inbox",
  {
    id: text("id").primaryKey(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("twitch_event_inbox_received_at_idx").on(table.receivedAt)],
);
