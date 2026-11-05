import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { TwitchConnectionRecord } from "@sidequest/contracts";

const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().int().positive(),
  scope: z.array(z.string()).default([]),
});
const ValidationSchema = z.object({
  client_id: z.string(),
  login: z.string(),
  user_id: z.string(),
  scopes: z.array(z.string()),
  expires_in: z.number().int().positive(),
});
const UsersSchema = z.object({
  data: z
    .array(
      z.object({ id: z.string(), login: z.string(), display_name: z.string() }),
    )
    .min(1),
});

export interface TwitchConnectionStore {
  save(connection: TwitchConnectionRecord): Promise<void>;
  load(guildId: string): Promise<TwitchConnectionRecord | undefined>;
  delete(guildId: string): Promise<void>;
}

export class InMemoryTwitchConnectionStore implements TwitchConnectionStore {
  private readonly values = new Map<string, TwitchConnectionRecord>();
  async save(connection: TwitchConnectionRecord) {
    this.values.set(connection.guildId, structuredClone(connection));
  }
  async load(guildId: string) {
    const connection = this.values.get(guildId);
    return connection ? structuredClone(connection) : undefined;
  }
  async delete(guildId: string) {
    this.values.delete(guildId);
  }
}

export interface TwitchOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  guildId: string;
  scopes?: string[];
}

export class TwitchOAuthService {
  private readonly pendingStates = new Map<string, number>();

  constructor(
    private readonly config: TwitchOAuthConfig,
    private readonly store: TwitchConnectionStore,
    private readonly request: typeof fetch = fetch,
  ) {}

  createAuthorizationUrl(): string {
    const now = Date.now();
    for (const [state, expiresAt] of this.pendingStates)
      if (expiresAt <= now) this.pendingStates.delete(state);
    while (this.pendingStates.size >= 500) {
      const oldest = this.pendingStates.keys().next().value as
        string | undefined;
      if (!oldest) break;
      this.pendingStates.delete(oldest);
    }
    const state = randomBytes(32).toString("hex");
    this.pendingStates.set(state, now + 10 * 60_000);
    const url = new URL("https://id.twitch.tv/oauth2/authorize");
    url.search = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: "code",
      scope: (this.config.scopes ?? ["user:read:chat"]).join(" "),
      state,
    }).toString();
    return url.toString();
  }

  async completeAuthorization(code: string, state: string) {
    const expiresAt = this.pendingStates.get(state);
    this.pendingStates.delete(state);
    if (!expiresAt || expiresAt < Date.now())
      throw new Error("OAuth state is invalid or expired");
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: this.config.redirectUri,
    });
    const token = await this.requestToken(body);
    if (!token.refresh_token)
      throw new Error("Twitch did not return a refresh token");
    const connection = await this.validateIdentity(
      token.access_token,
      token.refresh_token,
      token.scope,
    );
    await this.store.save(connection);
    return {
      broadcasterId: connection.broadcasterId,
      login: connection.login,
      displayName: connection.displayName,
    };
  }

  async getValidConnection(
    guildId = this.config.guildId,
  ): Promise<TwitchConnectionRecord> {
    const saved = await this.store.load(guildId);
    if (!saved) throw new Error("No Twitch broadcaster is connected");
    if (Date.parse(saved.expiresAt) > Date.now() + 60_000) return saved;
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: saved.refreshToken,
    });
    const token = await this.requestToken(body);
    const connection = await this.validateIdentity(
      token.access_token,
      token.refresh_token ?? saved.refreshToken,
      token.scope.length ? token.scope : saved.scopes,
    );
    if (connection.broadcasterId !== saved.broadcasterId)
      throw new Error(
        "Refreshed Twitch identity did not match the connected broadcaster",
      );
    await this.store.save(connection);
    return connection;
  }

  status() {
    return this.store.load(this.config.guildId).then((connection) =>
      connection
        ? {
            connected: true,
            broadcasterId: connection.broadcasterId,
            login: connection.login,
            displayName: connection.displayName,
            scopes: connection.scopes,
          }
        : { connected: false },
    );
  }

  disconnect() {
    return this.store.delete(this.config.guildId);
  }

  private async requestToken(body: URLSearchParams) {
    const response = await this.request("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok)
      throw new Error(`Twitch OAuth token request failed (${response.status})`);
    return TokenResponseSchema.parse(await response.json());
  }

  private async validateIdentity(
    accessToken: string,
    refreshToken: string,
    tokenScopes: string[],
  ): Promise<TwitchConnectionRecord> {
    const validationResponse = await this.request(
      "https://id.twitch.tv/oauth2/validate",
      {
        headers: { authorization: `OAuth ${accessToken}` },
      },
    );
    if (!validationResponse.ok)
      throw new Error("Twitch access token validation failed");
    const validation = ValidationSchema.parse(await validationResponse.json());
    if (validation.client_id !== this.config.clientId)
      throw new Error("Twitch access token belongs to a different application");
    const scopes = validation.scopes.length ? validation.scopes : tokenScopes;
    const missingScopes = (this.config.scopes ?? ["user:read:chat"]).filter(
      (scope) => !scopes.includes(scope),
    );
    if (missingScopes.length)
      throw new Error(
        `Twitch authorization is missing required scope(s): ${missingScopes.join(", ")}`,
      );
    const usersResponse = await this.request(
      "https://api.twitch.tv/helix/users",
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
          "client-id": this.config.clientId,
        },
      },
    );
    if (!usersResponse.ok)
      throw new Error("Unable to read the authorized Twitch identity");
    const user = UsersSchema.parse(await usersResponse.json()).data[0]!;
    if (user.id !== validation.user_id)
      throw new Error("Twitch identity validation mismatch");
    return {
      guildId: this.config.guildId,
      broadcasterId: user.id,
      login: user.login,
      displayName: user.display_name,
      accessToken,
      refreshToken,
      expiresAt: new Date(
        Date.now() + validation.expires_in * 1000,
      ).toISOString(),
      scopes,
    };
  }
}
