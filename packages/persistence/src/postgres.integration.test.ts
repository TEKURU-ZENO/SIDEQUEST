import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GameApplication } from "@sidequest/application";
import { applyCommand } from "@sidequest/domain";
import { createPersistenceDatabase } from "./database.js";
import {
  PostgresGameRepository,
  PostgresOutboxPublisher,
} from "./repositories.js";

const databaseUrl = process.env.DATABASE_URL_TEST;
const postgresSuite = describe.skipIf(!databaseUrl);
const schemaName = `sidequest_it_${randomUUID().replaceAll("-", "")}`;
let admin: Client;
let database: ReturnType<typeof createPersistenceDatabase>;

postgresSuite("PostgreSQL persistence integration", () => {
  beforeAll(async () => {
    admin = new Client({ connectionString: databaseUrl });
    await admin.connect();
    await admin.query(`CREATE SCHEMA "${schemaName}"`);
    const scopedUrl = new URL(databaseUrl!);
    scopedUrl.searchParams.set("options", `-c search_path=${schemaName}`);
    database = createPersistenceDatabase(scopedUrl.toString());
    const migrations = fileURLToPath(
      new URL("../migrations/", import.meta.url),
    );
    for (const file of (await readdir(migrations))
      .filter((name) => name.endsWith(".sql"))
      .sort())
      await database.pool.query(await readFile(join(migrations, file), "utf8"));
  });

  afterAll(async () => {
    await database?.close();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await admin.end();
    }
  });

  it("commits the Twitch inbox key with the command and deduplicates concurrent delivery", async () => {
    const guildId = `dedupe-${randomUUID()}`;
    const repository = new PostgresGameRepository(database.db, guildId);
    await repository.initialize("Integration Guild");
    const firstApp = new GameApplication(repository);
    const secondApp = new GameApplication(repository);
    const results = await Promise.all([
      firstApp.dispatch(
        { type: "quest.launch", questId: "durable-event" },
        { idempotencyKey: "twitch-message-1" },
      ),
      secondApp.dispatch(
        { type: "quest.launch", questId: "durable-event" },
        { idempotencyKey: "twitch-message-1" },
      ),
    ]);
    expect(results.filter((result) => result.events.length === 1)).toHaveLength(
      1,
    );
    expect(results.filter((result) => result.events.length === 0)).toHaveLength(
      1,
    );
    expect((await repository.load()).sequence).toBe(1);
    expect(await firstApp.verify()).toMatchObject({ valid: true });
  });

  it("rolls back inbox, domain event and outbox writes together", async () => {
    const guildId = `rollback-${randomUUID()}`;
    const repository = new PostgresGameRepository(database.db, guildId);
    await repository.initialize("Rollback Guild");
    const initial = await repository.load();
    const command = applyCommand(initial, {
      type: "quest.launch",
      questId: "rollback-quest",
    });
    const invalidState = { ...command.state, partyVitality: 101 };
    await expect(
      repository.save(invalidState, command.events, 0, "rollback-message"),
    ).rejects.toThrow("validation");
    expect(await repository.readEventsAfter(0)).toEqual([]);

    const application = new GameApplication(repository);
    const accepted = await application.dispatch(
      { type: "quest.launch", questId: "rollback-quest" },
      { idempotencyKey: "rollback-message" },
    );
    expect(accepted.events).toHaveLength(1);
    const duplicate = await application.dispatch(
      { type: "quest.launch", questId: "rollback-quest" },
      { idempotencyKey: "rollback-message" },
    );
    expect(duplicate.events).toEqual([]);
    expect(await application.verify()).toMatchObject({ valid: true });
  });

  it("retries failed outbox delivery and publishes each aggregate snapshot once", async () => {
    const guildId = `outbox-${randomUUID()}`;
    const repository = new PostgresGameRepository(database.db, guildId);
    await repository.initialize("Outbox Guild");
    const application = new GameApplication(repository);
    await application.dispatch({
      type: "quest.launch",
      questId: "outbox-quest",
    });
    let shouldFail = true;
    const published: string[] = [];
    const publisher = new PostgresOutboxPublisher(
      database.db,
      async (channel) => {
        if (shouldFail) throw new Error("simulated transport outage");
        published.push(channel);
      },
    );
    expect(await publisher.publishPending()).toBe(0);
    shouldFail = false;
    expect(await publisher.publishPending()).toBe(2);
    expect(published.sort()).toEqual(["game.snapshot", "game.world-event"]);
  });
});
