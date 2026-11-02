import { describe, expect, it } from "vitest";
import {
  applyCommand,
  createGame,
  replayGameEvents,
  verifyGameHistory,
  type DomainCommand,
  type DomainEvent,
} from "./index.js";

const apply = (state: ReturnType<typeof createGame>, command: DomainCommand) =>
  applyCommand(state, command);

describe("Phase 0.2 gameplay integrity", () => {
  it("gives all four roles a deterministic, distinct effect", () => {
    let state = apply(createGame("roles"), {
      type: "quest.launch",
      questId: "roles",
    }).state;
    for (const [playerId, role] of [
      ["attacker", "scout"],
      ["healer", "healer"],
      ["strategist", "strategist"],
      ["saboteur", "saboteur"],
    ] as const)
      state = apply(state, { type: "player.join", playerId, role }).state;

    state = apply(state, {
      type: "encounter.act",
      playerId: "saboteur",
      action: "sabotage",
    }).state;
    expect([state.encounterVitality, state.partyVitality]).toEqual([56, 88]);
    state = apply(state, {
      type: "encounter.act",
      playerId: "healer",
      action: "heal",
    }).state;
    expect(state.partyVitality).toBe(100);
    state = apply(state, {
      type: "encounter.act",
      playerId: "attacker",
      action: "scout",
    }).state;
    expect([state.objectiveProgress, state.encounterVitality]).toEqual([1, 52]);
    state = apply(state, {
      type: "encounter.act",
      playerId: "strategist",
      action: "vote",
      target: "assault",
    }).state;
    expect(state.votes.strategist).toBe("assault");
  });

  it("reaches both victory and defeat with valid bounded command sequences", () => {
    let winning = apply(createGame("winning-quest"), {
      type: "quest.launch",
      questId: "winning-quest",
    }).state;
    winning = apply(winning, {
      type: "player.join",
      playerId: "scout",
      role: "scout",
    }).state;
    for (let index = 0; index < 9; index++)
      winning = apply(winning, {
        type: "encounter.act",
        playerId: "scout",
        action: "attack",
      }).state;
    expect(winning.encounterVitality).toBe(0);
    winning = apply(winning, { type: "encounter.resolve" }).state;
    expect(winning.status).toBe("won");

    let losing = apply(createGame("losing-quest"), {
      type: "quest.launch",
      questId: "losing-quest",
    }).state;
    losing = apply(losing, {
      type: "player.join",
      playerId: "scout",
      role: "scout",
    }).state;
    expect(apply(losing, { type: "encounter.resolve" }).state.status).toBe(
      "lost",
    );
  });

  it("lets the strategist's route vote change the resolution", () => {
    let state = apply(createGame("strategy-quest"), {
      type: "quest.launch",
      questId: "strategy-quest",
    }).state;
    state = apply(state, {
      type: "player.join",
      playerId: "scout",
      role: "scout",
    }).state;
    state = apply(state, {
      type: "player.join",
      playerId: "strategist",
      role: "strategist",
    }).state;
    for (let index = 0; index < 7; index++)
      state = apply(state, {
        type: "encounter.act",
        playerId: "scout",
        action: "attack",
      }).state;
    expect(state.encounterVitality).toBe(12);
    state = apply(state, {
      type: "encounter.act",
      playerId: "strategist",
      action: "vote",
      target: "assault",
    }).state;
    state = apply(state, { type: "encounter.resolve" }).state;
    expect(state).toMatchObject({ status: "won", encounterVitality: 0 });
  });

  it("resets encounter state across three quests but preserves player identity", () => {
    let state = createGame("quest-1");
    state = apply(state, { type: "quest.launch", questId: "quest-1" }).state;
    state = apply(state, {
      type: "player.join",
      playerId: "returning-viewer",
      role: "scout",
    }).state;
    state = apply(state, {
      type: "encounter.act",
      playerId: "returning-viewer",
      action: "attack",
    }).state;
    state = apply(state, { type: "encounter.resolve" }).state;

    for (const questId of ["quest-2", "quest-3"]) {
      state = apply(state, { type: "quest.launch", questId }).state;
      expect(state).toMatchObject({
        encounterVitality: 68,
        partyVitality: 100,
        objectiveProgress: 0,
        actions: 0,
        votes: {},
      });
      expect(state.players["returning-viewer"]?.contributions).toEqual({});
      state = apply(state, {
        type: "encounter.act",
        playerId: "returning-viewer",
        action: "scout",
      }).state;
      expect(state.objectiveProgress).toBe(1);
      state = apply(state, { type: "encounter.resolve" }).state;
    }
    expect(state.players["returning-viewer"]?.role).toBe("scout");
    expect(state.completedQuestIds).toEqual(["quest-1", "quest-2", "quest-3"]);
  });

  it("replays and verifies multi-quest domain events, rejecting tampered history", () => {
    const events: DomainEvent[] = [];
    let state = createGame("replay-1");
    const commands: DomainCommand[] = [
      { type: "quest.launch", questId: "replay-1" },
      { type: "player.join", playerId: "s", role: "scout" },
      { type: "encounter.act", playerId: "s", action: "attack" },
      { type: "encounter.resolve" },
      { type: "quest.launch", questId: "replay-2" },
      { type: "encounter.act", playerId: "s", action: "scout" },
    ];
    for (const command of commands) {
      const result = apply(state, command);
      state = result.state;
      events.push(...result.events);
    }
    expect(replayGameEvents(createGame("replay-1"), events)).toEqual(state);
    expect(verifyGameHistory(createGame("replay-1"), events, state).valid).toBe(
      true,
    );
    const altered = structuredClone(events);
    const actionEvent = altered.find(
      (event) => event.type === "encounter.action.applied",
    );
    if (actionEvent?.type === "encounter.action.applied")
      actionEvent.vitality = 1;
    expect(
      verifyGameHistory(createGame("replay-1"), altered, state).valid,
    ).toBe(false);
  });
});
