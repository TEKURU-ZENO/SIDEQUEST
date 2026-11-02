export * from "./schema.js";

// Production repositories must append events, update snapshots, and enqueue outbox
// records in one PostgreSQL transaction before publishing any realtime update.
