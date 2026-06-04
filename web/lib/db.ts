import { Pool, type PoolClient } from "pg";

// Postgres (Neon in prod, local Postgres in dev). We keep the libSQL-shaped interface
// (db.execute({sql, args}) with ? placeholders, db.transaction()) so the query layer barely
// changes — this wrapper translates ? -> $N and returns rows as objects.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function toPg(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

type Args = unknown[];
export interface Row {
  [k: string]: unknown;
}
export interface Result {
  rows: Row[];
}
type Query = string | { sql: string; args?: Args };

const text = (q: Query) => (typeof q === "string" ? q : q.sql);
const args = (q: Query) => (typeof q === "string" ? [] : q.args ?? []);

export interface Tx {
  execute(q: Query): Promise<Result>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export const db = {
  async execute(q: Query): Promise<Result> {
    const res = await pool.query(toPg(text(q)), args(q) as Args);
    return { rows: res.rows as Row[] };
  },

  async transaction(_mode?: "read" | "write"): Promise<Tx> {
    const client: PoolClient = await pool.connect();
    await client.query("BEGIN");
    let settled = false;
    const end = async (verb: "COMMIT" | "ROLLBACK") => {
      if (settled) return;
      settled = true;
      try {
        await client.query(verb);
      } finally {
        client.release();
      }
    };
    return {
      async execute(q: Query): Promise<Result> {
        const res = await client.query(toPg(text(q)), args(q) as Args);
        return { rows: res.rows as Row[] };
      },
      commit: () => end("COMMIT"),
      rollback: () => end("ROLLBACK"),
    };
  },
};
