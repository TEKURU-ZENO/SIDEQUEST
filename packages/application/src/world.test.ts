import { describe, expect, it } from "vitest";
import { InMemoryWorldRepository, WorldApplication } from "./world.js";

describe("world application use cases", () => {
  it("keeps adventure progression across sessions and verifies its event history", async () => {
    const repository = new InMemoryWorldRepository();
    const application = new WorldApplication(repository);
    await application.createWorld("world-1", "Lantern Guild");
    await application.dispatch("world-1", {
      type: "world.member.join",
      memberId: "mira",
      displayName: "Mira",
    });
    await application.dispatch("world-1", {
      type: "world.adventure.start",
      adventureId: "chapter-run-1",
      title: "The Ember Road",
    });
    await application.dispatch("world-1", {
      type: "world.chapter.record",
      chapterId: "chapter-1",
      title: "Ashfall",
      outcome: "won",
      consequence: "The north road is open.",
    });
    await application.dispatch("world-1", {
      type: "world.reputation.change",
      memberId: "mira",
      delta: 2,
      reason: "Led the expedition",
    });
    await application.dispatch("world-1", {
      type: "world.adventure.complete",
      outcome: "won",
    });

    const restartedApplication = new WorldApplication(repository);
    expect(
      (await restartedApplication.snapshot("world-1")).members.mira?.reputation,
    ).toBe(2);
    expect(await restartedApplication.verify("world-1")).toMatchObject({
      valid: true,
    });
    expect(
      (await restartedApplication.history("world-1")).map(
        (event) => event.sequence,
      ),
    ).toEqual([1, 2, 3, 4, 5]);
  });

  it("rejects malformed or unknown-world writes without changing history", async () => {
    const repository = new InMemoryWorldRepository();
    const application = new WorldApplication(repository);
    await application.createWorld("world-1", "Lantern Guild");
    await expect(
      application.dispatch("world-1", {
        type: "world.reputation.change",
        memberId: "mira",
        delta: 0,
        reason: "bad",
      }),
    ).rejects.toThrow();
    await expect(
      application.dispatch("missing", {
        type: "world.member.join",
        memberId: "mira",
        displayName: "Mira",
      }),
    ).rejects.toThrow("World does not exist");
    expect(await application.history("world-1")).toEqual([]);
  });

  it("serializes concurrent updates to a guild aggregate", async () => {
    const application = new WorldApplication(new InMemoryWorldRepository());
    await application.createWorld("world-1", "Lantern Guild");
    await Promise.all([
      application.dispatch("world-1", {
        type: "world.member.join",
        memberId: "mira",
        displayName: "Mira",
      }),
      application.dispatch("world-1", {
        type: "world.member.join",
        memberId: "sol",
        displayName: "Sol",
      }),
    ]);
    expect((await application.snapshot("world-1")).sequence).toBe(2);
    expect(await application.verify("world-1")).toMatchObject({ valid: true });
  });
});
