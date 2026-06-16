import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks must be declared before importing the route.
vi.mock("@/lib/auth", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/match-project", () => ({ matchProject: vi.fn() }));
vi.mock("@/lib/operations", () => ({ updateProjectOps: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/db", () => ({ db: { execute: vi.fn().mockResolvedValue({ rows: [] }) } }));

import { POST } from "@/app/api/estimates/accept/route";
import { requireRole } from "@/lib/auth";
import { matchProject } from "@/lib/match-project";
import { updateProjectOps } from "@/lib/operations";
import { db } from "@/lib/db";

const post = (body: unknown) =>
  POST(new Request("http://t/api/estimates/accept", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));

beforeEach(() => {
  vi.clearAllMocks();
  (db.execute as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [] });
  (requireRole as ReturnType<typeof vi.fn>).mockResolvedValue({ name: "Tester", email: "t@x.com" });
});

describe("POST /api/estimates/accept", () => {
  it("401s when the caller is not at least an editor", async () => {
    (requireRole as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await post({ project: "Kingery", bid: 1000 });
    expect(res.status).toBe(401);
  });

  it("400s without a project name", async () => {
    const res = await post({ bid: 1000 });
    expect(res.status).toBe(400);
  });

  it("links to a matched project and writes contract value via the audited ops path", async () => {
    (matchProject as ReturnType<typeof vi.fn>).mockReturnValue({ id: "proj-1", name: "Kingery" });
    const res = await post({ project: "Kingery", bid: 50000 });
    const d = await res.json();
    expect(d.projectId).toBe("proj-1");
    expect(d.created).toBe(false);
    expect(updateProjectOps).toHaveBeenCalledWith(
      "proj-1",
      expect.objectContaining({ contract_value: 50000, current_phase: "in_progress" }),
      "Tester",
    );
    // no new project row when matched
    const inserts = (db.execute as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => (typeof c[0] === "string" ? c[0] : c[0]?.sql ?? "")).join(" | ");
    expect(inserts).not.toMatch(/INSERT INTO projects/i);
  });

  it("creates a new project row when nothing matches", async () => {
    (matchProject as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const res = await post({ project: "Brand New Job", bid: 30000 });
    const d = await res.json();
    expect(d.created).toBe(true);
    const sqls = (db.execute as ReturnType<typeof vi.fn>).mock.calls.map((c) => (typeof c[0] === "string" ? c[0] : c[0]?.sql ?? ""));
    expect(sqls.some((s) => /INSERT INTO projects/i.test(s))).toBe(true);
    // estimate marked won
    expect(sqls.some((s) => /saved_estimates/i.test(s) && /won/i.test(s))).toBe(true);
    expect(updateProjectOps).toHaveBeenCalled();
  });

  it("defaults the deposit to 20% of the bid", async () => {
    (matchProject as ReturnType<typeof vi.fn>).mockReturnValue({ id: "proj-1", name: "Kingery" });
    await post({ project: "Kingery", bid: 100000 });
    expect(updateProjectOps).toHaveBeenCalledWith("proj-1", expect.objectContaining({ deposit_amount: 20000 }), "Tester");
  });
});
