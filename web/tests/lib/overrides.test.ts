import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: { execute: vi.fn(), transaction: vi.fn() },
}));

import { writeOverride, OverrideError, subKey } from "@/lib/overrides";
import { db } from "@/lib/db";

const transaction = db.transaction as ReturnType<typeof vi.fn>;

// A fresh fake transaction per test. execute() returns no prior value by default;
// the first execute inside writeOverride is the "read old value" SELECT.
function fakeTx(oldValue: string | null = null) {
  const tx = {
    execute: vi.fn(async (q: { sql: string; args: unknown[] }) => {
      if (/SELECT value FROM overrides/i.test(q.sql)) {
        return { rows: oldValue === null ? [] : [{ value: oldValue }] };
      }
      return { rows: [] };
    }),
    commit: vi.fn(async () => {}),
    rollback: vi.fn(async () => {}),
  };
  return tx;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("writeOverride — allowlist validation (injection guard)", () => {
  it("rejects a field that is not in the entity's allowlist", async () => {
    await expect(
      writeOverride({ entityType: "project", entityId: "p1", field: "name", value: "x", actor: "Boss" }),
    ).rejects.toBeInstanceOf(OverrideError);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects an unknown entity type's fields", async () => {
    await expect(
      // @ts-expect-error — deliberately passing a bad entity type to test the runtime guard
      writeOverride({ entityType: "bogus", entityId: "p1", field: "status", value: "Active", actor: "Boss" }),
    ).rejects.toBeInstanceOf(OverrideError);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects a value outside an enumerated field's legal set", async () => {
    await expect(
      writeOverride({ entityType: "project", entityId: "p1", field: "status", value: "Bogus", actor: "Boss" }),
    ).rejects.toThrow(/bad value/);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects null for an enumerated field", async () => {
    await expect(
      writeOverride({ entityType: "sub", entityId: "s1", field: "verified", value: null, actor: "Boss" }),
    ).rejects.toBeInstanceOf(OverrideError);
  });

  it("rejects a value longer than 200 chars", async () => {
    await expect(
      writeOverride({ entityType: "project", entityId: "p1", field: "market", value: "x".repeat(201), actor: "Boss" }),
    ).rejects.toThrow(/too long/);
  });

  it("rejects a missing entity id", async () => {
    await expect(
      writeOverride({ entityType: "project", entityId: "", field: "market", value: "Oxford", actor: "Boss" }),
    ).rejects.toThrow(/missing entity id/);
  });
});

describe("writeOverride — happy path & audit", () => {
  it("accepts a legal enumerated value, upserts, and writes an audit row", async () => {
    const tx = fakeTx("Bid"); // previous status was Bid
    transaction.mockResolvedValue(tx);

    await writeOverride({
      entityType: "project",
      entityId: "p1",
      field: "status",
      value: "Active",
      actor: "Boss",
      label: "Smith Kitchen",
    });

    expect(transaction).toHaveBeenCalledWith("write");
    // 4 statements: read old, upsert override, insert audit, mirror onto projects.status
    expect(tx.execute).toHaveBeenCalledTimes(4);
    expect(tx.commit).toHaveBeenCalledOnce();
    expect(tx.rollback).not.toHaveBeenCalled();

    // The overlay alone left CeoDashboard / SalesDashboard / liveData() reading a stale
    // projects.status, since they filter on the column rather than applying the overlay.
    const mirror = tx.execute.mock.calls.find((c) => /UPDATE projects SET/i.test(c[0].sql));
    expect(mirror).toBeTruthy();
    expect(mirror![0].sql).toMatch(/SET status = \?/);
    expect(mirror![0].args).toEqual(["Active", "p1"]);

    const auditCall = tx.execute.mock.calls.find((c) => /INSERT INTO audit_log/i.test(c[0].sql));
    expect(auditCall).toBeTruthy();
    const auditArgs = auditCall![0].args;
    // [ts, actor, entityType, entityId, label, field, old_value, new_value, action]
    expect(auditArgs[1]).toBe("Boss");
    expect(auditArgs[2]).toBe("project");
    expect(auditArgs[3]).toBe("p1");
    expect(auditArgs[4]).toBe("Smith Kitchen");
    expect(auditArgs[5]).toBe("status");
    expect(auditArgs[6]).toBe("Bid"); // old value read before write
    expect(auditArgs[7]).toBe("Active"); // new value
    expect(auditArgs[8]).toBe("set"); // default action
  });

  it("records a null old_value when no prior override existed", async () => {
    const tx = fakeTx(null);
    transaction.mockResolvedValue(tx);

    await writeOverride({ entityType: "project", entityId: "p2", field: "market", value: "Tupelo", actor: "Boss" });

    const auditCall = tx.execute.mock.calls.find((c) => /INSERT INTO audit_log/i.test(c[0].sql));
    expect(auditCall![0].args[6]).toBeNull();
  });

  it("accepts a free-text field (null legal set) without enum checks", async () => {
    const tx = fakeTx(null);
    transaction.mockResolvedValue(tx);
    await expect(
      writeOverride({ entityType: "project", entityId: "p3", field: "type", value: "Whole-home remodel", actor: "Boss" }),
    ).resolves.toBeUndefined();
    expect(tx.commit).toHaveBeenCalledOnce();
  });

  it("rolls back and rethrows if a write fails", async () => {
    const tx = fakeTx(null);
    tx.execute.mockImplementationOnce(async () => ({ rows: [] })); // read old ok
    tx.execute.mockImplementationOnce(async () => {
      throw new Error("db down");
    }); // upsert fails
    transaction.mockResolvedValue(tx);

    await expect(
      writeOverride({ entityType: "project", entityId: "p4", field: "market", value: "Oxford", actor: "Boss" }),
    ).rejects.toThrow("db down");
    expect(tx.rollback).toHaveBeenCalledOnce();
    expect(tx.commit).not.toHaveBeenCalled();
  });
});

describe("subKey", () => {
  it("normalizes a sub name the same way canon does", () => {
    expect(subKey("  Joe's   Plumbing ")).toBe("joe's plumbing");
  });
});

describe("writeOverride — base-column mirroring", () => {
  it("mirrors market and type onto projects too", async () => {
    for (const field of ["market", "type"] as const) {
      const tx = fakeTx("old");
      transaction.mockResolvedValue(tx);
      await writeOverride({ entityType: "project", entityId: "p1", field, value: "X", actor: "Boss" });
      const mirror = tx.execute.mock.calls.find((c) => /UPDATE projects SET/i.test(c[0].sql));
      expect(mirror, `${field} should mirror`).toBeTruthy();
      expect(mirror![0].args).toEqual(["X", "p1"]);
    }
  });

  it("does NOT touch projects for non-project entities", async () => {
    const tx = fakeTx("old");
    transaction.mockResolvedValue(tx);
    await writeOverride({ entityType: "sub", entityId: "bobby-ray", field: "phone", value: "6625550100", actor: "Boss" });
    expect(tx.execute.mock.calls.find((c) => /UPDATE projects SET/i.test(c[0].sql))).toBeUndefined();
    expect(tx.execute).toHaveBeenCalledTimes(3);
  });

  it("does NOT invent a column for a project field that has none", async () => {
    const tx = fakeTx("old");
    transaction.mockResolvedValue(tx);
    // live_flag lives only in the overrides table — there is no projects.dismissed
    await writeOverride({ entityType: "live_flag", entityId: "p1:x", field: "dismissed", value: "true", actor: "Boss" });
    expect(tx.execute.mock.calls.find((c) => /UPDATE projects SET/i.test(c[0].sql))).toBeUndefined();
  });
});
