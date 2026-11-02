import { describe, expect, it } from "vitest";
import { normalizeChatEvent } from "./index.js";

const chatEvent = (text: string) => ({
  message_id: "msg-1",
  broadcaster_user_id: "channel-1",
  chatter_user_id: "viewer-1",
  chatter_user_name: "pixelpiper",
  message: { text },
});

describe("Twitch chat normalization", () => {
  it("normalizes an attack to a validated application command", () => {
    expect(normalizeChatEvent(chatEvent("!attack"))?.command).toEqual({
      type: "encounter.act",
      playerId: "viewer-1",
      action: "attack",
    });
  });

  it("ignores unrelated chat and malformed platform events", () => {
    expect(normalizeChatEvent(chatEvent("hello chat"))).toBeNull();
    expect(normalizeChatEvent({ message: { text: "!attack" } })).toBeNull();
  });
});
