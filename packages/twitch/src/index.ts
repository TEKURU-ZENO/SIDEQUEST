import { z } from "zod";
import {
  IdSchema,
  type GameCommand,
  type TwitchConnectionRecord,
} from "@sidequest/contracts";

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

const ChannelPointRedemptionSchema = z.object({
  id: z.string().min(1).max(128),
  broadcaster_user_id: z.string().min(1),
  user_id: z.string().min(1),
  user_name: z.string().min(1).max(40),
  reward: z.object({ id: z.string().uuid() }),
});
export type EncounterAction = "attack" | "heal" | "scout" | "vote" | "sabotage";
export type NormalizedChannelPointRedemption = {
  eventId: string;
  channelId: string;
  playerId: string;
  displayName: string;
  rewardId: string;
  role: "scout" | "healer" | "strategist" | "saboteur";
  command: Extract<GameCommand, { type: "encounter.act" }>;
};
const roleForAction: Record<
  EncounterAction,
  NormalizedChannelPointRedemption["role"]
> = {
  attack: "scout",
  heal: "healer",
  scout: "scout",
  vote: "strategist",
  sabotage: "saboteur",
};

/** Only explicitly mapped Twitch rewards become game actions; viewer text is ignored. */
export function normalizeChannelPointRedemption(
  input: unknown,
  rewardActions: Readonly<Record<string, EncounterAction>>,
): NormalizedChannelPointRedemption | null {
  const parsed = ChannelPointRedemptionSchema.safeParse(input);
  if (!parsed.success) return null;
  const action = rewardActions[parsed.data.reward.id];
  if (!action) return null;
  const playerId = IdSchema.parse(parsed.data.user_id);
  return {
    eventId: parsed.data.id,
    channelId: parsed.data.broadcaster_user_id,
    playerId,
    displayName: parsed.data.user_name,
    rewardId: parsed.data.reward.id,
    role: roleForAction[action],
    command: {
      type: "encounter.act",
      playerId,
      action,
      ...(action === "vote" ? { target: "assault" } : {}),
    },
  };
}

export async function updateChannelPointRedemption(input: {
  clientId: string;
  connection: TwitchConnectionRecord;
  rewardId: string;
  redemptionId: string;
  status: "FULFILLED" | "CANCELED";
  request?: typeof fetch;
}) {
  const query = new URLSearchParams({
    broadcaster_id: input.connection.broadcasterId,
    reward_id: input.rewardId,
    id: input.redemptionId,
  });
  const response = await (input.request ?? fetch)(
    `https://api.twitch.tv/helix/channel_points/custom_rewards/redemptions?${query}`,
    {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${input.connection.accessToken}`,
        "client-id": input.clientId,
        "content-type": "application/json",
      },
      body: JSON.stringify({ status: input.status }),
    },
  );
  if (!response.ok)
    throw new Error(
      `Unable to update Twitch reward redemption (${response.status})`,
    );
}

export * from "./oauth.js";
export * from "./eventsub.js";
