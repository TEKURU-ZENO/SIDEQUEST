import { z } from "zod";
import { IdSchema } from "@sidequest/contracts";
import type { GameCommand } from "@sidequest/contracts";

const TwitchChatEventSchema = z.object({
  message_id: z.string().min(1),
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
  if (verb === "!join")
    return {
      eventId: parsed.data.message_id,
      channelId: parsed.data.broadcaster_user_id,
      playerId,
      displayName: parsed.data.chatter_user_name,
      command: { type: "player.join", playerId, role: "scout" },
    };
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
