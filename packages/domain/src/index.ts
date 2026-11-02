export type PlayerRole = "scout" | "healer" | "strategist" | "saboteur";
export type ActionType = "attack" | "heal" | "scout" | "vote" | "sabotage";
export interface QuestContent {
  title: string;
  premise: string;
  objectives: string[];
  difficulty: "easy" | "moderate" | "hard";
  rewardXp: number;
  narrativeHook: string;
}
export type DomainCommand =
  | { type: "quest.launch"; questId: string; questContent?: QuestContent }
  | { type: "player.join"; playerId: string; role: PlayerRole }
  | {
      type: "encounter.act";
      playerId: string;
      action: ActionType;
      target?: string | undefined;
    }
  | { type: "encounter.resolve" };

export interface PlayerState {
  id: string;
  role: PlayerRole;
  contributions: Partial<Record<ActionType, number>>;
}
export interface GameState {
  questId: string;
  questContent?: QuestContent;
  status: "ready" | "active" | "won" | "lost";
  encounterVitality: number;
  objectiveProgress: number;
  players: Record<string, PlayerState>;
  actions: number;
  sequence: number;
  completedQuestIds: string[];
  votes: Record<string, string>;
}
export type DomainEvent =
  | {
      type: "quest.started";
      sequence: number;
      questId: string;
      questContent?: QuestContent;
    }
  | {
      type: "player.joined";
      sequence: number;
      playerId: string;
      role: PlayerRole;
    }
  | {
      type: "encounter.action.applied";
      sequence: number;
      playerId: string;
      action: ActionType;
      vitality: number;
      target?: string;
    }
  | {
      type: "encounter.vote.cast";
      sequence: number;
      playerId: string;
      target: string;
    }
  | { type: "encounter.resolved"; sequence: number; outcome: "won" | "lost" };
export interface CommandResult {
  state: GameState;
  events: DomainEvent[];
}

const budgets: Record<ActionType, number> = {
  attack: 10,
  heal: 5,
  scout: 2,
  vote: 1,
  sabotage: 5,
};
const requiredRole: Record<ActionType, PlayerRole> = {
  attack: "scout",
  heal: "healer",
  scout: "scout",
  vote: "strategist",
  sabotage: "saboteur",
};
export function createGame(questId: string): GameState {
  return {
    questId,
    status: "ready",
    encounterVitality: 68,
    objectiveProgress: 0,
    players: {},
    actions: 0,
    sequence: 0,
    completedQuestIds: [],
    votes: {},
  };
}
function validate(state: GameState): void {
  if (
    !Number.isInteger(state.encounterVitality) ||
    state.encounterVitality < 0 ||
    state.encounterVitality > 100
  )
    throw new Error("Invalid encounter vitality");
  if (
    !Number.isInteger(state.actions) ||
    state.actions < 0 ||
    !Number.isInteger(state.sequence) ||
    state.sequence < 0
  )
    throw new Error("Invalid game counters");
  for (const player of Object.values(state.players))
    for (const [action, count] of Object.entries(player.contributions)) {
      if (
        !Number.isInteger(count) ||
        count! < 0 ||
        count! > budgets[action as ActionType]
      )
        throw new Error(`Invalid ${action} contribution`);
    }
}
type EventPayload = DomainEvent extends infer E
  ? E extends DomainEvent
    ? Omit<E, "sequence">
    : never
  : never;
function event<T extends EventPayload>(
  state: GameState,
  payload: T,
): Extract<DomainEvent, { type: T["type"] }> {
  state.sequence += 1;
  return { ...payload, sequence: state.sequence } as unknown as Extract<
    DomainEvent,
    { type: T["type"] }
  >;
}
export function applyCommand(
  input: GameState,
  command: DomainCommand,
): CommandResult {
  validate(input);
  const state = structuredClone(input);
  const events: DomainEvent[] = [];
  if (command.type === "quest.launch") {
    if (state.status === "active") throw new Error("A quest is already active");
    if (state.completedQuestIds.includes(command.questId))
      throw new Error("Quest has already been completed");
    state.questId = command.questId;
    if (command.questContent)
      state.questContent = structuredClone(command.questContent);
    else delete state.questContent;
    state.status = "active";
    events.push(
      event(state, {
        type: "quest.started",
        questId: command.questId,
        ...(command.questContent
          ? { questContent: structuredClone(command.questContent) }
          : {}),
      }),
    );
  } else if (command.type === "player.join") {
    if (state.status !== "active")
      throw new Error("Players can only join an active quest");
    if (state.players[command.playerId]) return { state, events };
    state.players[command.playerId] = {
      id: command.playerId,
      role: command.role,
      contributions: {},
    };
    events.push(
      event(state, {
        type: "player.joined",
        playerId: command.playerId,
        role: command.role,
      }),
    );
  } else if (command.type === "encounter.act") {
    if (state.status !== "active")
      throw new Error("Actions require an active quest");
    const player = state.players[command.playerId];
    if (!player) throw new Error("Player must join before acting");
    if (player.role !== requiredRole[command.action])
      throw new Error(
        `${command.action} requires the ${requiredRole[command.action]} role`,
      );
    const count = player.contributions[command.action] ?? 0;
    if (command.action !== "vote" && count >= budgets[command.action])
      throw new Error(`Contribution cap reached for ${command.action}`);
    if (command.action === "vote" && !command.target?.trim())
      throw new Error("Vote requires a target");
    player.contributions[command.action] =
      command.action === "vote" ? 1 : count + 1;
    state.actions += 1;
    if (command.action === "attack")
      state.encounterVitality = Math.max(0, state.encounterVitality - 6);
    if (command.action === "heal")
      state.encounterVitality = Math.min(100, state.encounterVitality + 8);
    if (command.action === "vote") {
      state.votes[command.playerId] = command.target!;
      events.push(
        event(state, {
          type: "encounter.vote.cast",
          playerId: command.playerId,
          target: command.target!,
        }),
      );
    } else
      events.push(
        event(state, {
          type: "encounter.action.applied",
          playerId: command.playerId,
          action: command.action,
          vitality: state.encounterVitality,
        }),
      );
  } else {
    if (state.status !== "active")
      throw new Error("No active quest to resolve");
    state.status = state.encounterVitality <= 0 ? "won" : "lost";
    state.completedQuestIds.push(state.questId);
    events.push(
      event(state, { type: "encounter.resolved", outcome: state.status }),
    );
  }
  validate(state);
  return { state, events };
}
export function getVoteTally(state: GameState): Record<string, number> {
  return Object.values(state.votes).reduce<Record<string, number>>(
    (tally, target) => {
      tally[target] = (tally[target] ?? 0) + 1;
      return tally;
    },
    {},
  );
}

export * from "./world.js";
