import { z } from "zod";

export const IdSchema = z.string().min(1).brand<"Id">();
export type Id = z.infer<typeof IdSchema>;

/** Backend-only OAuth material. Never include this record in an API response. */
export interface TwitchConnectionRecord {
  guildId: string;
  broadcasterId: string;
  login: string;
  displayName: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  scopes: string[];
}
export const EventEnvelopeSchema = z.object({
  id: IdSchema,
  type: z.string().min(1),
  version: z.literal(1),
  occurredAt: z.string().datetime(),
  aggregateId: IdSchema,
  correlationId: IdSchema,
  payload: z.record(z.string(), z.unknown()),
});
export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;
export const GameCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("quest.launch"),
    questId: IdSchema,
    questContent: z
      .object({
        title: z.string().trim().min(3).max(80),
        premise: z.string().trim().min(20).max(400),
        objectives: z.array(z.string().trim().min(3).max(100)).min(2).max(4),
        difficulty: z.enum(["easy", "moderate", "hard"]),
        rewardXp: z.number().int().min(0).max(500),
        narrativeHook: z.string().trim().min(10).max(240),
      })
      .optional(),
  }),
  z.object({
    type: z.literal("player.join"),
    playerId: IdSchema,
    role: z.enum(["scout", "healer", "strategist", "saboteur"]),
  }),
  z.object({
    type: z.literal("encounter.act"),
    playerId: IdSchema,
    action: z.enum(["attack", "heal", "scout", "vote", "sabotage"]),
    target: z.string().max(80).optional(),
  }),
  z.object({ type: z.literal("encounter.resolve") }),
]);
export type GameCommand = z.infer<typeof GameCommandSchema>;
const NonEmptyTextSchema = z.string().trim().min(1).max(160);
export const WorldCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("world.member.join"),
    memberId: IdSchema,
    displayName: z.string().trim().min(1).max(40),
  }),
  z.object({
    type: z.literal("world.adventure.start"),
    adventureId: IdSchema,
    title: NonEmptyTextSchema,
  }),
  z.object({
    type: z.literal("world.adventure.complete"),
    outcome: z.enum(["won", "lost"]),
  }),
  z.object({
    type: z.literal("world.chapter.record"),
    chapterId: IdSchema,
    title: NonEmptyTextSchema,
    outcome: z.enum(["won", "lost"]),
    consequence: NonEmptyTextSchema,
  }),
  z.object({
    type: z.literal("world.decision.record"),
    decisionId: IdSchema,
    prompt: NonEmptyTextSchema,
    choice: NonEmptyTextSchema,
    decidedBy: IdSchema,
  }),
  z.object({
    type: z.literal("world.reputation.change"),
    memberId: IdSchema,
    delta: z
      .number()
      .int()
      .refine((value) => value !== 0),
    reason: NonEmptyTextSchema,
  }),
  z.object({
    type: z.literal("world.achievement.unlock"),
    memberId: IdSchema,
    achievementId: IdSchema,
  }),
  z.object({
    type: z.literal("world.artifact.create"),
    artifactId: IdSchema,
    name: NonEmptyTextSchema,
    description: NonEmptyTextSchema,
    ownerId: IdSchema,
  }),
  z.object({
    type: z.literal("world.relationship.change"),
    memberA: IdSchema,
    memberB: IdSchema,
    delta: z
      .number()
      .int()
      .refine((value) => value !== 0),
  }),
]);
export type WorldCommandContract = z.infer<typeof WorldCommandSchema>;
export const ApiSuccessSchema = <T extends z.ZodType>(data: T) =>
  z.object({ ok: z.literal(true), data, requestId: z.string() });
export const ApiErrorSchema = z.object({
  ok: z.literal(false),
  error: z.object({ code: z.string(), message: z.string() }),
  requestId: z.string(),
});
export const RealtimeEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("game.snapshot"),
    version: z.literal(1),
    sequence: z.number().int().nonnegative(),
    state: z.unknown(),
  }),
  z.object({
    type: z.literal("game.command"),
    version: z.literal(1),
    command: GameCommandSchema,
  }),
  z.object({
    type: z.literal("world.snapshot"),
    version: z.literal(1),
    sequence: z.number().int().nonnegative(),
    state: z.unknown(),
  }),
]);
