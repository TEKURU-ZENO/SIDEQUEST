import { describe, expect, it } from "vitest";
import { GameStateSchema, WorldStateSchema } from "./index.js";

const game = {
  questId: "quest-1",
  status: "active",
  encounterVitality: 68,
  partyVitality: 100,
  objectiveProgress: 0,
  players: {
    mira: { id: "mira", role: "scout", contributions: {} },
  },
  actions: 0,
  sequence: 2,
  completedQuestIds: [],
  votes: {},
};

const world = {
  id: "world-1",
  guild: { name: "Lantern Guild", reputation: 0, achievements: [] },
  members: {},
  relationships: [],
  artifacts: {},
  adventures: [],
  history: [
    {
      type: "world.member.joined",
      sequence: 1,
      memberId: "mira",
      displayName: "Mira",
    },
  ],
  sequence: 1,
};

describe("persisted aggregate snapshot contracts", () => {
  it("validates game counters, player identities and contribution budgets", () => {
    expect(GameStateSchema.safeParse(game).success).toBe(true);
    expect(
      GameStateSchema.safeParse({ ...game, partyVitality: 101 }).success,
    ).toBe(false);
    expect(
      GameStateSchema.safeParse({
        ...game,
        players: {
          wrongKey: {
            id: "mira",
            role: "scout",
            contributions: { attack: 11 },
          },
        },
      }).success,
    ).toBe(false);
    expect(
      GameStateSchema.safeParse({
        ...game,
        votes: { mira: "assault" },
      }).success,
    ).toBe(false);
  });

  it("validates world event sequence and aggregate relationships", () => {
    expect(WorldStateSchema.safeParse(world).success).toBe(true);
    expect(WorldStateSchema.safeParse({ ...world, sequence: 2 }).success).toBe(
      false,
    );
    expect(
      WorldStateSchema.safeParse({
        ...world,
        history: [{ type: "world.unknown", sequence: 1 }],
      }).success,
    ).toBe(false);
  });
});
