import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ db: { execute: vi.fn() } }));

import { createShareLink, resolveShareLink, revokeShareLink, hasActiveShareLink } from "@/lib/share";
import { db } from "@/lib/db";

const exec = db.execute as ReturnType<typeof vi.fn>;
const sqlsOf = () => exec.mock.calls.map((c) => (typeof c[0] === "string" ? c[0] : c[0]?.sql ?? ""));

beforeEach(() => {
  vi.clearAllMocks();
  exec.mockResolvedValue({ rows: [] });
});

describe("createShareLink", () => {
  it("revokes any prior link, inserts the new hash, and returns a raw token", async () => {
    const raw = await createShareLink("p1", "Tester");
    expect(typeof raw).toBe("string");
    expect(raw.length).toBeGreaterThan(20); // 32 random bytes -> base64url
    const sqls = sqlsOf();
    expect(sqls.some((s) => /UPDATE job_share_links SET revoked_at/i.test(s))).toBe(true);
    expect(sqls.some((s) => /INSERT INTO job_share_links/i.test(s))).toBe(true);
  });

  it("never stores the raw token (only a hash is inserted)", async () => {
    const raw = await createShareLink("p1", "Tester");
    const insert = exec.mock.calls.find((c) => /INSERT INTO job_share_links/i.test(typeof c[0] === "string" ? c[0] : c[0]?.sql ?? ""));
    const args = (insert?.[0] as { args?: unknown[] })?.args ?? [];
    expect(args).not.toContain(raw); // the raw token must not be among the inserted args
  });
});

describe("resolveShareLink", () => {
  it("returns the project id for an active token", async () => {
    exec.mockResolvedValue({ rows: [{ project_id: "p1" }] });
    expect(await resolveShareLink("sometoken")).toBe("p1");
  });
  it("returns null for an unknown/revoked token", async () => {
    exec.mockResolvedValue({ rows: [] });
    expect(await resolveShareLink("garbage")).toBeNull();
  });
  it("returns null for an empty token without querying", async () => {
    expect(await resolveShareLink("")).toBeNull();
    expect(exec).not.toHaveBeenCalled();
  });
  it("only matches non-revoked links", async () => {
    exec.mockResolvedValue({ rows: [{ project_id: "p1" }] });
    await resolveShareLink("t");
    expect(sqlsOf().some((s) => /revoked_at IS NULL/i.test(s))).toBe(true);
  });
});

describe("revoke / hasActive", () => {
  it("revokeShareLink updates revoked_at", async () => {
    await revokeShareLink("p1", "Tester");
    expect(sqlsOf().some((s) => /UPDATE job_share_links SET revoked_at/i.test(s))).toBe(true);
  });
  it("hasActiveShareLink reflects whether a row exists", async () => {
    exec.mockResolvedValue({ rows: [{ "1": 1 }] });
    expect(await hasActiveShareLink("p1")).toBe(true);
    exec.mockResolvedValue({ rows: [] });
    expect(await hasActiveShareLink("p1")).toBe(false);
  });
});
