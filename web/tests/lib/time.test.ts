import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: { execute: vi.fn(), transaction: vi.fn() },
}));

import { logTime, recentEntries, actualLaborHours } from "@/lib/time";
import { db } from "@/lib/db";

const execute = db.execute as ReturnType<typeof vi.fn>;
const transaction = db.transaction as ReturnType<typeof vi.fn>;

function fakeTx(newId = 42) {
  return {
    execute: vi.fn(async (q: { sql: string }) => {
      if (/INSERT INTO time_entries/i.test(q.sql)) return { rows: [{ id: newId }] };
      return { rows: [] };
    }),
    commit: vi.fn(async () => {}),
    rollback: vi.fn(async () => {}),
  };
}

const validInput = () => ({
  worker_name: "Carlos",
  project_id: "p1",
  work_date: "2026-06-16",
  hours: 8,
});

beforeEach(() => vi.clearAllMocks());

describe("logTime — validation", () => {
  it("rejects a blank worker name", async () => {
    await expect(logTime({ ...validInput(), worker_name: "   " }, "Boss")).rejects.toThrow(/worker required/);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects a missing project", async () => {
    await expect(logTime({ ...validInput(), project_id: "" }, "Boss")).rejects.toThrow(/project required/);
  });

  it("rejects a missing work date", async () => {
    await expect(logTime({ ...validInput(), work_date: "" }, "Boss")).rejects.toThrow(/work date required/);
  });

  it("rejects zero or negative hours", async () => {
    await expect(logTime({ ...validInput(), hours: 0 }, "Boss")).rejects.toThrow(/hours must be positive/);
    await expect(logTime({ ...validInput(), hours: -3 }, "Boss")).rejects.toThrow(/hours must be positive/);
  });

  it("rejects NaN hours", async () => {
    await expect(logTime({ ...validInput(), hours: NaN }, "Boss")).rejects.toThrow(/hours must be positive/);
  });
});

describe("logTime — write & audit", () => {
  it("inserts the entry, writes an audit row, commits, and returns the new id", async () => {
    const tx = fakeTx(99);
    transaction.mockResolvedValue(tx);

    const id = await logTime(validInput(), "Boss");

    expect(id).toBe(99);
    expect(transaction).toHaveBeenCalledWith("write");
    expect(tx.commit).toHaveBeenCalledOnce();
    expect(tx.rollback).not.toHaveBeenCalled();

    const insert = tx.execute.mock.calls.find((c) => /INSERT INTO time_entries/i.test(c[0].sql));
    // entered_by is the server-side actor, not anything from the input
    expect(insert![0].args[6]).toBe("Boss");
    // source defaults to "office"
    expect(insert![0].args[4]).toBe("office");

    const audit = tx.execute.mock.calls.find((c) => /INSERT INTO audit_log/i.test(c[0].sql));
    expect(audit![0].args[1]).toBe("Boss"); // actor
    expect(audit![0].args[2]).toBe("99"); // new entry id as entity id
    expect(audit![0].args[4]).toBe("8"); // hours as new_value
  });

  it("trims the worker name and honors an explicit field source", async () => {
    const tx = fakeTx();
    transaction.mockResolvedValue(tx);
    await logTime({ ...validInput(), worker_name: "  Carlos  ", source: "field" }, "Boss");
    const insert = tx.execute.mock.calls.find((c) => /INSERT INTO time_entries/i.test(c[0].sql));
    expect(insert![0].args[0]).toBe("Carlos");
    expect(insert![0].args[4]).toBe("field");
  });

  it("rolls back and rethrows if the audit insert fails", async () => {
    const tx = fakeTx();
    tx.execute
      .mockImplementationOnce(async () => ({ rows: [{ id: 7 }] })) // time_entries insert
      .mockImplementationOnce(async () => {
        throw new Error("audit failed");
      });
    transaction.mockResolvedValue(tx);

    await expect(logTime(validInput(), "Boss")).rejects.toThrow("audit failed");
    expect(tx.rollback).toHaveBeenCalledOnce();
    expect(tx.commit).not.toHaveBeenCalled();
  });
});

describe("recentEntries", () => {
  it("maps and coerces row types", async () => {
    execute.mockResolvedValue({
      rows: [
        { id: "5", worker_name: "Carlos", project_id: "p1", project_name: "Smith Kitchen", work_date: "2026-06-16", hours: "8", note: "framing" },
        { id: 6, worker_name: "Dana", project_id: "p2", project_name: null, work_date: "2026-06-15", hours: 4, note: null },
      ],
    });
    const r = await recentEntries();
    expect(r[0]).toEqual({ id: 5, worker_name: "Carlos", project_id: "p1", project_name: "Smith Kitchen", work_date: "2026-06-16", hours: 8, note: "framing" });
    expect(r[1].project_name).toBe(""); // null project name coerced to empty
    expect(r[1].note).toBeNull();
  });

  it("passes the limit through", async () => {
    execute.mockResolvedValue({ rows: [] });
    await recentEntries(5);
    expect(execute.mock.calls[0][0].args).toEqual([5]);
  });
});

describe("actualLaborHours", () => {
  it("returns the summed hours for a project", async () => {
    execute.mockResolvedValue({ rows: [{ hours: "37.5" }] });
    expect(await actualLaborHours("p1")).toBe(37.5);
  });

  it("returns 0 when there are no rows", async () => {
    execute.mockResolvedValue({ rows: [] });
    expect(await actualLaborHours("p1")).toBe(0);
  });
});
