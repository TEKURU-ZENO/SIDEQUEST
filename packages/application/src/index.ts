import { GameCommandSchema } from "@sidequest/contracts";
import type { GameCommand } from "@sidequest/contracts";
import {
  applyCommand,
  createGame,
  type DomainCommand,
  type DomainEvent,
  type GameState,
} from "@sidequest/domain";
export * from "./world.js";

export interface GameRepository {
  load(): Promise<GameState>;
  save(
    state: GameState,
    events: DomainEvent[],
    expectedSequence: number,
  ): Promise<void>;
  readEventsAfter(sequence: number): Promise<DomainEvent[]>;
}
function toDomainCommand(command: GameCommand): DomainCommand {
  switch (command.type) {
    case "quest.launch":
      return command;
    case "player.join":
      return command;
    case "encounter.resolve":
      return command;
    case "encounter.act":
      return command;
  }
}
export class InMemoryGameRepository implements GameRepository {
  private state: GameState = createGame("ember-vault");
  private events: DomainEvent[] = [];
  async load() {
    return structuredClone(this.state);
  }
  async save(
    state: GameState,
    events: DomainEvent[],
    expectedSequence: number,
  ) {
    if (this.state.sequence !== expectedSequence)
      throw new Error("Concurrent game update detected");
    if (state.sequence !== expectedSequence + events.length)
      throw new Error("Game snapshot sequence does not match its events");
    this.state = structuredClone(state);
    this.events.push(...structuredClone(events));
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
  dispatch(input: unknown) {
    const task = this.queue.then(() => this.dispatchSerial(input));
    this.queue = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }
  private async dispatchSerial(input: unknown) {
    const command = toDomainCommand(GameCommandSchema.parse(input));
    const current = await this.repository.load();
    const result = applyCommand(current, command);
    await this.repository.save(result.state, result.events, current.sequence);
    return { state: result.state, events: result.events };
  }
  snapshot() {
    return this.repository.load();
  }
  readEventsAfter(sequence: number) {
    return this.repository.readEventsAfter(sequence);
  }
}
