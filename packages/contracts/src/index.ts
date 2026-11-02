import { z } from "zod";

export const IdSchema = z.string().min(1).brand<"Id">();
export type Id = z.infer<typeof IdSchema>;
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
  z.object({ type: z.literal("quest.launch"), questId: IdSchema }),
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
]);
