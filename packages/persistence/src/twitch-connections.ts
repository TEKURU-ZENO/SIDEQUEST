import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { TwitchConnectionRecord } from "@sidequest/contracts";
import type { PersistenceDatabase } from "./database.js";
import { twitchConnections } from "./schema.js";

export class EncryptedTwitchConnectionStore {
  private readonly key: Buffer;

  constructor(
    private readonly db: PersistenceDatabase,
    keyHex: string,
  ) {
    if (!/^[\da-f]{64}$/i.test(keyHex))
      throw new Error("Twitch token encryption key must be 32 bytes of hex");
    this.key = Buffer.from(keyHex, "hex");
  }

  async save(connection: TwitchConnectionRecord): Promise<void> {
    await this.db
      .insert(twitchConnections)
      .values({
        guildId: connection.guildId,
        broadcasterId: connection.broadcasterId,
        login: connection.login,
        displayName: connection.displayName,
        accessTokenCiphertext: this.encrypt(connection.accessToken),
        refreshTokenCiphertext: this.encrypt(connection.refreshToken),
        scopes: connection.scopes,
        expiresAt: new Date(connection.expiresAt),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: twitchConnections.guildId,
        set: {
          broadcasterId: connection.broadcasterId,
          login: connection.login,
          displayName: connection.displayName,
          accessTokenCiphertext: this.encrypt(connection.accessToken),
          refreshTokenCiphertext: this.encrypt(connection.refreshToken),
          scopes: connection.scopes,
          expiresAt: new Date(connection.expiresAt),
          updatedAt: new Date(),
        },
      });
  }

  async load(guildId: string): Promise<TwitchConnectionRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(twitchConnections)
      .where(eq(twitchConnections.guildId, guildId))
      .limit(1);
    if (!row) return undefined;
    if (
      !Array.isArray(row.scopes) ||
      row.scopes.some((scope) => typeof scope !== "string")
    )
      throw new Error("Stored Twitch scopes failed validation");
    return {
      guildId: row.guildId,
      broadcasterId: row.broadcasterId,
      login: row.login,
      displayName: row.displayName,
      accessToken: this.decrypt(row.accessTokenCiphertext),
      refreshToken: this.decrypt(row.refreshTokenCiphertext),
      expiresAt: row.expiresAt.toISOString(),
      scopes: row.scopes,
    };
  }

  async delete(guildId: string): Promise<void> {
    await this.db
      .delete(twitchConnections)
      .where(eq(twitchConnections.guildId, guildId));
  }

  private encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ]);
    return [
      iv.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
      ciphertext.toString("base64url"),
    ].join(".");
  }

  private decrypt(value: string): string {
    const [ivText, tagText, ciphertextText] = value.split(".");
    if (!ivText || !tagText || !ciphertextText)
      throw new Error("Stored Twitch credential is malformed");
    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.key,
        Buffer.from(ivText, "base64url"),
      );
      decipher.setAuthTag(Buffer.from(tagText, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertextText, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      throw new Error("Unable to decrypt stored Twitch credentials");
    }
  }
}
