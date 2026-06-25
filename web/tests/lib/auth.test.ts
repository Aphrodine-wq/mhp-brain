import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

vi.mock("@/lib/db", () => ({ db: { execute: vi.fn(), transaction: vi.fn() } }));

import {
  hashPassword,
  verifyPassword,
  createPendingUser,
  createPasswordReset,
  checkPasswordReset,
  resetPasswordWithToken,
} from "@/lib/auth";
import { db } from "@/lib/db";

const execute = db.execute as ReturnType<typeof vi.fn>;
const transaction = db.transaction as ReturnType<typeof vi.fn>;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

beforeEach(() => vi.clearAllMocks());

describe("password hashing (scrypt, real crypto)", () => {
  it("verifies the correct password and rejects a wrong one", async () => {
    const { hash, salt } = await hashPassword("hunter2");
    expect(await verifyPassword("hunter2", hash, salt)).toBe(true);
    expect(await verifyPassword("hunter3", hash, salt)).toBe(false);
  });

  it("uses a unique salt per call (no two hashes collide for the same password)", async () => {
    const a = await hashPassword("same");
    const b = await hashPassword("same");
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  it("fails closed on an empty stored hash or salt (never throws)", async () => {
    expect(await verifyPassword("x", "", "")).toBe(false);
    expect(await verifyPassword("x", "deadbeef", "")).toBe(false);
  });
});

describe("createPendingUser", () => {
  it("reports true when a new pending row was inserted", async () => {
    execute.mockResolvedValue({ rows: [{ id: 1 }] });
    expect(await createPendingUser("Rick", "rick@mhp.local", "pw")).toBe(true);
  });

  it("reports false on an existing email (ON CONFLICT DO NOTHING) — no enumeration", async () => {
    execute.mockResolvedValue({ rows: [] });
    expect(await createPendingUser("Rick", "rick@mhp.local", "pw")).toBe(false);
  });

  it("inserts as active=0 / viewer (cannot sign in until an admin activates)", async () => {
    execute.mockResolvedValue({ rows: [{ id: 1 }] });
    await createPendingUser("Rick", "rick@mhp.local", "pw");
    const sql = execute.mock.calls[0][0].sql as string;
    expect(sql).toMatch(/'viewer'/);
    expect(sql).toMatch(/0\)/); // active default 0 in the VALUES tuple
    expect(sql).toMatch(/ON CONFLICT \(email\) DO NOTHING/i);
  });
});

describe("password reset tokens", () => {
  it("stores only the SHA-256 of the token; the raw token is returned, never persisted", async () => {
    execute.mockResolvedValue({ rows: [] });
    const raw = await createPasswordReset(7);
    const insert = execute.mock.calls.find((c) => /INSERT INTO password_resets/i.test(c[0].sql))!;
    const stored = insert[0].args[0] as string;
    expect(stored).not.toBe(raw);
    expect(stored).toBe(sha256(raw));
  });

  it("drops any older tokens for the user before minting a new one", async () => {
    execute.mockResolvedValue({ rows: [] });
    await createPasswordReset(7);
    expect(execute.mock.calls.some((c) => /DELETE FROM password_resets WHERE user_id/i.test(c[0].sql))).toBe(true);
  });

  it("checkPasswordReset returns the user id for a valid token, null otherwise", async () => {
    execute.mockResolvedValueOnce({ rows: [{ user_id: 42 }] });
    expect(await checkPasswordReset("rawtoken")).toBe(42);
    execute.mockResolvedValueOnce({ rows: [] });
    expect(await checkPasswordReset("rawtoken")).toBeNull();
    expect(await checkPasswordReset("")).toBeNull(); // empty short-circuits
  });
});

describe("resetPasswordWithToken", () => {
  function fakeTx(claimedUserId: number | null) {
    return {
      execute: vi.fn(async (q: { sql: string }) =>
        /UPDATE password_resets SET used/i.test(q.sql)
          ? { rows: claimedUserId == null ? [] : [{ user_id: claimedUserId }] }
          : { rows: [] },
      ),
      commit: vi.fn(async () => {}),
      rollback: vi.fn(async () => {}),
    };
  }

  it("consumes the token, rotates the password, and kills existing sessions", async () => {
    const tx = fakeTx(42);
    transaction.mockResolvedValue(tx);
    expect(await resetPasswordWithToken("raw", "newpw")).toBe(true);
    const sqls = tx.execute.mock.calls.map((c) => c[0].sql);
    expect(sqls.some((s) => /UPDATE users SET pass_hash/i.test(s))).toBe(true);
    expect(sqls.some((s) => /DELETE FROM sessions WHERE user_id/i.test(s))).toBe(true);
    expect(tx.commit).toHaveBeenCalledOnce();
  });

  it("returns false and rolls back when the token is invalid/expired/used", async () => {
    const tx = fakeTx(null); // claim returns no row
    transaction.mockResolvedValue(tx);
    expect(await resetPasswordWithToken("raw", "newpw")).toBe(false);
    expect(tx.rollback).toHaveBeenCalledOnce();
    expect(tx.commit).not.toHaveBeenCalled();
  });

  it("returns false on an empty token without touching the DB", async () => {
    expect(await resetPasswordWithToken("", "newpw")).toBe(false);
    expect(transaction).not.toHaveBeenCalled();
  });
});
