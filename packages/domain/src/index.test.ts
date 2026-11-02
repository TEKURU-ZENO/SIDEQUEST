import { describe, expect, it } from "vitest";
import { applyCommand, createGame } from "./index.js";
import type { DomainCommand } from "./index.js";

const command = (value: DomainCommand) => value;
describe("deterministic encounter domain", () => {
  it("launches, joins, applies actions and resolves with a repeatable outcome", () => {
    let state = createGame("ember-vault");
    state = applyCommand(
      state,
      command({ type: "quest.launch", questId: "ember-vault" }),
    ).state;
    state = applyCommand(
      state,
      command({ type: "player.join", playerId: "viewer-1", role: "scout" }),
    ).state;
    state = applyCommand(
      state,
      command({
        type: "encounter.act",
        playerId: "viewer-1",
        action: "attack",
      }),
    ).state;
    expect(state.encounterVitality).toBe(60);
    expect(
      applyCommand(state, command({ type: "encounter.resolve" })).state.status,
    ).toBe("lost");
  });
  it("rejects unjoined players and actions outside an active quest", () => {
    const state = createGame("ember-vault");
    expect(() =>
      applyCommand(
        state,
        command({
          type: "encounter.act",
          playerId: "viewer-1",
          action: "attack",
        }),
      ),
    ).toThrow("Actions require an active quest");
  });
  it("does not mutate the prior state", () => {
    const state = createGame("ember-vault");
    applyCommand(
      state,
      command({ type: "quest.launch", questId: "ember-vault" }),
    );
    expect(state.status).toBe("ready");
  });
});
