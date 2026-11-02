import { WorldCommandSchema } from "@sidequest/contracts";
import {
  applyWorldCommand,
  createWorld,
  verifyWorldHistory,
  type WorldCommand,
  type DomainEvent,
  type WorldEvent,
  type WorldState,
} from "@sidequest/domain";

export interface WorldRepository {
  create(state: WorldState): Promise<void>;
  genesis(worldId: string): Promise<WorldState | undefined>;
  load(worldId: string): Promise<WorldState | undefined>;
  save(
    state: WorldState,
    events: WorldEvent[],
    expectedSequence: number,
  ): Promise<void>;
  readHistory(worldId: string): Promise<WorldEvent[]>;
}

/** Local adapter. Phase 3 replaces it with a transactional database implementation. */
export class InMemoryWorldRepository implements WorldRepository {
  private states = new Map<string, WorldState>();
  private genesisStates = new Map<string, WorldState>();
  private histories = new Map<string, WorldEvent[]>();

  async create(state: WorldState): Promise<void> {
    if (this.states.has(state.id)) throw new Error("World already exists");
    this.states.set(state.id, structuredClone(state));
    this.genesisStates.set(state.id, structuredClone(state));
    this.histories.set(state.id, []);
  }

  async load(worldId: string): Promise<WorldState | undefined> {
    const state = this.states.get(worldId);
    return state ? structuredClone(state) : undefined;
  }

  async genesis(worldId: string): Promise<WorldState | undefined> {
    const state = this.genesisStates.get(worldId);
    return state ? structuredClone(state) : undefined;
  }

  async save(
    state: WorldState,
    events: WorldEvent[],
    expectedSequence: number,
  ): Promise<void> {
    const current = this.states.get(state.id);
    if (!current) throw new Error("World does not exist");
    if (current.sequence !== expectedSequence)
      throw new Error("Concurrent world update detected");
    if (state.sequence !== expectedSequence + events.length)
      throw new Error("World snapshot sequence does not match its events");
    this.states.set(state.id, structuredClone(state));
    this.histories.get(state.id)!.push(...structuredClone(events));
  }

  async readHistory(worldId: string): Promise<WorldEvent[]> {
    return structuredClone(this.histories.get(worldId) ?? []);
  }
}

export class WorldApplication {
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly repository: WorldRepository) {}

  async createWorld(worldId: string, guildName: string): Promise<WorldState> {
    const state = createWorld(worldId, guildName);
    await this.repository.create(state);
    return state;
  }

  dispatch(worldId: string, input: unknown) {
    const task = this.queue.then(() => this.dispatchSerial(worldId, input));
    this.queue = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }

  private async dispatchSerial(worldId: string, input: unknown) {
    const command = WorldCommandSchema.parse(input) as WorldCommand;
    const current = await this.requireWorld(worldId);
    const result = applyWorldCommand(current, command);
    await this.repository.save(result.state, result.events, current.sequence);
    return result;
  }

  async snapshot(worldId: string): Promise<WorldState> {
    return this.requireWorld(worldId);
  }

  async history(worldId: string): Promise<WorldEvent[]> {
    await this.requireWorld(worldId);
    return this.repository.readHistory(worldId);
  }

  /** Applies game lifecycle facts to persistent world memory; repeats are idempotent. */
  async recordGameEvent(worldId: string, event: DomainEvent): Promise<void> {
    if (event.type === "quest.started") {
      const state = await this.snapshot(worldId);
      const adventureId = `game-${event.questId}`;
      if (state.adventures.some((adventure) => adventure.id === adventureId))
        return;
      await this.dispatch(worldId, {
        type: "world.adventure.start",
        adventureId,
        title: event.questContent?.title ?? event.questId,
      });
      return;
    }
    if (event.type !== "encounter.resolved") return;

    const adventureId = `game-${event.questId}`;
    let state = await this.snapshot(worldId);
    let adventure = state.adventures.find((item) => item.id === adventureId);
    if (!adventure) {
      await this.dispatch(worldId, {
        type: "world.adventure.start",
        adventureId,
        title: event.questContent?.title ?? event.questId,
      });
      state = await this.snapshot(worldId);
      adventure = state.adventures.find((item) => item.id === adventureId);
    }
    if (!adventure || adventure.status === "completed") return;
    const chapterId = `chapter-${event.questId}`;
    if (!adventure.chapters.some((chapter) => chapter.id === chapterId)) {
      const consequence = (
        event.questContent?.narrativeHook ??
        (event.outcome === "won"
          ? "The guild's victory becomes part of its shared history."
          : "The guild regroups and carries the lesson into its next chapter.")
      ).slice(0, 160);
      await this.dispatch(worldId, {
        type: "world.chapter.record",
        chapterId,
        title: event.questContent?.title ?? event.questId,
        outcome: event.outcome,
        consequence,
      });
    }
    await this.dispatch(worldId, {
      type: "world.adventure.complete",
      outcome: event.outcome,
    });
  }

  async verify(worldId: string) {
    const snapshot = await this.requireWorld(worldId);
    const genesis = await this.repository.genesis(worldId);
    if (!genesis)
      return {
        valid: false as const,
        reason: "World genesis record is missing",
      };
    const history = await this.repository.readHistory(worldId);
    return verifyWorldHistory(genesis, history, snapshot);
  }

  private async requireWorld(worldId: string): Promise<WorldState> {
    const state = await this.repository.load(worldId);
    if (!state) throw new Error("World does not exist");
    return state;
  }
}
