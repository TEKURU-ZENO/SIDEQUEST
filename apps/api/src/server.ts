import { createServer } from "node:http";
import express, { type Express } from "express";
import cors from "cors";
import { Server } from "socket.io";
import {
  GameApplication,
  InMemoryGameRepository,
} from "@sidequest/application";
import { GameCommandSchema, RealtimeEventSchema } from "@sidequest/contracts";
import { loadEnvironment } from "@sidequest/config";
import { logger } from "@sidequest/observability";

export const environment = loadEnvironment(process.env);
export const app: Express = express();
export const server = createServer(app);
export const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "http://localhost:5174"],
    methods: ["GET", "POST"],
  },
});
export const game = new GameApplication(new InMemoryGameRepository());
app.use(cors());
app.use(express.json({ limit: "32kb" }));
app.get("/health", (_request, response) =>
  response.json({ ok: true, service: "sidequest-api", mode: "local-demo" }),
);
app.get("/api/game/snapshot", async (_request, response) =>
  response.json(
    RealtimeEventSchema.parse({
      type: "game.snapshot",
      version: 1,
      sequence: (await game.snapshot()).sequence,
      state: await game.snapshot(),
    }),
  ),
);
app.post("/api/game/commands", async (request, response) => {
  const parsed = GameCommandSchema.safeParse(request.body);
  if (!parsed.success)
    return response.status(400).json({
      ok: false,
      error: {
        code: "INVALID_COMMAND",
        message: "Command did not match the game contract.",
      },
      requestId: request.header("x-request-id") ?? "local",
    });
  try {
    const result = await game.dispatch(parsed.data);
    io.emit(
      "game.snapshot",
      RealtimeEventSchema.parse({
        type: "game.snapshot",
        version: 1,
        sequence: result.state.sequence,
        state: result.state,
      }),
    );
    return response.json({
      ok: true,
      data: result,
      requestId: request.header("x-request-id") ?? "local",
    });
  } catch (error) {
    return response.status(409).json({
      ok: false,
      error: {
        code: "COMMAND_REJECTED",
        message: error instanceof Error ? error.message : "Command rejected.",
      },
      requestId: request.header("x-request-id") ?? "local",
    });
  }
});
io.on("connection", async (socket) => {
  socket.emit(
    "game.snapshot",
    RealtimeEventSchema.parse({
      type: "game.snapshot",
      version: 1,
      sequence: (await game.snapshot()).sequence,
      state: await game.snapshot(),
    }),
  );
});
if (process.env.NODE_ENV !== "test")
  server.listen(environment.API_PORT, () =>
    logger.info({ port: environment.API_PORT }, "SIDEQUEST API listening"),
  );
