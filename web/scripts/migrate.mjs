// Idempotent migration runner: applies every .sql in lib/migrations in order.
// Default target is the local mhp.db; prod sets TURSO_DATABASE_URL + TURSO_AUTH_TOKEN.
import { createClient } from "@libsql/client";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const url = process.env.TURSO_DATABASE_URL ?? "file:/Users/jameswalton/Projects/mhp-brain/mhp.db";
const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

const dir = join(dirname(fileURLToPath(import.meta.url)), "../lib/migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
for (const f of files) {
  await db.executeMultiple(readFileSync(join(dir, f), "utf8"));
  console.log("applied", f);
}
console.log("migrations done ->", url);
