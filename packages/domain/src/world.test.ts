import { describe, expect, it } from "vitest";
import {
  applyWorldCommand,
  createWorld,
  replayWorld,
  verifyWorldHistory,
  type WorldCommand,
} from "./world.js";

const cmd = (command: WorldCommand) => command;

describe("persistent world aggregate", () => {
  it("keeps guild identity, member progression and adventure history in one aggregate", () => {
    const commands: WorldCommand[] = [
      cmd({ type: "world.member.join", memberId: "mira", displayName: "Mira" }),
      cmd({ type: "world.member.join", memberId: "sol", displayName: "Sol" }),
      cmd({
        type: "world.adventure.start",
        adventureId: "a-1",
        title: "The Ember Road",
      }),
      cmd({
        type: "world.decision.record",
        decisionId: "d-1",
        prompt: "Which pass?",
        choice: "north",
        decidedBy: "mira",
      }),
      cmd({
        type: "world.chapter.record",
        chapterId: "c-1",
        title: "Ashfall",
        outcome: "won",
        consequence: "The north road is open.",
      }),
      cmd({
        type: "world.reputation.change",
        memberId: "mira",
        delta: 3,
        reason: "Led the expedition",
      }),
      cmd({
        type: "world.achievement.unlock",
        memberId: "mira",
        achievementId: "trailblazer",
      }),
      cmd({
        type: "world.artifact.create",
        artifactId: "ash-compass",
        name: "Ash Compass",
        description: "Points toward old fires.",
        ownerId: "mira",
      }),
      cmd({
        type: "world.relationship.change",
        memberA: "sol",
        memberB: "mira",
        delta: 12,
      }),
      cmd({ type: "world.adventure.complete", outcome: "won" }),
    ];

    const state = replayWorld(
      createWorld("world-1", "The Lantern Guild"),
      commands,
    );

    expect(state.guild).toEqual({
      name: "The Lantern Guild",
      reputation: 3,
      achievements: ["trailblazer"],
    });
    expect(state.members.mira).toMatchObject({
      reputation: 3,
      achievements: ["trailblazer"],
      artifacts: ["ash-compass"],
    });
    expect(state.adventures[0]).toMatchObject({
      status: "completed",
      outcome: "won",
      chapters: [{ id: "c-1", outcome: "won" }],
      decisions: [{ choice: "north", decidedBy: "mira" }],
    });
    expect(state.relationships).toEqual([
      { memberA: "mira", memberB: "sol", affinity: 12 },
    ]);
    expect(Object.keys(state.artifacts)).toEqual(["ash-compass"]);
    expect(state.history.map((event) => event.sequence)).toEqual(
      Array.from({ length: commands.length }, (_, index) => index + 1),
    );
  });

  it("makes member joins and achievement unlocks idempotent", () => {
    const initial = createWorld("world-1", "The Lantern Guild");
    const joined = applyWorldCommand(
      initial,
      cmd({ type: "world.member.join", memberId: "mira", displayName: "Mira" }),
    );
    const duplicateJoin = applyWorldCommand(
      joined.state,
      cmd({
        type: "world.member.join",
        memberId: "mira",
        displayName: "Mira the Scout",
      }),
    );
    const unlock = applyWorldCommand(
      duplicateJoin.state,
      cmd({
        type: "world.achievement.unlock",
        memberId: "mira",
        achievementId: "first-light",
      }),
    );
    const duplicateUnlock = applyWorldCommand(
      unlock.state,
      cmd({
        type: "world.achievement.unlock",
        memberId: "mira",
        achievementId: "first-light",
      }),
    );

    expect(duplicateJoin.events).toEqual([]);
    expect(duplicateUnlock.events).toEqual([]);
    expect(duplicateUnlock.state.sequence).toBe(2);
    expect(duplicateUnlock.state.members.mira?.displayName).toBe("Mira");
  });

  it("rejects invalid lifecycle transitions and leaves the prior aggregate untouched", () => {
    const initial = createWorld("world-1", "The Lantern Guild");
    expect(() =>
      applyWorldCommand(
        initial,
        cmd({ type: "world.adventure.complete", outcome: "won" }),
      ),
    ).toThrow("An active adventure is required");
    expect(() =>
      applyWorldCommand(
        initial,
        cmd({
          type: "world.decision.record",
          decisionId: "d-1",
          prompt: "Choose",
          choice: "north",
          decidedBy: "missing",
        }),
      ),
    ).toThrow("An active adventure is required");
    const started = applyWorldCommand(
      initial,
      cmd({
        type: "world.adventure.start",
        adventureId: "a-1",
        title: "The Ember Road",
      }),
    );
    const before = structuredClone(started.state);
    expect(() =>
      applyWorldCommand(
        started.state,
        cmd({
          type: "world.reputation.change",
          memberId: "missing",
          delta: 1,
          reason: "test",
        }),
      ),
    ).toThrow("Reputation can only change for a world member");
    expect(started.state).toEqual(before);
  });

  it("replays command history deterministically and preserves append-only facts", () => {
    const initial = createWorld("world-1", "The Lantern Guild");
    const commands: WorldCommand[] = [
      cmd({ type: "world.member.join", memberId: "mira", displayName: "Mira" }),
      cmd({
        type: "world.adventure.start",
        adventureId: "a-1",
        title: "The Ember Road",
      }),
      cmd({
        type: "world.chapter.record",
        chapterId: "c-1",
        title: "Ashfall",
        outcome: "lost",
        consequence: "The pass is sealed.",
      }),
      cmd({ type: "world.adventure.complete", outcome: "lost" }),
    ];
    expect(replayWorld(initial, commands)).toEqual(
      replayWorld(initial, commands),
    );
    expect(replayWorld(initial, commands).history).toHaveLength(4);
    expect(() =>
      applyWorldCommand(
        replayWorld(initial, commands),
        cmd({
          type: "world.adventure.start",
          adventureId: "a-1",
          title: "Reuse",
        }),
      ),
    ).toThrow("Adventure id has already been used");
  });

  it("reconstructs and verifies a snapshot against sequenced world facts", () => {
    const initial = createWorld("world-1", "The Lantern Guild");
    const commands: WorldCommand[] = [
      cmd({ type: "world.member.join", memberId: "mira", displayName: "Mira" }),
      cmd({
        type: "world.adventure.start",
        adventureId: "a-1",
        title: "The Ember Road",
      }),
      cmd({
        type: "world.chapter.record",
        chapterId: "c-1",
        title: "Ashfall",
        outcome: "won",
        consequence: "The northern road is open.",
      }),
      cmd({ type: "world.adventure.complete", outcome: "won" }),
    ];
    const expected = replayWorld(initial, commands);
    const verified = verifyWorldHistory(initial, expected.history, expected);
    const tampered = structuredClone(expected.history);
    const chapter = tampered.find(
      (event) => event.type === "world.chapter.recorded",
    );
    if (chapter?.type === "world.chapter.recorded")
      chapter.chapter.consequence = "The southern road is open.";

    expect(verified.valid).toBe(true);
    expect(verified.valid && verified.state).toEqual(expected);
    expect(verifyWorldHistory(initial, tampered, expected)).toMatchObject({
      valid: false,
      reason: "World snapshot does not match replayed history",
    });
    expect(
      verifyWorldHistory(
        initial,
        [expected.history[0]!, expected.history[2]!],
        expected,
      ),
    ).toMatchObject({
      valid: false,
      reason: "World history sequence gap: expected 2, received 3",
    });
  });
});
