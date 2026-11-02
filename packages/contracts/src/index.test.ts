import { describe, expect, it } from "vitest";
import {
  EventEnvelopeSchema,
  GameCommandSchema,
  RealtimeEventSchema,
} from "./index.js";

describe("runtime contracts", () => {
  it("rejects unsupported gameplay actions", () => {
    expect(
      GameCommandSchema.safeParse({
        type: "encounter.act",
        playerId: "viewer",
        action: "spawn-code",
      }).success,
    ).toBe(false);
  });
  it("requires a version and sequence for realtime snapshots", () => {
    expect(
      RealtimeEventSchema.safeParse({
        type: "game.snapshot",
        version: 1,
        sequence: 2,
        state: {},
      }).success,
    ).toBe(true);
    expect(
      RealtimeEventSchema.safeParse({ type: "game.snapshot", state: {} })
        .success,
    ).toBe(false);
  });
  it("validates versioned event envelopes", () => {
    expect(
      EventEnvelopeSchema.safeParse({
        id: "e1",
        type: "quest.launched",
        version: 1,
        occurredAt: "2026-11-02T00:00:00.000Z",
        aggregateId: "guild-1",
        correlationId: "request-1",
        payload: {},
      }).success,
    ).toBe(true);
  });
});
