import { createClient, type Client } from "@libsql/client";

// Local dev defaults to the pipeline's SQLite file (libSQL reads it natively).
// Prod (Vercel) sets TURSO_DATABASE_URL to the turso:// URL + TURSO_AUTH_TOKEN.
const url = process.env.TURSO_DATABASE_URL ?? "file:../mhp.db";

export const db: Client = createClient({
  url,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
