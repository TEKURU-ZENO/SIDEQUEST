import { z } from "zod";
import type { GameState } from "@sidequest/domain";

export const QuestProposalSchema = z.object({
  title: z.string().min(3).max(80),
  premise: z.string().min(20).max(400),
  objectives: z.array(z.string().min(3).max(100)).min(2).max(4),
  difficulty: z.enum(["easy", "moderate", "hard"]),
  rewardXp: z.number().int().min(0).max(500),
  narrativeHook: z.string().min(10).max(240),
});
export type QuestProposal = z.infer<typeof QuestProposalSchema>;
export type QuestContext = {
  previousOutcome: "won" | "lost" | null;
  recentHistory: string[];
  guildLevel: number;
};
export interface QuestGenerator {
  propose(context: QuestContext): Promise<QuestProposal>;
}
export const authoredFallback: QuestProposal = {
  title: "The Ember Vault",
  premise:
    "A sealed archive stirs beneath the old city as the Ash Warden wakes.",
  objectives: [
    "Gather ember seals",
    "Hold the eastern passage",
    "Defeat the Ash Warden",
  ],
  difficulty: "moderate",
  rewardXp: 240,
  narrativeHook: "The guild's old choices echo through the vault.",
};
export function summarizeWorld(state: GameState): QuestContext {
  return {
    previousOutcome:
      state.status === "won" || state.status === "lost" ? state.status : null,
    recentHistory: [
      `${Object.keys(state.players).length} players joined`,
      `${state.actions} actions applied`,
    ],
    guildLevel: 1,
  };
}
