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
  partyVitality: number;
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
      partyVitality: number;
      objectiveProgress: number;
      target?: string;
    }
  | {
      type: "encounter.vote.cast";
      sequence: number;
      playerId: string;
      target: string;
    }
  | {
      type: "encounter.resolved";
      sequence: number;
      questId: string;
      outcome: "won" | "lost";
      questContent?: QuestContent;
      encounterVitality: number;
      partyVitality: number;
    };
export interface CommandResult {
  state: GameState;
  events: DomainEvent[];
}

const budgets: Record<ActionType, number> = {
  attack: 10,
  heal: 5,
  scout: 4,
  vote: 1,
  sabotage: 5,
};
export const MAX_ENCOUNTER_ACTIONS = 20;
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
    partyVitality: 100,
    objectiveProgress: 0,
    players: {},
    actions: 0,
    sequence: 0,
    completedQuestIds: [],
    votes: {},
  };
}
function validate(state: GameState): void {
  if (!state.questId.trim()) throw new Error("Invalid quest id");
  if (!["ready", "active", "won", "lost"].includes(state.status))
    throw new Error("Invalid game status");
  if (
    !Number.isInteger(state.encounterVitality) ||
    state.encounterVitality < 0 ||
    state.encounterVitality > 100
  )
    throw new Error("Invalid encounter vitality");
  if (
    !Number.isInteger(state.partyVitality) ||
    state.partyVitality < 0 ||
    state.partyVitality > 100
  )
    throw new Error("Invalid party vitality");
  if (
    !Number.isSafeInteger(state.actions) ||
    state.actions < 0 ||
    !Number.isSafeInteger(state.sequence) ||
    state.sequence < 0 ||
    state.actions > MAX_ENCOUNTER_ACTIONS
  )
    throw new Error("Invalid game counters");
  if (!state.players || typeof state.players !== "object")
    throw new Error("Invalid player map");
  for (const [playerId, player] of Object.entries(state.players)) {
    if (
      player.id !== playerId ||
      !["scout", "healer", "strategist", "saboteur"].includes(player.role) ||
      !player.contributions ||
      typeof player.contributions !== "object"
    )
      throw new Error("Invalid player record");
    for (const [action, count] of Object.entries(player.contributions)) {
      if (
        !(action in budgets) ||
        !Number.isInteger(count) ||
        count! < 0 ||
        count! > budgets[action as ActionType]
      )
        throw new Error(`Invalid ${action} contribution`);
    }
  }
  if (
    !Number.isInteger(state.objectiveProgress) ||
    state.objectiveProgress < 0 ||
    state.objectiveProgress > (state.questContent?.objectives.length ?? 3)
  )
    throw new Error("Invalid objective progress");
  for (const [playerId, target] of Object.entries(state.votes)) {
    if (
      state.players[playerId]?.role !== "strategist" ||
      !["assault", "retreat"].includes(target)
    )
      throw new Error("Invalid strategy vote");
  }
  if (
    !Array.isArray(state.completedQuestIds) ||
    state.completedQuestIds.some(
      (id) => typeof id !== "string" || !id.trim(),
    ) ||
    new Set(state.completedQuestIds).size !== state.completedQuestIds.length
  )
    throw new Error("Invalid completed quest history");
  if (state.questContent) {
    const content = state.questContent;
    if (
      content.title.trim().length < 3 ||
      content.title.length > 80 ||
      content.premise.trim().length < 20 ||
      content.premise.length > 400 ||
      content.objectives.length < 2 ||
      content.objectives.length > 4 ||
      content.objectives.some(
        (objective) => objective.trim().length < 3 || objective.length > 100,
      ) ||
      !["easy", "moderate", "hard"].includes(content.difficulty) ||
      !Number.isInteger(content.rewardXp) ||
      content.rewardXp < 0 ||
      content.rewardXp > 500 ||
      content.narrativeHook.trim().length < 10 ||
      content.narrativeHook.length > 240
    )
      throw new Error("Invalid quest display content");
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
    state.encounterVitality = 68;
    state.partyVitality = 100;
    state.objectiveProgress = 0;
    state.actions = 0;
    state.votes = {};
    for (const player of Object.values(state.players))
      player.contributions = {};
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
    if (state.actions >= MAX_ENCOUNTER_ACTIONS)
      throw new Error("Encounter action limit reached");
    if (state.partyVitality === 0) throw new Error("The party is exhausted");
    if (
      command.action === "vote" &&
      !["assault", "retreat"].includes(command.target!)
    )
      throw new Error("Choose the assault or retreat strategy");
    player.contributions[command.action] =
      command.action === "vote" ? 1 : count + 1;
    state.actions += 1;
    if (command.action === "attack") {
      state.encounterVitality = Math.max(0, state.encounterVitality - 8);
      state.partyVitality = Math.max(0, state.partyVitality - 2);
    } else if (command.action === "heal") {
      state.partyVitality = Math.min(100, state.partyVitality + 25);
    } else if (command.action === "scout") {
      state.objectiveProgress = Math.min(
        state.questContent?.objectives.length ?? 3,
        state.objectiveProgress + 1,
      );
      state.encounterVitality = Math.max(0, state.encounterVitality - 4);
      state.partyVitality = Math.max(0, state.partyVitality - 2);
    } else if (command.action === "sabotage") {
      state.encounterVitality = Math.max(0, state.encounterVitality - 12);
      state.partyVitality = Math.max(0, state.partyVitality - 12);
    }
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
          partyVitality: state.partyVitality,
          objectiveProgress: state.objectiveProgress,
        }),
      );
  } else {
    if (state.status !== "active")
      throw new Error("No active quest to resolve");
    const tally = getVoteTally(state);
    if ((tally.assault ?? 0) > (tally.retreat ?? 0))
      state.encounterVitality = Math.max(0, state.encounterVitality - 12);
    state.status =
      state.encounterVitality <= 0 &&
      state.partyVitality > 0 &&
      (tally.retreat ?? 0) <= (tally.assault ?? 0)
        ? "won"
        : "lost";
    state.completedQuestIds.push(state.questId);
    events.push(
      event(state, {
        type: "encounter.resolved",
        questId: state.questId,
        outcome: state.status,
        ...(state.questContent
          ? { questContent: structuredClone(state.questContent) }
          : {}),
        encounterVitality: state.encounterVitality,
        partyVitality: state.partyVitality,
      }),
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

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableValue(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

/** Reconstructs authoritative game state by replaying its ordered domain facts. */
export function replayGameEvents(
  initial: GameState,
  events: readonly DomainEvent[],
): GameState {
  let state = structuredClone(initial);
  for (const recorded of events) {
    let command: DomainCommand;
    switch (recorded.type) {
      case "quest.started":
        command = {
          type: "quest.launch",
          questId: recorded.questId,
          ...(recorded.questContent
            ? { questContent: recorded.questContent }
            : {}),
        };
        break;
      case "player.joined":
        command = {
          type: "player.join",
          playerId: recorded.playerId,
          role: recorded.role,
        };
        break;
      case "encounter.action.applied":
        command = {
          type: "encounter.act",
          playerId: recorded.playerId,
          action: recorded.action,
          ...(recorded.target ? { target: recorded.target } : {}),
        };
        break;
      case "encounter.vote.cast":
        command = {
          type: "encounter.act",
          playerId: recorded.playerId,
          action: "vote",
          target: recorded.target,
        };
        break;
      case "encounter.resolved":
        command = { type: "encounter.resolve" };
        break;
    }
    const result = applyCommand(state, command);
    if (
      result.events.length !== 1 ||
      stableValue(result.events[0]) !== stableValue(recorded)
    )
      throw new Error(
        `Game event ${recorded.sequence} does not match deterministic replay`,
      );
    state = result.state;
  }
  return state;
}

export function verifyGameHistory(
  initial: GameState,
  events: readonly DomainEvent[],
  expected: GameState,
): { valid: true; state: GameState } | { valid: false; reason: string } {
  try {
    const replayed = replayGameEvents(initial, events);
    if (stableValue(replayed) !== stableValue(expected))
      return {
        valid: false,
        reason: "Game snapshot does not match replayed history",
      };
    return { valid: true, state: replayed };
  } catch (error) {
    return {
      valid: false,
      reason:
        error instanceof Error ? error.message : "Game history is invalid",
    };
  }
}

export * from "./world.js";
