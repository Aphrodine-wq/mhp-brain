import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock pg before importing db.ts (it constructs a Pool at module load). Every query in the app
// rides on this wrapper's ?->$N translation and the transaction lifecycle, so a bug here is
// catastrophic — pin both. vi.hoisted runs before the hoisted vi.mock + the db.ts import, so the
// Pool's `new Pool()` at module load sees initialized spies (no temporal-dead-zone error).
const { query, clientQuery, release, connect } = vi.hoisted(() => {
  const query = vi.fn();
  const clientQuery = vi.fn();
  const release = vi.fn();
  const connect = vi.fn(async () => ({ query: clientQuery, release }));
  return { query, clientQuery, release, connect };
});

vi.mock("pg", () => ({
  Pool: class {
    query = query;
    connect = connect;
  },
}));

import { db } from "@/lib/db";

beforeEach(() => vi.clearAllMocks());

describe("db.execute — libSQL-shaped wrapper over pg", () => {
  it("translates ? placeholders to $N in order and passes args through", async () => {
    query.mockResolvedValue({ rows: [{ a: 1 }] });
    const r = await db.execute({ sql: "SELECT * FROM t WHERE x = ? AND y = ?", args: [5, "z"] });
    expect(query).toHaveBeenCalledWith("SELECT * FROM t WHERE x = $1 AND y = $2", [5, "z"]);
    expect(r.rows).toEqual([{ a: 1 }]);
  });

  it("accepts a bare string query with no args", async () => {
    query.mockResolvedValue({ rows: [] });
    await db.execute("SELECT now()");
    expect(query).toHaveBeenCalledWith("SELECT now()", []);
  });

  it("numbers every ? independently (not all $1)", async () => {
    query.mockResolvedValue({ rows: [] });
    await db.execute({ sql: "INSERT INTO t (a,b,c) VALUES (?,?,?)", args: [1, 2, 3] });
    expect(query).toHaveBeenCalledWith("INSERT INTO t (a,b,c) VALUES ($1,$2,$3)", [1, 2, 3]);
  });
});

describe("db.transaction — BEGIN/COMMIT/ROLLBACK lifecycle", () => {
  it("runs BEGIN, executes on the dedicated client, then COMMIT + release once", async () => {
    clientQuery.mockResolvedValue({ rows: [] });
    const tx = await db.transaction("write");
    expect(clientQuery).toHaveBeenCalledWith("BEGIN");
    await tx.execute({ sql: "UPDATE t SET x=? WHERE id=?", args: [1, 2] });
    expect(clientQuery).toHaveBeenCalledWith("UPDATE t SET x=$1 WHERE id=$2", [1, 2]);
    await tx.commit();
    expect(clientQuery).toHaveBeenCalledWith("COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });

  it("rollback runs ROLLBACK and releases the client", async () => {
    clientQuery.mockResolvedValue({ rows: [] });
    const tx = await db.transaction();
    await tx.rollback();
    expect(clientQuery).toHaveBeenCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });

  it("is settled-once: a second commit (or a rollback after commit) is a no-op", async () => {
    clientQuery.mockResolvedValue({ rows: [] });
    const tx = await db.transaction();
    await tx.commit();
    await tx.commit();   // no-op
    await tx.rollback(); // no-op after settle
    const commits = clientQuery.mock.calls.filter((c) => c[0] === "COMMIT").length;
    const rollbacks = clientQuery.mock.calls.filter((c) => c[0] === "ROLLBACK").length;
    expect(commits).toBe(1);
    expect(rollbacks).toBe(0);
    expect(release).toHaveBeenCalledOnce();
  });
});
