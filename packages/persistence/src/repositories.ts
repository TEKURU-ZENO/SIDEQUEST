import { and, asc, desc, eq, gt, isNull, lt, or } from "drizzle-orm";
import { RealtimeEventSchema } from "@sidequest/contracts";
import {
  createGame,
  type DomainEvent,
  type GameState,
  type WorldEvent,
  type WorldState,
} from "@sidequest/domain";
import type { GameRepository, WorldRepository } from "@sidequest/application";
import type { PersistenceDatabase } from "./database.js";
import {
  domainEvents,
  gameSnapshots,
  guilds,
  outbox,
  worldSnapshots,
} from "./schema.js";

export class ConcurrentAggregateUpdateError extends Error {
  constructor(aggregate: string) {
    super(`Concurrent ${aggregate} update detected`);
    this.name = "ConcurrentAggregateUpdateError";
  }
}

function assertGameState(value: unknown): asserts value is GameState {
  if (!value || typeof value !== "object")
    throw new Error("Stored game snapshot is not an object");
  const state = value as Partial<GameState>;
  if (
    typeof state.questId !== "string" ||
    !["ready", "active", "won", "lost"].includes(state.status ?? "") ||
    !Number.isInteger(state.sequence) ||
    !Number.isInteger(state.encounterVitality) ||
    (state.encounterVitality ?? -1) < 0 ||
    (state.encounterVitality ?? 101) > 100 ||
    !state.players ||
    typeof state.players !== "object" ||
    !Array.isArray(state.completedQuestIds) ||
    !state.votes ||
    typeof state.votes !== "object"
  )
    throw new Error("Stored game snapshot failed validation");
}

function eventId(guildId: string, aggregate: string, sequence: number) {
  return `${guildId}:${aggregate}:${sequence}`;
}

export class PostgresGameRepository implements GameRepository {
  constructor(
    private readonly db: PersistenceDatabase,
    readonly guildId: string,
  ) {}

  async initialize(
    guildName: string,
    initialState = createGame("ember-vault"),
  ) {
    await this.db.transaction(async (tx) => {
      await tx
        .insert(guilds)
        .values({ id: this.guildId, name: guildName })
        .onConflictDoNothing();
      const [guild] = await tx
        .select({ id: guilds.id, name: guilds.name })
        .from(guilds)
        .where(eq(guilds.id, this.guildId))
        .limit(1);
      if (!guild)
        throw new Error(`Guild ${this.guildId} could not be initialized`);
      if (guild.name !== guildName)
        throw new Error("Guild identity already exists with a different name");
      const snapshots = await tx
        .select({ id: gameSnapshots.id })
        .from(gameSnapshots)
        .where(eq(gameSnapshots.guildId, this.guildId))
        .limit(1);
      if (snapshots.length === 0) {
        await tx
          .insert(gameSnapshots)
          .values({
            id: eventId(this.guildId, "game-snapshot", initialState.sequence),
            guildId: this.guildId,
            sequence: initialState.sequence,
            state: initialState,
          })
          .onConflictDoNothing();
      }
    });
  }

  async load(): Promise<GameState> {
    const [row] = await this.db
      .select({ state: gameSnapshots.state })
      .from(gameSnapshots)
      .where(eq(gameSnapshots.guildId, this.guildId))
      .orderBy(desc(gameSnapshots.sequence))
      .limit(1);
    if (!row)
      throw new Error(
        `Game snapshot is not initialized for guild ${this.guildId}`,
      );
    assertGameState(row.state);
    return structuredClone(row.state);
  }

  async save(
    state: GameState,
    events: DomainEvent[],
    expectedSequence: number,
  ) {
    if (state.sequence !== expectedSequence + events.length)
      throw new Error("Game snapshot sequence does not match its events");
    await this.db.transaction(async (tx) => {
      const [guild] = await tx
        .select({ id: guilds.id })
        .from(guilds)
        .where(eq(guilds.id, this.guildId))
        .for("update");
      if (!guild) throw new Error(`Guild ${this.guildId} does not exist`);
      const [latest] = await tx
        .select({ sequence: gameSnapshots.sequence })
        .from(gameSnapshots)
        .where(eq(gameSnapshots.guildId, this.guildId))
        .orderBy(desc(gameSnapshots.sequence))
        .limit(1)
        .for("update");
      if (!latest || latest.sequence !== expectedSequence)
        throw new ConcurrentAggregateUpdateError("game");
      if (events.length === 0) return;
      for (const [index, event] of events.entries()) {
        const sequence = expectedSequence + index + 1;
        if (event.sequence !== sequence)
          throw new Error("Game event sequence is not contiguous");
        const id = eventId(this.guildId, "game", sequence);
        await tx.insert(domainEvents).values({
          id,
          guildId: this.guildId,
          aggregateType: "game",
          sequence,
          type: event.type,
          payload: event,
        });
        const notification = RealtimeEventSchema.parse({
          type: "game.snapshot",
          version: 1,
          sequence: state.sequence,
          state,
        });
        await tx.insert(outbox).values({
          id: `${id}:socket`,
          eventId: id,
          channel: "game.snapshot",
          payload: notification,
        });
      }
      assertGameState(state);
      await tx.insert(gameSnapshots).values({
        id: eventId(this.guildId, "game-snapshot", state.sequence),
        guildId: this.guildId,
        sequence: state.sequence,
        state,
      });
    });
  }

  async readEventsAfter(sequence: number): Promise<DomainEvent[]> {
    const rows = await this.db
      .select({ payload: domainEvents.payload })
      .from(domainEvents)
      .where(
        and(
          eq(domainEvents.guildId, this.guildId),
          eq(domainEvents.aggregateType, "game"),
          gt(domainEvents.sequence, sequence),
        ),
      )
      .orderBy(asc(domainEvents.sequence));
    return rows.map((row) => row.payload as DomainEvent);
  }
}

export class PostgresWorldRepository implements WorldRepository {
  constructor(private readonly db: PersistenceDatabase) {}

  async create(state: WorldState) {
    await this.db.transaction(async (tx) => {
      await tx
        .insert(guilds)
        .values({ id: state.id, name: state.guild.name })
        .onConflictDoNothing();
      const [guild] = await tx
        .select({ name: guilds.name })
        .from(guilds)
        .where(eq(guilds.id, state.id))
        .limit(1);
      if (!guild || guild.name !== state.guild.name)
        throw new Error("Guild identity already exists with a different name");
      await tx
        .insert(worldSnapshots)
        .values({
          guildId: state.id,
          sequence: state.sequence,
          state,
          genesis: state,
        })
        .onConflictDoNothing();
    });
  }

  async genesis(worldId: string): Promise<WorldState | undefined> {
    const [row] = await this.db
      .select({ genesis: worldSnapshots.genesis })
      .from(worldSnapshots)
      .where(eq(worldSnapshots.guildId, worldId))
      .limit(1);
    return row?.genesis as WorldState | undefined;
  }

  async load(worldId: string): Promise<WorldState | undefined> {
    const [row] = await this.db
      .select({ state: worldSnapshots.state })
      .from(worldSnapshots)
      .where(eq(worldSnapshots.guildId, worldId))
      .limit(1);
    return row?.state as WorldState | undefined;
  }

  async save(
    state: WorldState,
    events: WorldEvent[],
    expectedSequence: number,
  ) {
    if (state.sequence !== expectedSequence + events.length)
      throw new Error("World snapshot sequence does not match its events");
    await this.db.transaction(async (tx) => {
      const [latest] = await tx
        .select({ sequence: worldSnapshots.sequence })
        .from(worldSnapshots)
        .where(eq(worldSnapshots.guildId, state.id))
        .for("update");
      if (!latest || latest.sequence !== expectedSequence)
        throw new ConcurrentAggregateUpdateError("world");
      if (events.length === 0) return;
      for (const [index, event] of events.entries()) {
        const sequence = expectedSequence + index + 1;
        if (event.sequence !== sequence)
          throw new Error("World event sequence is not contiguous");
        const id = eventId(state.id, "world", sequence);
        await tx.insert(domainEvents).values({
          id,
          guildId: state.id,
          aggregateType: "world",
          sequence,
          type: event.type,
          payload: event,
        });
        await tx.insert(outbox).values({
          id: `${id}:socket`,
          eventId: id,
          channel: "world.snapshot",
          payload: RealtimeEventSchema.parse({
            type: "world.snapshot",
            version: 1,
            sequence: state.sequence,
            state,
          }),
        });
      }
      await tx
        .update(worldSnapshots)
        .set({ sequence: state.sequence, state, updatedAt: new Date() })
        .where(eq(worldSnapshots.guildId, state.id));
    });
  }

  async readHistory(worldId: string): Promise<WorldEvent[]> {
    const rows = await this.db
      .select({ payload: domainEvents.payload })
      .from(domainEvents)
      .where(
        and(
          eq(domainEvents.guildId, worldId),
          eq(domainEvents.aggregateType, "world"),
        ),
      )
      .orderBy(asc(domainEvents.sequence));
    return rows.map((row) => row.payload as WorldEvent);
  }
}

export class PostgresOutboxPublisher {
  constructor(
    private readonly db: PersistenceDatabase,
    private readonly publish: (
      channel: string,
      payload: unknown,
    ) => void | Promise<void>,
  ) {}

  async publishPending(limit = 50): Promise<number> {
    const expiredLease = new Date(Date.now() - 30_000);
    const claimed = await this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(outbox)
        .where(
          and(
            isNull(outbox.publishedAt),
            or(isNull(outbox.lockedAt), lt(outbox.lockedAt, expiredLease)),
          ),
        )
        .orderBy(asc(outbox.createdAt))
        .limit(limit)
        .for("update", { skipLocked: true });
      const now = new Date();
      for (const row of rows) {
        await tx
          .update(outbox)
          .set({ lockedAt: now, attempts: row.attempts + 1 })
          .where(eq(outbox.id, row.id));
      }
      return rows.map((row) => ({
        ...row,
        lockedAt: now,
        attempts: row.attempts + 1,
      }));
    });

    let delivered = 0;
    for (const item of claimed) {
      try {
        await this.publish(item.channel, item.payload);
        await this.db
          .update(outbox)
          .set({ publishedAt: new Date(), lockedAt: null, lastError: null })
          .where(eq(outbox.id, item.id));
        delivered += 1;
      } catch (error) {
        await this.db
          .update(outbox)
          .set({
            lockedAt: null,
            lastError:
              error instanceof Error
                ? error.message.slice(0, 2000)
                : "Realtime publish failed",
          })
          .where(eq(outbox.id, item.id));
      }
    }
    return delivered;
  }
}
