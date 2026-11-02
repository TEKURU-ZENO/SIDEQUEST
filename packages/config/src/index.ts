import { z } from "zod";

const EnvironmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    APP_ORIGINS: z
      .string()
      .default("http://localhost:5173,http://localhost:5174"),
    DATABASE_URL: z.string().optional(),
    TWITCH_CLIENT_ID: z.string().optional(),
    TWITCH_CLIENT_SECRET: z.string().optional(),
    TWITCH_TOKEN_ENCRYPTION_KEY: z
      .string()
      .optional()
      .refine(
        (value) => !value || /^[\da-f]{64}$/i.test(value),
        "must be 32 bytes encoded as 64 hex characters",
      ),
    TWITCH_REDIRECT_URI: z
      .string()
      .url()
      .default("http://localhost:4000/auth/twitch/callback"),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_MODEL: z.string().optional(),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
  })
  .superRefine((environment, context) => {
    for (const origin of environment.APP_ORIGINS.split(",")
      .map((value) => value.trim())
      .filter(Boolean)) {
      try {
        const parsed = new URL(origin);
        if (
          parsed.origin !== origin ||
          !["http:", "https:"].includes(parsed.protocol)
        )
          throw new Error("invalid origin");
      } catch {
        context.addIssue({
          code: "custom",
          path: ["APP_ORIGINS"],
          message: `contains an invalid origin: ${origin}`,
        });
      }
    }
    if (
      Boolean(environment.TWITCH_CLIENT_ID) !==
      Boolean(environment.TWITCH_CLIENT_SECRET)
    )
      context.addIssue({
        code: "custom",
        path: ["TWITCH_CLIENT_SECRET"],
        message:
          "TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET must be configured together",
      });
    if (
      environment.DATABASE_URL &&
      environment.TWITCH_CLIENT_ID &&
      !environment.TWITCH_TOKEN_ENCRYPTION_KEY
    )
      context.addIssue({
        code: "custom",
        path: ["TWITCH_TOKEN_ENCRYPTION_KEY"],
        message:
          "is required to persist Twitch OAuth credentials with PostgreSQL",
      });
  });
export const loadEnvironment = (
  source: Record<string, string | undefined> = {},
) => EnvironmentSchema.parse(source);
export type Environment = ReturnType<typeof loadEnvironment>;
