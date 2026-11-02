import { GameCommandSchema } from "@sidequest/contracts";
import type { GameCommand } from "@sidequest/contracts";
import {
  applyCommand,
  createGame,
  type DomainEvent,
  type GameState,
} from "@sidequest/domain";

export interface GameRepository {
  load(): Promise<GameState>;
  save(state: GameState, events: DomainEvent[]): Promise<void>;
}
export class InMemoryGameRepository implements GameRepository {
  private state: GameState = createGame("ember-vault");
  async load() {
    return structuredClone(this.state);
  }
  async save(state: GameState) {
    this.state = structuredClone(state);
  }
}
export class GameApplication {
  constructor(private readonly repository: GameRepository) {}
  async dispatch(input: unknown) {
    const command: GameCommand = GameCommandSchema.parse(input);
    const current = await this.repository.load();
    const result = applyCommand(current, command);
    await this.repository.save(result.state, result.events);
    return { state: result.state, events: result.events };
  }
  snapshot() {
    return this.repository.load();
  }
}
