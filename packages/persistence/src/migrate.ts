import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { Client } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString)
  throw new Error("DATABASE_URL is required to run migrations");

const client = new Client({ connectionString });
const migrationDirectory = fileURLToPath(
  new URL("../migrations/", import.meta.url),
);

try {
  await client.connect();
  await client.query(`CREATE TABLE IF NOT EXISTS "sidequest_migrations" (
    "name" text PRIMARY KEY NOT NULL,
    "applied_at" timestamptz NOT NULL DEFAULT now()
  )`);
  const appliedRows = await client.query<{ name: string }>(
    'SELECT "name" FROM "sidequest_migrations"',
  );
  const applied = new Set(appliedRows.rows.map((row) => row.name));
  const files = (await readdir(migrationDirectory))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort();

  for (const name of files) {
    if (applied.has(name)) continue;
    const sql = await readFile(join(migrationDirectory, name), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(
        'INSERT INTO "sidequest_migrations" ("name") VALUES ($1)',
        [name],
      );
      await client.query("COMMIT");
      process.stdout.write(`Applied ${name}\n`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  await client.end();
}
