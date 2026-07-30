import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ db: { execute: vi.fn(), transaction: vi.fn() } }));

import {
  updateProjectOps,
  updateUserAdmin,
  approveChangeOrder,
  createChangeOrder,
  createPayment,
  OpsError,
} from "@/lib/operations";
import { db } from "@/lib/db";

const execute = db.execute as ReturnType<typeof vi.fn>;
const transaction = db.transaction as ReturnType<typeof vi.fn>;

// Fresh fake tx. SELECTs return the supplied "old" row (so auditedUpdate finds the entity);
// everything else returns empty.
function fakeTx(oldRow: Record<string, unknown> | null = {}) {
  return {
    execute: vi.fn(async (q: { sql: string; args: unknown[] }) =>
      /^\s*SELECT/i.test(q.sql) ? { rows: oldRow ? [oldRow] : [] } : { rows: [] },
    ),
    commit: vi.fn(async () => {}),
    rollback: vi.fn(async () => {}),
  };
}

beforeEach(() => vi.clearAllMocks());

describe("auditedUpdate contract (via updateProjectOps)", () => {
  it("rejects a field not in the allowlist BEFORE opening a transaction (injection guard)", async () => {
    await expect(
      // @ts-expect-error — deliberately bad field to hit the runtime allowlist guard
      updateProjectOps("p1", { drop_table: "x" }, "Boss"),
    ).rejects.toBeInstanceOf(OpsError);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("no-ops (no transaction) when there are no defined fields to update", async () => {
    await updateProjectOps("p1", {}, "Boss");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("reads the old value, updates, writes an audit row, and commits", async () => {
    const tx = fakeTx({ contract_value: 1000 });
    transaction.mockResolvedValue(tx);

    await updateProjectOps("p1", { contract_value: 2000 }, "Boss");

    expect(transaction).toHaveBeenCalledWith("write");
    expect(tx.execute).toHaveBeenCalledTimes(3); // SELECT old + UPDATE + INSERT audit
    const audit = tx.execute.mock.calls.find((c) => /INSERT INTO audit_log/i.test(c[0].sql))!;
    // [ts, actor, entityType, entityId, label, field, old_value, new_value, action]
    expect(audit[0].args[1]).toBe("Boss");
    expect(audit[0].args[2]).toBe("project");
    expect(audit[0].args[5]).toBe("contract_value");
    expect(audit[0].args[6]).toBe("1000"); // old captured before write
    expect(audit[0].args[7]).toBe("2000"); // new
    expect(tx.commit).toHaveBeenCalledOnce();
    expect(tx.rollback).not.toHaveBeenCalled();
  });

  it("rolls back and rethrows if the UPDATE fails", async () => {
    const tx = fakeTx({ contract_value: 1000 });
    tx.execute
      .mockImplementationOnce(async () => ({ rows: [{ contract_value: 1000 }] })) // SELECT ok
      .mockImplementationOnce(async () => {
        throw new Error("db down");
      }); // UPDATE fails
    transaction.mockResolvedValue(tx);

    await expect(updateProjectOps("p1", { contract_value: 2000 }, "Boss")).rejects.toThrow("db down");
    expect(tx.rollback).toHaveBeenCalledOnce();
    expect(tx.commit).not.toHaveBeenCalled();
  });

  it("throws when the entity is not found (empty SELECT)", async () => {
    const tx = fakeTx(null); // SELECT returns no rows
    transaction.mockResolvedValue(tx);
    await expect(updateProjectOps("ghost", { contract_value: 1 }, "Boss")).rejects.toBeInstanceOf(OpsError);
    expect(tx.rollback).toHaveBeenCalledOnce();
  });
});

describe("completion_pct normalization", () => {
  it("stores a whole number and audits it like any other field", async () => {
    const tx = fakeTx({ completion_pct: null });
    transaction.mockResolvedValue(tx);

    await updateProjectOps("p1", { completion_pct: 85 }, "Boss");

    const audit = tx.execute.mock.calls.find((c) => /INSERT INTO audit_log/i.test(c[0].sql))!;
    expect(audit[0].args[5]).toBe("completion_pct");
    expect(audit[0].args[6]).toBeNull(); // nothing set before
    expect(audit[0].args[7]).toBe("85");
    expect(tx.commit).toHaveBeenCalledOnce();
  });

  it("accepts a percent-shaped string from the form and rounds to an integer", async () => {
    const tx = fakeTx({ completion_pct: null });
    transaction.mockResolvedValue(tx);

    // @ts-expect-error — the form sends strings; normalization is the point of this test
    await updateProjectOps("p1", { completion_pct: "85%" }, "Boss");

    const update = tx.execute.mock.calls.find((c) => /^\s*UPDATE/i.test(c[0].sql))!;
    expect(update[0].args[0]).toBe(85);
  });

  it("clears the value when given null (distinct from 0)", async () => {
    const tx = fakeTx({ completion_pct: 40 });
    transaction.mockResolvedValue(tx);

    await updateProjectOps("p1", { completion_pct: null }, "Boss");

    const update = tx.execute.mock.calls.find((c) => /^\s*UPDATE/i.test(c[0].sql))!;
    expect(update[0].args[0]).toBeNull();
  });

  it("rejects out-of-range and non-numeric values before opening a transaction", async () => {
    await expect(updateProjectOps("p1", { completion_pct: 140 }, "Boss")).rejects.toBeInstanceOf(OpsError);
    await expect(updateProjectOps("p1", { completion_pct: -5 }, "Boss")).rejects.toBeInstanceOf(OpsError);
    // @ts-expect-error — deliberately bad input from a hand-rolled request
    await expect(updateProjectOps("p1", { completion_pct: "soon" }, "Boss")).rejects.toBeInstanceOf(OpsError);
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe("updateUserAdmin", () => {
  it("looks up the email server-side and audits as entity 'user' with action 'user_admin'", async () => {
    execute.mockResolvedValue({ rows: [{ email: "rick@mhp.local" }] }); // email lookup
    const tx = fakeTx({ role: "viewer" });
    transaction.mockResolvedValue(tx);

    await updateUserAdmin(5, { role: "ceo" }, "Admin");

    const audit = tx.execute.mock.calls.find((c) => /INSERT INTO audit_log/i.test(c[0].sql))!;
    expect(audit[0].args[2]).toBe("user");           // entity type
    expect(audit[0].args[4]).toBe("rick@mhp.local"); // label = authoritative email
    expect(audit[0].args[6]).toBe("viewer");          // old role
    expect(audit[0].args[7]).toBe("ceo");             // new role
    expect(audit[0].args[8]).toBe("user_admin");      // action
  });

  it("throws OpsError when the user id does not exist (no transaction)", async () => {
    execute.mockResolvedValue({ rows: [] }); // email lookup misses
    await expect(updateUserAdmin(999, { active: 1 }, "Admin")).rejects.toBeInstanceOf(OpsError);
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe("change orders & payments", () => {
  it("approveChangeOrder writes the approval + an audit row in one transaction", async () => {
    const tx = fakeTx({ approved: 0, description: "Add a window" });
    transaction.mockResolvedValue(tx);

    await approveChangeOrder(12, 1, "Boss");

    const audit = tx.execute.mock.calls.find((c) => /INSERT INTO audit_log/i.test(c[0].sql))!;
    expect(audit[0].args).toContain("approve"); // action for approved=1
    expect(tx.commit).toHaveBeenCalledOnce();
  });

  it("approveChangeOrder records a reject action for approved=-1", async () => {
    const tx = fakeTx({ approved: 0, description: "Add a window" });
    transaction.mockResolvedValue(tx);
    await approveChangeOrder(12, -1, "Boss");
    const audit = tx.execute.mock.calls.find((c) => /INSERT INTO audit_log/i.test(c[0].sql))!;
    expect(audit[0].args).toContain("reject");
  });

  it("createChangeOrder returns the new id", async () => {
    execute.mockResolvedValue({ rows: [{ id: 7 }] });
    expect(await createChangeOrder({ project_id: "p1", description: "x", amount: 500 })).toBe(7);
  });

  it("createPayment returns the new id", async () => {
    execute.mockResolvedValue({ rows: [{ id: 99 }] });
    expect(await createPayment({ project_id: "p1", amount: 1000, payment_date: "2026-01-01" })).toBe(99);
  });
});
