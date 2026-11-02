import { z } from "zod";

export const IdSchema = z.string().min(1).brand<"Id">();
export type Id = z.infer<typeof IdSchema>;

const PlayerRoleSchema = z.enum(["scout", "healer", "strategist", "saboteur"]);
const ActionTypeSchema = z.enum([
  "attack",
  "heal",
  "scout",
  "vote",
  "sabotage",
]);
export const QuestContentContractSchema = z.object({
  title: z.string().trim().min(3).max(80),
  premise: z.string().trim().min(20).max(400),
  objectives: z.array(z.string().trim().min(3).max(100)).min(2).max(4),
  difficulty: z.enum(["easy", "moderate", "hard"]),
  rewardXp: z.number().int().min(0).max(500),
  narrativeHook: z.string().trim().min(10).max(240),
});
const PlayerStateContractSchema = z.object({
  id: z.string().min(1).max(160),
  role: PlayerRoleSchema,
  contributions: z.partialRecord(
    ActionTypeSchema,
    z.number().int().min(0).max(10),
  ),
});
export const GameStateSchema = z
  .object({
    questId: z.string().trim().min(1).max(160),
    questContent: QuestContentContractSchema.optional(),
    status: z.enum(["ready", "active", "won", "lost"]),
    encounterVitality: z.number().int().min(0).max(100),
    partyVitality: z.number().int().min(0).max(100),
    objectiveProgress: z.number().int().min(0).max(4),
    players: z.record(z.string().min(1).max(160), PlayerStateContractSchema),
    actions: z.number().int().min(0).max(20),
    sequence: z.number().int().nonnegative(),
    completedQuestIds: z.array(z.string().min(1).max(160)),
    votes: z.record(z.string().min(1).max(160), z.enum(["assault", "retreat"])),
  })
  .superRefine((state, context) => {
    for (const [id, player] of Object.entries(state.players)) {
      if (player.id !== id)
        context.addIssue({
          code: "custom",
          path: ["players", id, "id"],
          message: "player key must match id",
        });
      for (const [action, count] of Object.entries(player.contributions)) {
        const maximum =
          action === "attack"
            ? 10
            : action === "scout"
              ? 4
              : action === "heal" || action === "sabotage"
                ? 5
                : 1;
        if (count > maximum)
          context.addIssue({
            code: "custom",
            path: ["players", id, "contributions", action],
            message: "contribution exceeds its cap",
          });
      }
    }
    for (const id of Object.keys(state.votes))
      if (state.players[id]?.role !== "strategist")
        context.addIssue({
          code: "custom",
          path: ["votes", id],
          message: "votes belong to strategists",
        });
    if (
      state.questContent &&
      state.objectiveProgress > state.questContent.objectives.length
    )
      context.addIssue({
        code: "custom",
        path: ["objectiveProgress"],
        message: "objective progress exceeds quest objectives",
      });
    if (
      new Set(state.completedQuestIds).size !== state.completedQuestIds.length
    )
      context.addIssue({
        code: "custom",
        path: ["completedQuestIds"],
        message: "quest completion IDs must be unique",
      });
  });

export const GameDomainEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("quest.started"),
    sequence: z.number().int().positive(),
    questId: z.string().min(1),
    questContent: QuestContentContractSchema.optional(),
  }),
  z.object({
    type: z.literal("player.joined"),
    sequence: z.number().int().positive(),
    playerId: z.string().min(1),
    role: PlayerRoleSchema,
  }),
  z.object({
    type: z.literal("encounter.action.applied"),
    sequence: z.number().int().positive(),
    playerId: z.string().min(1),
    action: z.enum(["attack", "heal", "scout", "sabotage"]),
    vitality: z.number().int().min(0).max(100),
    partyVitality: z.number().int().min(0).max(100),
    objectiveProgress: z.number().int().min(0).max(4),
    target: z.string().max(80).optional(),
  }),
  z.object({
    type: z.literal("encounter.vote.cast"),
    sequence: z.number().int().positive(),
    playerId: z.string().min(1),
    target: z.enum(["assault", "retreat"]),
  }),
  z.object({
    type: z.literal("encounter.resolved"),
    sequence: z.number().int().positive(),
    questId: z.string().min(1),
    outcome: z.enum(["won", "lost"]),
    questContent: QuestContentContractSchema.optional(),
    encounterVitality: z.number().int().min(0).max(100),
    partyVitality: z.number().int().min(0).max(100),
  }),
]);

const WorldChapterContractSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  outcome: z.enum(["won", "lost"]),
  consequence: z.string().min(1),
  sequence: z.number().int().positive(),
});
const WorldDecisionContractSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  choice: z.string().min(1),
  decidedBy: z.string().min(1),
  sequence: z.number().int().positive(),
});
export const WorldEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("world.member.joined"),
    sequence: z.number().int().positive(),
    memberId: z.string().min(1),
    displayName: z.string().min(1),
  }),
  z.object({
    type: z.literal("world.adventure.started"),
    sequence: z.number().int().positive(),
    adventureId: z.string().min(1),
    title: z.string().min(1),
  }),
  z.object({
    type: z.literal("world.adventure.completed"),
    sequence: z.number().int().positive(),
    adventureId: z.string().min(1),
    outcome: z.enum(["won", "lost"]),
  }),
  z.object({
    type: z.literal("world.chapter.recorded"),
    sequence: z.number().int().positive(),
    adventureId: z.string().min(1),
    chapter: WorldChapterContractSchema,
  }),
  z.object({
    type: z.literal("world.decision.recorded"),
    sequence: z.number().int().positive(),
    adventureId: z.string().min(1),
    decision: WorldDecisionContractSchema,
  }),
  z.object({
    type: z.literal("world.reputation.changed"),
    sequence: z.number().int().positive(),
    memberId: z.string().min(1),
    delta: z
      .number()
      .int()
      .refine((value) => value !== 0),
    total: z.number().int().nonnegative(),
    reason: z.string().min(1),
  }),
  z.object({
    type: z.literal("world.achievement.unlocked"),
    sequence: z.number().int().positive(),
    memberId: z.string().min(1),
    achievementId: z.string().min(1),
  }),
  z.object({
    type: z.literal("world.artifact.created"),
    sequence: z.number().int().positive(),
    artifact: z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      description: z.string().min(1),
      ownerId: z.string().min(1),
      sequence: z.number().int().positive(),
    }),
  }),
  z.object({
    type: z.literal("world.relationship.changed"),
    sequence: z.number().int().positive(),
    memberA: z.string().min(1),
    memberB: z.string().min(1),
    affinity: z.number().int().min(-100).max(100),
  }),
]);
export const WorldStateSchema = z
  .object({
    id: z.string().min(1),
    guild: z.object({
      name: z.string().min(1),
      reputation: z.number().int().nonnegative(),
      achievements: z.array(z.string()),
    }),
    members: z.record(
      z.string().min(1),
      z.object({
        id: z.string().min(1),
        displayName: z.string().min(1),
        joinedAtSequence: z.number().int().positive(),
        reputation: z.number().int().nonnegative(),
        achievements: z.array(z.string()),
        artifacts: z.array(z.string()),
      }),
    ),
    relationships: z.array(
      z.object({
        memberA: z.string().min(1),
        memberB: z.string().min(1),
        affinity: z.number().int().min(-100).max(100),
      }),
    ),
    artifacts: z.record(
      z.string().min(1),
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        description: z.string().min(1),
        ownerId: z.string().min(1),
        sequence: z.number().int().positive(),
      }),
    ),
    adventures: z.array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        status: z.enum(["active", "completed"]),
        outcome: z.enum(["won", "lost"]).nullable(),
        chapters: z.array(WorldChapterContractSchema),
        decisions: z.array(WorldDecisionContractSchema),
      }),
    ),
    history: z.array(WorldEventSchema),
    sequence: z.number().int().nonnegative(),
  })
  .superRefine((state, context) => {
    if (state.history.length !== state.sequence)
      context.addIssue({
        code: "custom",
        path: ["history"],
        message: "history length must match sequence",
      });
    for (const [index, event] of state.history.entries())
      if (event.sequence !== index + 1)
        context.addIssue({
          code: "custom",
          path: ["history", index, "sequence"],
          message: "history sequence must be contiguous",
        });
    for (const [id, member] of Object.entries(state.members))
      if (member.id !== id)
        context.addIssue({
          code: "custom",
          path: ["members", id, "id"],
          message: "member key must match id",
        });
    for (const relation of state.relationships)
      if (
        !state.members[relation.memberA] ||
        !state.members[relation.memberB] ||
        relation.memberA >= relation.memberB
      )
        context.addIssue({
          code: "custom",
          path: ["relationships"],
          message: "relationship endpoints are invalid",
        });
    if (
      state.adventures.filter((adventure) => adventure.status === "active")
        .length > 1
    )
      context.addIssue({
        code: "custom",
        path: ["adventures"],
        message: "only one adventure may be active",
      });
    for (const [id, artifact] of Object.entries(state.artifacts))
      if (artifact.id !== id || !state.members[artifact.ownerId])
        context.addIssue({
          code: "custom",
          path: ["artifacts", id],
          message: "artifact identity or owner is invalid",
        });
  });

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
