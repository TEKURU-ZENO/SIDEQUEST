export interface WorldMember {
  id: string;
  displayName: string;
  joinedAtSequence: number;
  reputation: number;
  achievements: string[];
  artifacts: string[];
}

export interface WorldChapter {
  id: string;
  title: string;
  outcome: "won" | "lost";
  consequence: string;
  sequence: number;
}

export interface WorldDecision {
  id: string;
  prompt: string;
  choice: string;
  decidedBy: string;
  sequence: number;
}

export interface WorldRelationship {
  memberA: string;
  memberB: string;
  affinity: number;
}

export interface WorldArtifact {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  sequence: number;
}

export interface WorldAdventure {
  id: string;
  title: string;
  status: "active" | "completed";
  outcome: "won" | "lost" | null;
  chapters: WorldChapter[];
  decisions: WorldDecision[];
}

export interface WorldState {
  id: string;
  guild: { name: string; reputation: number; achievements: string[] };
  members: Record<string, WorldMember>;
  relationships: WorldRelationship[];
  artifacts: Record<string, WorldArtifact>;
  adventures: WorldAdventure[];
  history: WorldEvent[];
  sequence: number;
}

export type WorldCommand =
  | { type: "world.member.join"; memberId: string; displayName: string }
  | { type: "world.adventure.start"; adventureId: string; title: string }
  | { type: "world.adventure.complete"; outcome: "won" | "lost" }
  | {
      type: "world.chapter.record";
      chapterId: string;
      title: string;
      outcome: "won" | "lost";
      consequence: string;
    }
  | {
      type: "world.decision.record";
      decisionId: string;
      prompt: string;
      choice: string;
      decidedBy: string;
    }
  | {
      type: "world.reputation.change";
      memberId: string;
      delta: number;
      reason: string;
    }
  | {
      type: "world.achievement.unlock";
      memberId: string;
      achievementId: string;
    }
  | {
      type: "world.artifact.create";
      artifactId: string;
      name: string;
      description: string;
      ownerId: string;
    }
  | {
      type: "world.relationship.change";
      memberA: string;
      memberB: string;
      delta: number;
    };

export type WorldEvent =
  | {
      type: "world.member.joined";
      sequence: number;
      memberId: string;
      displayName: string;
    }
  | {
      type: "world.adventure.started";
      sequence: number;
      adventureId: string;
      title: string;
    }
  | {
      type: "world.adventure.completed";
      sequence: number;
      adventureId: string;
      outcome: "won" | "lost";
    }
  | {
      type: "world.chapter.recorded";
      sequence: number;
      adventureId: string;
      chapter: WorldChapter;
    }
  | {
      type: "world.decision.recorded";
      sequence: number;
      adventureId: string;
      decision: WorldDecision;
    }
  | {
      type: "world.reputation.changed";
      sequence: number;
      memberId: string;
      delta: number;
      total: number;
      reason: string;
    }
  | {
      type: "world.achievement.unlocked";
      sequence: number;
      memberId: string;
      achievementId: string;
    }
  | {
      type: "world.artifact.created";
      sequence: number;
      artifact: WorldArtifact;
    }
  | {
      type: "world.relationship.changed";
      sequence: number;
      memberA: string;
      memberB: string;
      affinity: number;
    };

export interface WorldCommandResult {
  state: WorldState;
  events: WorldEvent[];
}

export function createWorld(id: string, name: string): WorldState {
  requireText(id, "World id");
  requireText(name, "Guild name");
  return {
    id,
    guild: { name, reputation: 0, achievements: [] },
    members: {},
    relationships: [],
    artifacts: {},
    adventures: [],
    history: [],
    sequence: 0,
  };
}

function requireText(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} must not be empty`);
}

function activeAdventure(state: WorldState): WorldAdventure {
  const adventure = state.adventures.at(-1);
  if (!adventure || adventure.status !== "active")
    throw new Error("An active adventure is required");
  return adventure;
}

type WorldEventPayload = WorldEvent extends infer E
  ? E extends WorldEvent
    ? Omit<E, "sequence">
    : never
  : never;

function append<T extends WorldEventPayload>(
  state: WorldState,
  event: T,
): Extract<WorldEvent, { type: T["type"] }> {
  state.sequence += 1;
  const recorded = { ...event, sequence: state.sequence } as unknown as Extract<
    WorldEvent,
    { type: T["type"] }
  >;
  state.history.push(recorded);
  return recorded;
}

export function applyWorldCommand(
  input: WorldState,
  command: WorldCommand,
): WorldCommandResult {
  const state = structuredClone(input);
  const events: WorldEvent[] = [];
  switch (command.type) {
    case "world.member.join": {
      requireText(command.memberId, "Member id");
      requireText(command.displayName, "Display name");
      if (state.members[command.memberId]) return { state, events };
      const recorded = append(state, {
        type: "world.member.joined",
        memberId: command.memberId,
        displayName: command.displayName,
      });
      state.members[command.memberId] = {
        id: command.memberId,
        displayName: command.displayName,
        joinedAtSequence: recorded.sequence,
        reputation: 0,
        achievements: [],
        artifacts: [],
      };
      events.push(recorded);
      break;
    }
    case "world.adventure.start": {
      requireText(command.adventureId, "Adventure id");
      requireText(command.title, "Adventure title");
      if (
        state.adventures.some(
          (adventure) => adventure.id === command.adventureId,
        )
      )
        throw new Error("Adventure id has already been used");
      if (state.adventures.some((adventure) => adventure.status === "active"))
        throw new Error("An adventure is already active");
      const recorded = append(state, {
        type: "world.adventure.started",
        adventureId: command.adventureId,
        title: command.title,
      });
      state.adventures.push({
        id: command.adventureId,
        title: command.title,
        status: "active",
        outcome: null,
        chapters: [],
        decisions: [],
      });
      events.push(recorded);
      break;
    }
    case "world.adventure.complete": {
      const adventure = activeAdventure(state);
      adventure.status = "completed";
      adventure.outcome = command.outcome;
      events.push(
        append(state, {
          type: "world.adventure.completed",
          adventureId: adventure.id,
          outcome: command.outcome,
        }),
      );
      break;
    }
    case "world.chapter.record": {
      const adventure = activeAdventure(state);
      requireText(command.chapterId, "Chapter id");
      requireText(command.title, "Chapter title");
      requireText(command.consequence, "Chapter consequence");
      if (
        adventure.chapters.some((chapter) => chapter.id === command.chapterId)
      )
        throw new Error("Chapter id has already been used");
      const sequence = state.sequence + 1;
      const chapter: WorldChapter = {
        id: command.chapterId,
        title: command.title,
        outcome: command.outcome,
        consequence: command.consequence,
        sequence,
      };
      events.push(
        append(state, {
          type: "world.chapter.recorded",
          adventureId: adventure.id,
          chapter,
        }),
      );
      adventure.chapters.push(chapter);
      break;
    }
    case "world.decision.record": {
      const adventure = activeAdventure(state);
      if (!state.members[command.decidedBy])
        throw new Error("Decision maker must be a world member");
      requireText(command.decisionId, "Decision id");
      requireText(command.prompt, "Decision prompt");
      requireText(command.choice, "Decision choice");
      if (
        adventure.decisions.some(
          (decision) => decision.id === command.decisionId,
        )
      )
        throw new Error("Decision id has already been used");
      const sequence = state.sequence + 1;
      const decision: WorldDecision = {
        id: command.decisionId,
        prompt: command.prompt,
        choice: command.choice,
        decidedBy: command.decidedBy,
        sequence,
      };
      events.push(
        append(state, {
          type: "world.decision.recorded",
          adventureId: adventure.id,
          decision,
        }),
      );
      adventure.decisions.push(decision);
      break;
    }
    case "world.reputation.change": {
      const member = state.members[command.memberId];
      if (!member)
        throw new Error("Reputation can only change for a world member");
      if (!Number.isSafeInteger(command.delta) || command.delta === 0)
        throw new Error("Reputation delta must be a nonzero integer");
      requireText(command.reason, "Reputation reason");
      const next = member.reputation + command.delta;
      if (!Number.isSafeInteger(next) || next < 0)
        throw new Error("Reputation cannot be negative");
      member.reputation = next;
      state.guild.reputation += command.delta;
      events.push(
        append(state, {
          type: "world.reputation.changed",
          memberId: member.id,
          delta: command.delta,
          total: next,
          reason: command.reason,
        }),
      );
      break;
    }
    case "world.achievement.unlock": {
      const member = state.members[command.memberId];
      if (!member) throw new Error("Achievement owner must be a world member");
      requireText(command.achievementId, "Achievement id");
      if (member.achievements.includes(command.achievementId))
        return { state, events };
      member.achievements.push(command.achievementId);
      if (!state.guild.achievements.includes(command.achievementId))
        state.guild.achievements.push(command.achievementId);
      events.push(
        append(state, {
          type: "world.achievement.unlocked",
          memberId: member.id,
          achievementId: command.achievementId,
        }),
      );
      break;
    }
    case "world.artifact.create": {
      const owner = state.members[command.ownerId];
      if (!owner) throw new Error("Artifact owner must be a world member");
      requireText(command.artifactId, "Artifact id");
      requireText(command.name, "Artifact name");
      requireText(command.description, "Artifact description");
      if (state.artifacts[command.artifactId])
        throw new Error("Artifact id has already been used");
      const sequence = state.sequence + 1;
      const artifact: WorldArtifact = {
        id: command.artifactId,
        name: command.name,
        description: command.description,
        ownerId: owner.id,
        sequence,
      };
      events.push(append(state, { type: "world.artifact.created", artifact }));
      state.artifacts[artifact.id] = artifact;
      owner.artifacts.push(artifact.id);
      break;
    }
    case "world.relationship.change": {
      if (command.memberA === command.memberB)
        throw new Error("A relationship needs two different members");
      if (!state.members[command.memberA] || !state.members[command.memberB])
        throw new Error("Both relationship members must belong to the world");
      if (!Number.isSafeInteger(command.delta) || command.delta === 0)
        throw new Error("Relationship delta must be a nonzero integer");
      const memberA =
        command.memberA < command.memberB ? command.memberA : command.memberB;
      const memberB =
        command.memberA < command.memberB ? command.memberB : command.memberA;
      const relationship = state.relationships.find(
        (item) => item.memberA === memberA && item.memberB === memberB,
      );
      const affinity = Math.max(
        -100,
        Math.min(100, (relationship?.affinity ?? 0) + command.delta),
      );
      if (relationship) relationship.affinity = affinity;
      else state.relationships.push({ memberA, memberB, affinity });
      events.push(
        append(state, {
          type: "world.relationship.changed",
          memberA,
          memberB,
          affinity,
        }),
      );
      break;
    }
  }
  return { state, events };
}

export function replayWorld(
  initial: WorldState,
  commands: readonly WorldCommand[],
): WorldState {
  return commands.reduce(
    (state, command) => applyWorldCommand(state, command).state,
    initial,
  );
}

/** Rebuilds the living-world projection from its ordered domain facts. */
export function replayWorldEvents(
  initial: WorldState,
  history: readonly WorldEvent[],
): WorldState {
  let state = structuredClone(initial);
  for (const event of history) {
    if (event.sequence !== state.sequence + 1) {
      throw new Error(
        `World history sequence gap: expected ${state.sequence + 1}, received ${event.sequence}`,
      );
    }
    switch (event.type) {
      case "world.member.joined": {
        requireText(event.memberId, "Member id");
        requireText(event.displayName, "Display name");
        if (state.members[event.memberId])
          throw new Error("World history repeats a member join");
        state.members[event.memberId] = {
          id: event.memberId,
          displayName: event.displayName,
          joinedAtSequence: event.sequence,
          reputation: 0,
          achievements: [],
          artifacts: [],
        };
        break;
      }
      case "world.adventure.started":
        requireText(event.adventureId, "Adventure id");
        requireText(event.title, "Adventure title");
        if (state.adventures.some((adventure) => adventure.status === "active"))
          throw new Error("World history starts overlapping adventures");
        if (
          state.adventures.some(
            (adventure) => adventure.id === event.adventureId,
          )
        )
          throw new Error("World history reuses an adventure id");
        state.adventures.push({
          id: event.adventureId,
          title: event.title,
          status: "active",
          outcome: null,
          chapters: [],
          decisions: [],
        });
        break;
      case "world.adventure.completed": {
        const adventure = activeAdventure(state);
        if (adventure.id !== event.adventureId)
          throw new Error("World history completes the wrong adventure");
        adventure.status = "completed";
        adventure.outcome = event.outcome;
        break;
      }
      case "world.chapter.recorded": {
        const adventure = activeAdventure(state);
        if (
          adventure.id !== event.adventureId ||
          event.chapter.sequence !== event.sequence
        )
          throw new Error(
            "World history chapter does not match its adventure or sequence",
          );
        if (
          adventure.chapters.some((chapter) => chapter.id === event.chapter.id)
        )
          throw new Error("World history repeats a chapter id");
        adventure.chapters.push(structuredClone(event.chapter));
        break;
      }
      case "world.decision.recorded": {
        const adventure = activeAdventure(state);
        if (
          adventure.id !== event.adventureId ||
          event.decision.sequence !== event.sequence
        )
          throw new Error(
            "World history decision does not match its adventure or sequence",
          );
        if (!state.members[event.decision.decidedBy])
          throw new Error("World history decision maker is not a member");
        if (
          adventure.decisions.some(
            (decision) => decision.id === event.decision.id,
          )
        )
          throw new Error("World history repeats a decision id");
        adventure.decisions.push(structuredClone(event.decision));
        break;
      }
      case "world.reputation.changed": {
        const member = state.members[event.memberId];
        if (
          !member ||
          !Number.isSafeInteger(event.delta) ||
          event.delta === 0 ||
          member.reputation + event.delta !== event.total ||
          event.total < 0
        )
          throw new Error(
            "World history contains an invalid reputation change",
          );
        member.reputation = event.total;
        state.guild.reputation += event.delta;
        break;
      }
      case "world.achievement.unlocked": {
        const member = state.members[event.memberId];
        if (!member || member.achievements.includes(event.achievementId))
          throw new Error(
            "World history contains an invalid achievement unlock",
          );
        member.achievements.push(event.achievementId);
        if (!state.guild.achievements.includes(event.achievementId))
          state.guild.achievements.push(event.achievementId);
        break;
      }
      case "world.artifact.created": {
        const artifact = event.artifact;
        const owner = state.members[artifact.ownerId];
        if (
          !owner ||
          state.artifacts[artifact.id] ||
          artifact.sequence !== event.sequence
        )
          throw new Error("World history contains an invalid artifact");
        state.artifacts[artifact.id] = structuredClone(artifact);
        owner.artifacts.push(artifact.id);
        break;
      }
      case "world.relationship.changed": {
        if (
          !state.members[event.memberA] ||
          !state.members[event.memberB] ||
          event.memberA >= event.memberB ||
          !Number.isInteger(event.affinity) ||
          event.affinity < -100 ||
          event.affinity > 100
        )
          throw new Error(
            "World history contains an invalid relationship change",
          );
        const relationship = state.relationships.find(
          (item) =>
            item.memberA === event.memberA && item.memberB === event.memberB,
        );
        if (relationship) relationship.affinity = event.affinity;
        else
          state.relationships.push({
            memberA: event.memberA,
            memberB: event.memberB,
            affinity: event.affinity,
          });
        break;
      }
    }
    state.sequence = event.sequence;
    state.history.push(structuredClone(event));
  }
  return state;
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

/** Confirms that the ordered facts reconstruct the supplied aggregate snapshot. */
export function verifyWorldHistory(
  initial: WorldState,
  history: readonly WorldEvent[],
  expected: WorldState,
): { valid: true; state: WorldState } | { valid: false; reason: string } {
  try {
    const replayed = replayWorldEvents(initial, history);
    if (stableValue(replayed) !== stableValue(expected))
      return {
        valid: false,
        reason: "World snapshot does not match replayed history",
      };
    return { valid: true, state: replayed };
  } catch (error) {
    return {
      valid: false,
      reason:
        error instanceof Error ? error.message : "World history is invalid",
    };
  }
}
