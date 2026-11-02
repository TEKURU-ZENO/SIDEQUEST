import {
  applyCommand,
  createGame,
  verifyGameHistory,
  type DomainCommand,
  type DomainEvent,
  type GameState,
} from "@sidequest/domain";
export * from "./world.js";
export type {
  DomainCommand as GameDomainCommand,
  DomainEvent as GameDomainEvent,
} from "@sidequest/domain";

export interface GameRepository {
  load(): Promise<GameState>;
  save(
    state: GameState,
    events: DomainEvent[],
    expectedSequence: number,
    idempotencyKey?: string,
  ): Promise<"saved" | "duplicate">;
  genesis(): Promise<GameState>;
  hasProcessed(idempotencyKey: string): Promise<boolean>;
  readEventsAfter(sequence: number): Promise<DomainEvent[]>;
}
export class InMemoryGameRepository implements GameRepository {
  private state: GameState = createGame("ember-vault");
  private readonly initialState: GameState = createGame("ember-vault");
  private events: DomainEvent[] = [];
  private readonly processedKeys = new Set<string>();
  async load() {
    return structuredClone(this.state);
  }
  async save(
    state: GameState,
    events: DomainEvent[],
    expectedSequence: number,
    idempotencyKey?: string,
  ): Promise<"saved" | "duplicate"> {
    if (idempotencyKey && this.processedKeys.has(idempotencyKey))
      return "duplicate";
    if (this.state.sequence !== expectedSequence)
      throw new Error("Concurrent game update detected");
    if (state.sequence !== expectedSequence + events.length)
      throw new Error("Game snapshot sequence does not match its events");
    this.state = structuredClone(state);
    this.events.push(...structuredClone(events));
    if (idempotencyKey) this.processedKeys.add(idempotencyKey);
    return "saved";
  }
  async genesis() {
    return structuredClone(this.initialState);
  }
  async hasProcessed(idempotencyKey: string) {
    return this.processedKeys.has(idempotencyKey);
  }
  async readEventsAfter(sequence: number) {
    return structuredClone(
      this.events.filter((item) => item.sequence > sequence),
    );
  }
}
export class GameApplication {
  private queue: Promise<void> = Promise.resolve();
  constructor(private readonly repository: GameRepository) {}
  dispatch(input: DomainCommand, options: { idempotencyKey?: string } = {}) {
    const task = this.queue.then(() => this.dispatchSerial(input, options));
    this.queue = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }
  private async dispatchSerial(
    input: DomainCommand,
    options: { idempotencyKey?: string },
  ) {
    const command = input;
    const current = await this.repository.load();
    if (
      options.idempotencyKey &&
      (await this.repository.hasProcessed(options.idempotencyKey))
    )
      return { state: current, events: [] as DomainEvent[] };
    const result = applyCommand(current, command);
    const saved = await this.repository.save(
      result.state,
      result.events,
      current.sequence,
      options.idempotencyKey,
    );
    if (saved === "duplicate")
      return {
        state: await this.repository.load(),
        events: [] as DomainEvent[],
      };
    return { state: result.state, events: result.events };
  }
  snapshot() {
    return this.repository.load();
  }
  readEventsAfter(sequence: number) {
    return this.repository.readEventsAfter(sequence);
  }
  async verify() {
    return verifyGameHistory(
      await this.repository.genesis(),
      await this.repository.readEventsAfter(0),
      await this.repository.load(),
    );
  }
}
