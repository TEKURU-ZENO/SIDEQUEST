import pino from "pino";
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "headers.authorization",
      "headers.cookie",
      "token",
      "accessToken",
      "refreshToken",
      "access_token",
      "refresh_token",
      "apiKey",
      "api_key",
      "OPENAI_API_KEY",
      "*.accessToken",
      "*.refreshToken",
      "*.apiKey",
    ],
    censor: "[REDACTED]",
  },
});
export type { Logger } from "pino";
