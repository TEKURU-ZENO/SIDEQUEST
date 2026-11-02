import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import express, {
  type ErrorRequestHandler,
  type Express,
  type RequestHandler,
} from "express";
import cors from "cors";
import { Server } from "socket.io";
import {
  GameApplication,
  type GameDomainCommand,
  type GameDomainEvent,
  InMemoryGameRepository,
  InMemoryWorldRepository,
  WorldApplication,
} from "@sidequest/application";
import {
  GameDomainEventSchema,
  GameCommandSchema,
  RealtimeEventSchema,
  WorldCommandSchema,
} from "@sidequest/contracts";
import {
  createPersistenceDatabase,
  type PersistenceDatabase,
  PostgresGameRepository,
  PostgresOutboxPublisher,
  PostgresWorldRepository,
} from "@sidequest/persistence";
import { EncryptedTwitchConnectionStore } from "@sidequest/persistence";
import {
  ChatCommandRateLimiter,
  InMemoryTwitchConnectionStore,
  normalizeChatEvent,
  TwitchEventSubClient,
  TwitchOAuthService,
} from "@sidequest/twitch";
import { loadEnvironment } from "@sidequest/config";
import { logger } from "@sidequest/observability";
import {
  createNarrativeGenerator,
  createQuestGenerator,
  narrateOutcome,
  proposeQuest,
  summarizeWorld,
} from "@sidequest/intelligence";

export const environment = loadEnvironment(process.env);
const appOrigins = environment.APP_ORIGINS.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
if (environment.NODE_ENV === "production") {
  throw new Error(
    "Production mode is disabled until authenticated streamer and overlay sessions are configured.",
  );
}

const GUILD_ID = "sidequest-local";
const GUILD_NAME = "SIDEQUEST Local Guild";
const databaseConnection = environment.DATABASE_URL
  ? createPersistenceDatabase(environment.DATABASE_URL)
  : undefined;
export const persistence:
  | {
      db: PersistenceDatabase;
      ping: () => Promise<void>;
      close: () => Promise<void>;
    }
  | undefined = databaseConnection;
const gameRepository = persistence
  ? new PostgresGameRepository(persistence.db, GUILD_ID)
  : new InMemoryGameRepository();
const worldRepository = persistence
  ? new PostgresWorldRepository(persistence.db)
  : new InMemoryWorldRepository();
const twitchStore =
  persistence && environment.TWITCH_TOKEN_ENCRYPTION_KEY
    ? new EncryptedTwitchConnectionStore(
        persistence.db,
        environment.TWITCH_TOKEN_ENCRYPTION_KEY,
      )
    : new InMemoryTwitchConnectionStore();
const twitchOAuth =
  environment.TWITCH_CLIENT_ID && environment.TWITCH_CLIENT_SECRET
    ? new TwitchOAuthService(
        {
          clientId: environment.TWITCH_CLIENT_ID,
          clientSecret: environment.TWITCH_CLIENT_SECRET,
          redirectUri: environment.TWITCH_REDIRECT_URI,
          guildId: GUILD_ID,
        },
        twitchStore,
      )
    : undefined;
let activeBroadcasterId: string | undefined;
const chatRateLimiter = new ChatCommandRateLimiter(1500);

export const app: Express = express();
export const server = createServer(app);
export const io = new Server(server, {
  cors: {
    origin: appOrigins,
    methods: ["GET", "POST", "DELETE"],
  },
});
export const game = new GameApplication(gameRepository);
export const world = new WorldApplication(worldRepository);
const intelligenceModel = environment.OPENAI_MODEL ?? "gpt-5-mini";
const questGenerator = createQuestGenerator(
  environment.OPENAI_API_KEY,
  intelligenceModel,
);
const narrativeGenerator = createNarrativeGenerator(
  environment.OPENAI_API_KEY,
  intelligenceModel,
);
const outboxPublisher = persistence
  ? new PostgresOutboxPublisher(persistence.db, async (channel, payload) => {
      if (channel === "game.world-event") {
        await world.recordGameEvent(
          GUILD_ID,
          GameDomainEventSchema.parse(payload) as GameDomainEvent,
        );
        return;
      }
      io.emit(channel, payload);
    })
  : undefined;
export const twitchEventSub =
  twitchOAuth && environment.TWITCH_CLIENT_ID
    ? new TwitchEventSubClient({
        clientId: environment.TWITCH_CLIENT_ID,
        connection: () => twitchOAuth.getValidConnection(),
        onChatMessage: async (input) => {
          const action = normalizeChatEvent(input);
          if (!action || action.channelId !== activeBroadcasterId) return;
          if (!chatRateLimiter.allow(action.channelId, action.playerId)) return;
          try {
            const result = await game.dispatch(
              toDomainCommand(action.command),
              {
                idempotencyKey: action.eventId,
              },
            );
            await publishGameResult(result);
          } catch (error) {
            logger.warn(
              { error, playerId: action.playerId },
              "Twitch game command was rejected",
            );
          }
        },
        onStatus: (status) =>
          logger.info({ status }, "Twitch EventSub status changed"),
      })
    : undefined;
let persistenceClose: Promise<void> | undefined;
let outboxTimer: ReturnType<typeof setInterval> | undefined;
function closePersistence() {
  persistenceClose ??= persistence?.close() ?? Promise.resolve();
  return persistenceClose;
}
server.on("close", () => {
  twitchEventSub?.stop();
  if (outboxTimer) clearInterval(outboxTimer);
  void closePersistence().catch((error) =>
    logger.error({ error }, "Unable to close PostgreSQL pool"),
  );
});

export const ready = (async () => {
  if (persistence && gameRepository instanceof PostgresGameRepository)
    await gameRepository.initialize(GUILD_NAME);
  if (!(await worldRepository.load(GUILD_ID)))
    await world.createWorld(GUILD_ID, GUILD_NAME);
  if (twitchOAuth && twitchEventSub && environment.NODE_ENV !== "test") {
    const saved = await twitchStore.load(GUILD_ID);
    if (saved) {
      const connection = await twitchOAuth.getValidConnection();
      activeBroadcasterId = connection.broadcasterId;
      await twitchEventSub.start();
    }
  }
})();

app.use(
  cors({
    origin: appOrigins,
    methods: ["GET", "POST", "DELETE"],
  }),
);
app.use((request, response, next) => {
  const supplied = request.header("x-request-id");
  const requestId =
    supplied && /^[\w.-]{1,80}$/.test(supplied) ? supplied : randomUUID();
  response.locals.requestId = requestId;
  response.setHeader("x-request-id", requestId);
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("x-frame-options", "DENY");
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader("cache-control", "no-store");
  next();
});
app.use(express.json({ limit: "32kb" }));

function gameSnapshot(state: Awaited<ReturnType<typeof game.snapshot>>) {
  return RealtimeEventSchema.parse({
    type: "game.snapshot",
    version: 1,
    sequence: state.sequence,
    state,
  });
}
function toDomainCommand(
  command: ReturnType<typeof GameCommandSchema.parse>,
): GameDomainCommand {
  switch (command.type) {
    case "quest.launch":
      return {
        type: "quest.launch",
        questId: command.questId,
        ...(command.questContent ? { questContent: command.questContent } : {}),
      };
    case "player.join":
    case "encounter.act":
    case "encounter.resolve":
      return command;
  }
}
function worldSnapshot(state: Awaited<ReturnType<typeof world.snapshot>>) {
  return RealtimeEventSchema.parse({
    type: "world.snapshot",
    version: 1,
    sequence: state.sequence,
    state,
  });
}
async function publishOutbox() {
  if (!outboxPublisher) return;
  try {
    await outboxPublisher.publishPending();
  } catch (error) {
    logger.error({ error }, "Outbox delivery deferred for retry");
  }
}
async function publishGameResult(result: {
  state: Awaited<ReturnType<typeof game.snapshot>>;
  events: GameDomainEvent[];
}) {
  if (result.events.length === 0) return;
  if (outboxPublisher) {
    await publishOutbox();
    return;
  }
  for (const event of result.events)
    await world.recordGameEvent(GUILD_ID, event);
  io.emit("game.snapshot", gameSnapshot(result.state));
  io.emit("world.snapshot", worldSnapshot(await world.snapshot(GUILD_ID)));
}

app.get("/health/live", (_request, response) =>
  response.json({ ok: true, service: "sidequest-api" }),
);
const readinessHandler: RequestHandler = async (_request, response) => {
  try {
    await ready;
    if (persistence) await persistence.ping();
    return response.json({
      ok: true,
      service: "sidequest-api",
      mode: persistence ? "postgres-local" : "local-demo",
      dependencies: {
        database: persistence ? "ready" : "not-configured",
        twitch: twitchOAuth
          ? twitchEventSub?.connected
            ? "connected"
            : "configured-disconnected"
          : "not-configured",
      },
    });
  } catch (error) {
    logger.warn({ error }, "Readiness check failed");
    return response
      .status(503)
      .json({ ok: false, service: "sidequest-api", status: "not-ready" });
  }
};
app.get("/health/ready", readinessHandler);
app.get("/health", readinessHandler);
app.get("/auth/twitch", (_request, response) => {
  if (!twitchOAuth)
    return response
      .status(503)
      .send("Configure TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET first.");
  return response.redirect(twitchOAuth.createAuthorizationUrl());
});
app.get("/auth/twitch/callback", async (request, response) => {
  if (!twitchOAuth || !twitchEventSub)
    return response.status(503).send("Twitch integration is not configured.");
  if (typeof request.query.error === "string")
    return response.status(400).send("Twitch authorization was not granted.");
  const { code, state } = request.query;
  if (typeof code !== "string" || typeof state !== "string")
    return response
      .status(400)
      .send("Twitch authorization callback is incomplete.");
  try {
    const identity = await twitchOAuth.completeAuthorization(code, state);
    activeBroadcasterId = identity.broadcasterId;
    await twitchEventSub.start();
    return response
      .type("text/plain")
      .send(
        `Connected SIDEQUEST to Twitch channel ${identity.login}. You can close this page.`,
      );
  } catch (error) {
    logger.warn({ error }, "Twitch OAuth callback failed");
    return response
      .status(400)
      .send("Twitch authorization could not be completed.");
  }
});
app.get("/api/twitch/status", async (_request, response) => {
  if (!twitchOAuth)
    return response.json({ configured: false, connected: false });
  const status = await twitchOAuth.status();
  return response.json({
    configured: true,
    ...status,
    eventSubConnected: Boolean(twitchEventSub?.connected),
  });
});
app.delete("/api/twitch/connection", async (_request, response) => {
  if (!twitchOAuth || !twitchEventSub)
    return response.status(503).json({
      ok: false,
      error: {
        code: "TWITCH_UNAVAILABLE",
        message: "Twitch integration is not configured.",
      },
    });
  twitchEventSub.stop();
  activeBroadcasterId = undefined;
  await twitchOAuth.disconnect();
  return response.json({ ok: true });
});
app.get("/api/game/snapshot", async (_request, response) => {
  await ready;
  return response.json(gameSnapshot(await game.snapshot()));
});
app.get("/api/game/events", async (request, response) => {
  await ready;
  const after = Number(request.query.after ?? 0);
  if (!Number.isSafeInteger(after) || after < 0)
    return response.status(400).json({
      ok: false,
      error: {
        code: "INVALID_SEQUENCE",
        message: "after must be a nonnegative integer.",
      },
    });
  return response.json({ events: await game.readEventsAfter(after) });
});
app.get("/api/game/verify", async (_request, response) => {
  await ready;
  return response.json(await game.verify());
});
app.post("/api/game/commands", async (request, response) => {
  await ready;
  const parsed = GameCommandSchema.safeParse(request.body);
  if (!parsed.success)
    return response.status(400).json({
      ok: false,
      error: {
        code: "INVALID_COMMAND",
        message: "Command did not match the game contract.",
      },
      requestId: response.locals.requestId as string,
    });
  try {
    const result = await game.dispatch(toDomainCommand(parsed.data));
    await publishGameResult(result);
    return response.json({
      ok: true,
      data: result,
      requestId: response.locals.requestId as string,
    });
  } catch (error) {
    return response.status(409).json({
      ok: false,
      error: {
        code: "COMMAND_REJECTED",
        message: error instanceof Error ? error.message : "Command rejected.",
      },
      requestId: response.locals.requestId as string,
    });
  }
});

app.get("/api/world/snapshot", async (_request, response) => {
  await ready;
  return response.json(worldSnapshot(await world.snapshot(GUILD_ID)));
});
app.get("/api/world/history", async (request, response) => {
  await ready;
  const after = Number(request.query.after ?? 0);
  if (!Number.isSafeInteger(after) || after < 0)
    return response.status(400).json({
      ok: false,
      error: {
        code: "INVALID_SEQUENCE",
        message: "after must be a nonnegative integer.",
      },
    });
  const events = await world.history(GUILD_ID);
  return response.json({
    events: events.filter((event) => event.sequence > after),
  });
});
app.get("/api/world/verify", async (_request, response) => {
  await ready;
  return response.json(await world.verify(GUILD_ID));
});
app.get("/api/intelligence/world-summary", async (_request, response) => {
  await ready;
  return response.json({
    data: summarizeWorld(await world.snapshot(GUILD_ID)),
    source: "deterministic",
  });
});
app.post("/api/intelligence/quest-proposal", async (_request, response) => {
  await ready;
  const result = await proposeQuest(
    questGenerator,
    summarizeWorld(await world.snapshot(GUILD_ID)),
  );
  return response.json({ data: result.content, source: result.source });
});
app.post("/api/intelligence/narrative", async (request, response) => {
  await ready;
  const { adventureId } = request.body ?? {};
  if (typeof adventureId !== "string" || !adventureId.trim())
    return response.status(400).json({
      ok: false,
      error: {
        code: "INVALID_ADVENTURE",
        message: "Provide an adventureId.",
      },
    });
  const snapshot = await world.snapshot(GUILD_ID);
  const adventure = snapshot.adventures.find((item) => item.id === adventureId);
  if (!adventure || adventure.status !== "completed" || !adventure.outcome)
    return response.status(404).json({
      ok: false,
      error: {
        code: "COMPLETED_ADVENTURE_REQUIRED",
        message: "Narrative is available for completed adventures.",
      },
    });
  const result = await narrateOutcome(narrativeGenerator, {
    outcome: adventure.outcome,
    title: adventure.title,
    ...(adventure.chapters.at(-1)?.consequence
      ? { consequence: adventure.chapters.at(-1)!.consequence }
      : {}),
  });
  return response.json({ data: result.content, source: result.source });
});
app.post("/api/world/commands", async (request, response) => {
  await ready;
  const parsed = WorldCommandSchema.safeParse(request.body);
  if (!parsed.success)
    return response.status(400).json({
      ok: false,
      error: {
        code: "INVALID_COMMAND",
        message: "Command did not match the world contract.",
      },
      requestId: response.locals.requestId as string,
    });
  try {
    const result = await world.dispatch(GUILD_ID, parsed.data);
    if (outboxPublisher) await publishOutbox();
    else io.emit("world.snapshot", worldSnapshot(result.state));
    return response.json({
      ok: true,
      data: result,
      requestId: response.locals.requestId as string,
    });
  } catch (error) {
    return response.status(409).json({
      ok: false,
      error: {
        code: "COMMAND_REJECTED",
        message: error instanceof Error ? error.message : "Command rejected.",
      },
      requestId: response.locals.requestId as string,
    });
  }
});

const safeErrorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  next,
) => {
  if (response.headersSent) return next(error);
  const candidate = error as { status?: unknown; type?: unknown };
  const status =
    candidate.status === 413 || candidate.type === "entity.too.large"
      ? 413
      : candidate.status === 400 || candidate.type === "entity.parse.failed"
        ? 400
        : 500;
  const requestId = response.locals.requestId as string | undefined;
  logger.error({ err: error, requestId, status }, "HTTP request failed");
  return response.status(status).json({
    ok: false,
    error: {
      code:
        status === 413
          ? "BODY_TOO_LARGE"
          : status === 400
            ? "INVALID_JSON"
            : "INTERNAL_ERROR",
      message:
        status === 500
          ? "The request could not be completed."
          : status === 413
            ? "Request body exceeds the 32 KB limit."
            : "Request body is not valid JSON.",
    },
    requestId: requestId ?? "unavailable",
  });
};
app.use(safeErrorHandler);

io.on("connection", async (socket) => {
  try {
    await ready;
    const [gameState, worldState] = await Promise.all([
      game.snapshot(),
      world.snapshot(GUILD_ID),
    ]);
    socket.emit("game.snapshot", gameSnapshot(gameState));
    socket.emit("world.snapshot", worldSnapshot(worldState));
  } catch (error) {
    logger.error({ error }, "Unable to initialize realtime snapshots");
    socket.disconnect(true);
  }
});

if (process.env.NODE_ENV !== "test") {
  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "SIDEQUEST API shutting down");
    twitchEventSub?.stop();
    if (outboxTimer) clearInterval(outboxTimer);
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await closePersistence();
  };
  process.once(
    "SIGINT",
    () =>
      void shutdown("SIGINT").catch((error) => {
        logger.error({ error }, "Graceful shutdown failed");
        process.exitCode = 1;
      }),
  );
  process.once(
    "SIGTERM",
    () =>
      void shutdown("SIGTERM").catch((error) => {
        logger.error({ error }, "Graceful shutdown failed");
        process.exitCode = 1;
      }),
  );
  if (outboxPublisher) {
    outboxTimer = setInterval(() => {
      void outboxPublisher
        .publishPending()
        .catch((error) =>
          logger.error({ error }, "Outbox delivery attempt failed"),
        );
    }, 1000);
    outboxTimer.unref();
  }
  void ready
    .then(() =>
      server.listen(environment.API_PORT, "127.0.0.1", () =>
        logger.info(
          { port: environment.API_PORT, persistence: Boolean(persistence) },
          "SIDEQUEST API listening",
        ),
      ),
    )
    .catch((error) => {
      logger.error({ error }, "SIDEQUEST API initialization failed");
      process.exitCode = 1;
    });
}
