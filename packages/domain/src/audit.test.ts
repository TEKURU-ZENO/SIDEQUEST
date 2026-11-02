import { describe, expect, it } from "vitest";
import {
  applyCommand,
  createGame,
  type DomainCommand,
  type GameState,
} from "./index.js";

const command = (input: DomainCommand) => input;
const launched = (id = "ember-vault") =>
  applyCommand(createGame(id), command({ type: "quest.launch", questId: id }));
const joined = (
  role: "scout" | "healer" | "strategist" | "saboteur" = "scout",
) => {
  const start = launched();
  return applyCommand(
    start.state,
    command({ type: "player.join", playerId: "viewer-1", role }),
  );
};

describe("Phase 0.1 domain acceptance probes", () => {
  it("makes duplicate joins idempotent and emits no second join event", () => {
    const first = joined();
    const second = applyCommand(
      first.state,
      command({ type: "player.join", playerId: "viewer-1", role: "scout" }),
    );
    expect(second.events).toEqual([]);
    expect(second.state).toEqual(first.state);
  });

  it("rejects an action that the player's role cannot perform without mutation", () => {
    const start = joined("scout").state;
    expect(() =>
      applyCommand(
        start,
        command({
          type: "encounter.act",
          playerId: "viewer-1",
          action: "heal",
        }),
      ),
    ).toThrow("heal requires the healer role");
    expect(start.encounterVitality).toBe(68);
    expect(start.actions).toBe(0);
  });

  it("rejects duplicate resolution and relaunch of a completed quest", () => {
    const start = launched();
    const resolved = applyCommand(
      start.state,
      command({ type: "encounter.resolve" }),
    );
    expect(() =>
      applyCommand(resolved.state, command({ type: "encounter.resolve" })),
    ).toThrow("No active quest to resolve");
    expect(() =>
      applyCommand(
        resolved.state,
        command({ type: "quest.launch", questId: "ember-vault" }),
      ),
    ).toThrow("Quest has already been completed");
  });

  it("tracks contribution by action type as well as limiting repeated actions", () => {
    let state = joined().state;
    for (let index = 0; index < 10; index++) {
      state = applyCommand(
        state,
        command({
          type: "encounter.act",
          playerId: "viewer-1",
          action: "attack",
        }),
      ).state;
    }
    const player = state.players["viewer-1"] as
      | ((typeof state.players)[string] & {
          contributions?: Record<string, number>;
        })
      | undefined;
    expect(player?.contributions?.attack).toBe(10);
    expect(() =>
      applyCommand(
        state,
        command({
          type: "encounter.act",
          playerId: "viewer-1",
          action: "attack",
        }),
      ),
    ).toThrow("Contribution cap reached for attack");
  });

  it("rejects invalid vitality in a state snapshot", () => {
    const base = joined().state;
    const over = { ...base, encounterVitality: 101 } as GameState;
    expect(() =>
      applyCommand(
        over,
        command({
          type: "encounter.act",
          playerId: "viewer-1",
          action: "attack",
        }),
      ),
    ).toThrow("Invalid encounter vitality");
    const under = { ...base, encounterVitality: -1 } as GameState;
    expect(() =>
      applyCommand(under, command({ type: "encounter.resolve" })),
    ).toThrow("Invalid encounter vitality");
  });

  it("stores votes and updates a voter's previous choice", () => {
    const start = joined("strategist").state;
    const first = applyCommand(
      start,
      command({
        type: "encounter.act",
        playerId: "viewer-1",
        action: "vote",
        target: "forest",
      }),
    );
    const second = applyCommand(
      first.state,
      command({
        type: "encounter.act",
        playerId: "viewer-1",
        action: "vote",
        target: "river",
      }),
    );
    expect(
      (second.state as GameState & { votes?: Record<string, string> }).votes?.[
        "viewer-1"
      ],
    ).toBe("river");
    expect(second.events[0]?.type).toBe("encounter.vote.cast");
  });

  it("uses an ordered event union and advances sequence once per event", () => {
    const start = launched();
    const join = applyCommand(
      start.state,
      command({ type: "player.join", playerId: "viewer-1", role: "scout" }),
    );
    const action = applyCommand(
      join.state,
      command({
        type: "encounter.act",
        playerId: "viewer-1",
        action: "attack",
      }),
    );
    expect([
      start.events[0]?.sequence,
      join.events[0]?.sequence,
      action.events[0]?.sequence,
    ]).toEqual([1, 2, 3]);
    expect(action.state.sequence).toBe(3);
    expect(action.events[0]?.type).toBe("encounter.action.applied");
  });

  it("replays the same accepted command sequence deterministically", () => {
    const commands = [
      command({ type: "quest.launch", questId: "ember-vault" }),
      command({ type: "player.join", playerId: "viewer-1", role: "scout" }),
      command({
        type: "encounter.act",
        playerId: "viewer-1",
        action: "attack",
      }),
      command({ type: "encounter.resolve" }),
    ];
    const replay = () =>
      commands.reduce(
        (state, next) => applyCommand(state, next).state,
        createGame("ember-vault"),
      );
    expect(replay()).toEqual(replay());
  });

  it("does not mutate the caller's state when a command is rejected", () => {
    const original = joined("scout").state;
    const before = structuredClone(original);
    expect(() =>
      applyCommand(
        original,
        command({
          type: "encounter.act",
          playerId: "viewer-1",
          action: "heal",
        }),
      ),
    ).toThrow();
    expect(original).toEqual(before);
  });
});
