import { z } from "zod";
import { IdSchema } from "@sidequest/contracts";
import type { GameCommand } from "@sidequest/contracts";

const TwitchChatEventSchema = z.object({
  message_id: z.string().min(1).max(128),
  broadcaster_user_id: z.string().min(1),
  chatter_user_id: z.string().min(1),
  chatter_user_name: z.string().min(1),
  message: z.object({ text: z.string().max(500) }),
});
export type NormalizedChatAction = {
  eventId: string;
  channelId: string;
  playerId: string;
  displayName: string;
  command: GameCommand;
};
export function normalizeChatEvent(
  input: unknown,
): NormalizedChatAction | null {
  const parsed = TwitchChatEventSchema.safeParse(input);
  if (!parsed.success) return null;
  const [verb, ...args] = parsed.data.message.text
    .trim()
    .toLowerCase()
    .split(/\s+/);
  const playerId = IdSchema.parse(parsed.data.chatter_user_id);
  if (verb === "!join") {
    const role = args[0] ?? "scout";
    if (!["scout", "healer", "strategist", "saboteur"].includes(role))
      return null;
    return {
      eventId: parsed.data.message_id,
      channelId: parsed.data.broadcaster_user_id,
      playerId,
      displayName: parsed.data.chatter_user_name,
      command: {
        type: "player.join",
        playerId,
        role: role as "scout" | "healer" | "strategist" | "saboteur",
      },
    };
  }
  const action = (
    {
      "!attack": "attack",
      "!heal": "heal",
      "!scout": "scout",
      "!vote": "vote",
      "!sabotage": "sabotage",
    } as const
  )[verb as "!attack" | "!heal" | "!scout" | "!vote" | "!sabotage"];
  if (!action) return null;
  return {
    eventId: parsed.data.message_id,
    channelId: parsed.data.broadcaster_user_id,
    playerId,
    displayName: parsed.data.chatter_user_name,
    command: {
      type: "encounter.act",
      playerId,
      action,
      ...(args[0] ? { target: args[0] } : {}),
    },
  };
}

export class ChatCommandRateLimiter {
  private readonly lastAccepted = new Map<string, number>();

  constructor(private readonly cooldownMs = 1500) {}

  allow(channelId: string, playerId: string, now = Date.now()): boolean {
    const key = `${channelId}:${playerId}`;
    const previous = this.lastAccepted.get(key);
    if (previous !== undefined && now - previous < this.cooldownMs)
      return false;
    this.lastAccepted.set(key, now);
    if (this.lastAccepted.size > 10_000) {
      for (const [entry, timestamp] of this.lastAccepted)
        if (now - timestamp > this.cooldownMs * 10)
          this.lastAccepted.delete(entry);
    }
    return true;
  }
}

export * from "./oauth.js";
export * from "./eventsub.js";
