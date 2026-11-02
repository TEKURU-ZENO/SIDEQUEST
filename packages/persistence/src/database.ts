import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";

export type PersistenceDatabase = NodePgDatabase<typeof schema>;

export function createPersistenceDatabase(connectionString: string) {
  const pool = new Pool({
    connectionString,
    max: 10,
    application_name: "sidequest-api",
  });
  const db = drizzle(pool, { schema });
  return {
    db,
    pool,
    ping: async () => {
      await pool.query("SELECT 1");
    },
    close: () => pool.end(),
  };
}
