import type { TwitchConnectionRecord } from "@sidequest/contracts";
import { z } from "zod";

const EventSubFrameSchema = z.object({
  metadata: z.object({
    message_id: z.string(),
    message_type: z.string(),
    message_timestamp: z.string().datetime().optional(),
  }),
  payload: z.record(z.string(), z.unknown()),
});

export interface TwitchEventSubOptions {
  clientId: string;
  connection: () => Promise<TwitchConnectionRecord>;
  onChatMessage: (event: unknown) => Promise<void>;
  onStatus?: (
    status: "connecting" | "connected" | "disconnected" | "error",
  ) => void;
  request?: typeof fetch;
  WebSocketConstructor?: typeof WebSocket;
}

const EVENTSUB_URL = "wss://eventsub.wss.twitch.tv/ws";

export class TwitchEventSubClient {
  private socket: WebSocket | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private watchdog: ReturnType<typeof setTimeout> | undefined;
  private stopped = true;
  private reconnectAttempt = 0;
  private lastMessageAt = 0;
  private keepaliveTimeoutMs = 10_000;
  private readonly seenMessages = new Set<string>();
  private readonly request: typeof fetch;
  private readonly WebSocketConstructor: typeof WebSocket;

  constructor(private readonly options: TwitchEventSubOptions) {
    this.request = options.request ?? fetch;
    this.WebSocketConstructor = options.WebSocketConstructor ?? WebSocket;
  }

  get connected() {
    return (
      !this.stopped &&
      this.socket?.readyState === this.WebSocketConstructor.OPEN
    );
  }

  async start() {
    if (!this.stopped) return;
    this.stopped = false;
    await this.connect(EVENTSUB_URL, false);
  }

  stop() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.watchdog) clearTimeout(this.watchdog);
    this.reconnectTimer = undefined;
    this.watchdog = undefined;
    const socket = this.socket;
    this.socket = undefined;
    socket?.close(1000, "SIDEQUEST disconnected");
    this.options.onStatus?.("disconnected");
  }

  private async connect(url: string, transfer: boolean) {
    if (this.stopped) return;
    this.options.onStatus?.("connecting");
    const previousSocket = this.socket;
    const socket = new this.WebSocketConstructor(url);
    this.socket = socket;
    socket.addEventListener("open", () => {
      this.lastMessageAt = Date.now();
      this.armWatchdog();
    });
    socket.addEventListener("message", (message) => {
      void this.receive(socket, message.data, transfer, previousSocket);
    });
    socket.addEventListener("error", () => {
      if (socket === this.socket) this.options.onStatus?.("error");
    });
    socket.addEventListener("close", () => {
      if (socket !== this.socket || this.stopped) return;
      this.socket = undefined;
      if (this.watchdog) clearTimeout(this.watchdog);
      this.options.onStatus?.("disconnected");
      this.scheduleReconnect();
    });
  }

  private async receive(
    socket: WebSocket,
    data: unknown,
    transfer: boolean,
    previousSocket: WebSocket | undefined,
  ) {
    const text = await this.frameText(data);
    if (!text || socket !== this.socket || this.stopped) return;
    this.lastMessageAt = Date.now();
    this.armWatchdog();
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return;
    }
    const parsed = EventSubFrameSchema.safeParse(raw);
    if (!parsed.success) return;
    const { metadata, payload } = parsed.data;
    if (metadata.message_type === "session_welcome") {
      const session = z
        .object({
          id: z.string().min(1),
          keepalive_timeout_seconds: z.number().int().positive(),
        })
        .safeParse(payload.session);
      if (!session.success) {
        socket.close();
        return;
      }
      this.keepaliveTimeoutMs = session.data.keepalive_timeout_seconds * 1000;
      this.armWatchdog();
      if (transfer) {
        previousSocket?.close(1000, "EventSub session transferred");
        this.reconnectAttempt = 0;
        this.options.onStatus?.("connected");
        return;
      }
      try {
        await this.subscribe(session.data.id);
        if (socket === this.socket && !this.stopped) {
          this.reconnectAttempt = 0;
          this.options.onStatus?.("connected");
        }
      } catch {
        this.options.onStatus?.("error");
        socket.close();
      }
      return;
    }
    if (metadata.message_type === "session_reconnect") {
      const reconnectUrl = z
        .string()
        .url()
        .safeParse(
          (payload.session as { reconnect_url?: unknown } | undefined)
            ?.reconnect_url,
        );
      if (reconnectUrl.success) void this.connect(reconnectUrl.data, true);
      else socket.close();
      return;
    }
    if (metadata.message_type === "revocation") {
      this.options.onStatus?.("error");
      return;
    }
    if (metadata.message_type !== "notification") return;
    if (this.seenMessages.has(metadata.message_id)) return;
    const sentAt = metadata.message_timestamp
      ? Date.parse(metadata.message_timestamp)
      : Number.NaN;
    const ageMs = Date.now() - sentAt;
    // WebSocket EventSub has no webhook HMAC header. TLS authenticates Twitch;
    // timestamp bounds and message IDs prevent stale/replayed notifications.
    if (!Number.isFinite(sentAt) || ageMs > 10 * 60_000 || ageMs < -30_000)
      return;
    const notification = z
      .object({
        subscription: z.object({ type: z.string() }),
        event: z.unknown(),
      })
      .safeParse(payload);
    if (
      !notification.success ||
      notification.data.subscription.type !== "channel.chat.message"
    )
      return;
    this.rememberMessage(metadata.message_id);
    try {
      await this.options.onChatMessage(notification.data.event);
    } catch {
      this.seenMessages.delete(metadata.message_id);
      this.options.onStatus?.("error");
    }
  }

  private rememberMessage(messageId: string) {
    this.seenMessages.add(messageId);
    if (this.seenMessages.size <= 10_000) return;
    const oldest = this.seenMessages.values().next().value as
      string | undefined;
    if (oldest) this.seenMessages.delete(oldest);
  }

  private async subscribe(sessionId: string) {
    const connection = await this.options.connection();
    const response = await this.request(
      "https://api.twitch.tv/helix/eventsub/subscriptions",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${connection.accessToken}`,
          "client-id": this.options.clientId,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          type: "channel.chat.message",
          version: "1",
          condition: {
            broadcaster_user_id: connection.broadcasterId,
            user_id: connection.broadcasterId,
          },
          transport: { method: "websocket", session_id: sessionId },
        }),
      },
    );
    if (!response.ok)
      throw new Error(
        `Unable to subscribe to Twitch chat (${response.status})`,
      );
  }

  private armWatchdog() {
    if (this.watchdog) clearTimeout(this.watchdog);
    if (this.stopped || !this.socket) return;
    this.watchdog = setTimeout(() => {
      if (Date.now() - this.lastMessageAt >= this.keepaliveTimeoutMs) {
        this.socket?.close();
      } else {
        this.armWatchdog();
      }
    }, this.keepaliveTimeoutMs + 250);
  }

  private scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return;
    const delay = Math.min(30_000, 1000 * 2 ** this.reconnectAttempt++);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect(EVENTSUB_URL, false);
    }, delay);
  }

  private async frameText(data: unknown): Promise<string | undefined> {
    if (typeof data === "string") return data;
    if (data && typeof (data as { text?: unknown }).text === "function")
      return (data as Blob).text();
    if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
    return undefined;
  }
}
