import type { GameCommand } from "@sidequest/contracts";

export type Role = "scout" | "healer" | "strategist" | "saboteur";
export type Player = { id: string; role: Role; contribution: number };
export type GameState = {
  questId: string;
  status: "ready" | "active" | "won" | "lost";
  encounterVitality: number;
  players: Record<string, Player>;
  actions: number;
  objectiveProgress: number;
  sequence: number;
};
export type DomainEvent = {
  type: string;
  payload: Record<string, unknown>;
  sequence: number;
};
export const createGame = (questId: string): GameState => ({
  questId,
  status: "ready",
  encounterVitality: 68,
  players: {},
  actions: 0,
  objectiveProgress: 1,
  sequence: 0,
});
export function applyCommand(
  state: GameState,
  command: GameCommand,
): { state: GameState; events: DomainEvent[] } {
  const next: GameState = structuredClone(state);
  const events: DomainEvent[] = [];
  const emit = (type: string, payload: Record<string, unknown>) => {
    next.sequence++;
    events.push({ type, payload, sequence: next.sequence });
  };
  if (command.type === "quest.launch") {
    if (next.status === "active") throw new Error("Quest is already active");
    next.questId = command.questId;
    next.status = "active";
    next.encounterVitality = 68;
    next.actions = 0;
    next.objectiveProgress = 1;
    next.players = {};
    emit("quest.launched", { questId: command.questId });
  } else if (command.type === "player.join") {
    if (next.status !== "active")
      throw new Error("Join is only available during an active quest");
    if (
      !next.players[command.playerId] &&
      Object.keys(next.players).length >= 24
    )
      throw new Error("Party is full");
    next.players[command.playerId] ??= {
      id: command.playerId,
      role: command.role,
      contribution: 0,
    };
    emit("player.joined", { playerId: command.playerId, role: command.role });
  } else if (command.type === "encounter.act") {
    if (next.status !== "active")
      throw new Error("Actions require an active quest");
    const player = next.players[command.playerId];
    if (!player) throw new Error("Join the party before acting");
    if (player.contribution >= 10)
      throw new Error("Contribution cap reached for this quest");
    const requiredRole =
      command.action === "heal"
        ? "healer"
        : command.action === "scout"
          ? "scout"
          : command.action === "vote"
            ? "strategist"
            : command.action === "sabotage"
              ? "saboteur"
              : undefined;
    if (requiredRole && player.role !== requiredRole)
      throw new Error(`${command.action} requires the ${requiredRole} role`);
    if (command.action === "attack")
      next.encounterVitality = Math.max(0, next.encounterVitality - 6);
    if (command.action === "sabotage")
      next.encounterVitality = Math.max(0, next.encounterVitality - 7);
    if (command.action === "heal")
      next.encounterVitality = Math.min(100, next.encounterVitality + 4);
    if (command.action === "scout")
      next.objectiveProgress = Math.min(3, next.objectiveProgress + 1);
    player.contribution++;
    next.actions++;
    emit("encounter.action.applied", {
      playerId: player.id,
      role: player.role,
      action: command.action,
      vitality: next.encounterVitality,
      objectiveProgress: next.objectiveProgress,
    });
  } else if (command.type === "encounter.resolve") {
    if (next.status !== "active") throw new Error("No active quest to resolve");
    const score =
      next.actions * 2 +
      Object.keys(next.players).length +
      next.objectiveProgress * 4;
    next.status = score >= 20 ? "won" : "lost";
    emit("quest.resolved", { outcome: next.status, score });
  }
  return { state: next, events };
}
