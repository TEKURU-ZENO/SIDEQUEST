import { describe, expect, it } from "vitest";
import { GameApplication, InMemoryGameRepository } from "./index.js";

describe("Phase 0.1 application acceptance probes", () => {
  it("rejects invalid gameplay transitions without changing authoritative state", async () => {
    const repository = new InMemoryGameRepository();
    const application = new GameApplication(repository);
    const before = await application.snapshot();
    await expect(
      application.dispatch({
        type: "encounter.act",
        action: "attack",
        playerId: "unjoined",
      }),
    ).rejects.toThrow();
    expect(await application.snapshot()).toEqual(before);
  });

  it("persists ordered accepted events in the development repository", async () => {
    const repository = new InMemoryGameRepository();
    const application = new GameApplication(repository);
    const result = await application.dispatch({
      type: "quest.launch",
      questId: "ember-vault",
    });
    const readEventsAfter = (
      repository as unknown as {
        readEventsAfter: (sequence: number) => Promise<unknown[]>;
      }
    ).readEventsAfter;
    expect(await readEventsAfter.call(repository, 0)).toEqual(result.events);
  });

  it("serializes concurrent commands instead of dropping state updates", async () => {
    const application = new GameApplication(new InMemoryGameRepository());
    await application.dispatch({
      type: "quest.launch",
      questId: "ember-vault",
    });
    await application.dispatch({
      type: "player.join",
      playerId: "viewer-1",
      role: "scout",
    });
    await Promise.all([
      application.dispatch({
        type: "encounter.act",
        playerId: "viewer-1",
        action: "attack",
      }),
      application.dispatch({
        type: "encounter.act",
        playerId: "viewer-1",
        action: "attack",
      }),
    ]);
    const state = await application.snapshot();
    expect(state.actions).toBe(2);
    expect(state.encounterVitality).toBe(52);
    expect(state.sequence).toBe(4);
  });

  it("deduplicates accepted Twitch-style message IDs and verifies replayed state", async () => {
    const application = new GameApplication(new InMemoryGameRepository());
    const first = await application.dispatch(
      { type: "quest.launch", questId: "inbox-quest" },
      { idempotencyKey: "event-message-1" },
    );
    const duplicate = await application.dispatch(
      { type: "quest.launch", questId: "inbox-quest" },
      { idempotencyKey: "event-message-1" },
    );
    expect(first.events).toHaveLength(1);
    expect(duplicate.events).toEqual([]);
    expect(duplicate.state.sequence).toBe(1);
    expect(await application.verify()).toMatchObject({ valid: true });
  });
});
