import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ db: { execute: vi.fn() } }));

import { clientPortalData } from "@/lib/client-portal";
import { db } from "@/lib/db";

// The DB returns rows that ALSO carry internal columns — the safe projection must drop every one.
function wire(execMock: ReturnType<typeof vi.fn>) {
  execMock.mockImplementation((q: string | { sql: string }) => {
    const sql = typeof q === "string" ? q : q.sql;
    if (/FROM projects/i.test(sql)) return Promise.resolve({ rows: [{
      name: "Kingery Kitchen", address: "1 Oak St", client_name: "Jane", current_phase: "in_progress",
      actual_start: "2026-01-10", actual_end: null, contract_value: 100000,
      lead_source: "referral", lost_reason: null, margin: 0.31, // <-- internal, must not leak
    }] });
    if (/FROM payments/i.test(sql)) return Promise.resolve({ rows: [
      { amount: 25000, payment_date: "2026-02-01", method: "check", reference: "INV-1" }, // method/reference internal
    ] });
    if (/FROM change_orders/i.test(sql)) return Promise.resolve({ rows: [
      { description: "Add a deck", amount: 5000, approved_date: "2026-02-10", cost: 3200, sub_name: "Bob's Framing" }, // cost/sub_name internal
    ] });
    if (/FROM permits/i.test(sql)) return Promise.resolve({ rows: [
      { permit_type: "Electrical", inspection_date: "2099-01-01", inspection_result: "pending", notes: "internal" }, // notes internal
    ] });
    if (/FROM job_events/i.test(sql)) return Promise.resolve({ rows: [
      { event_date: "2026-02-05", summary: "Framing complete", crew_present: "3 guys", hours_worked: 24, detail: "private" }, // crew/hours/detail internal
    ] });
    if (/FROM job_photos/i.test(sql)) return Promise.resolve({ rows: [
      { file_url: "https://img/1.jpg", caption: "Kitchen", file_path: "/internal/onedrive/1.jpg" }, // file_path internal
    ] });
    return Promise.resolve({ rows: [] });
  });
}

const INTERNAL = ["lead_source", "lost_reason", "margin", "cost", "sub_name", "method", "reference", "notes", "crew_present", "hours_worked", "detail", "file_path", "p25", "p75", "cost_to_fix"];

function allKeys(v: unknown, acc = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => allKeys(x, acc));
  else if (v && typeof v === "object") for (const [k, val] of Object.entries(v)) { acc.add(k); allKeys(val, acc); }
  return acc;
}

beforeEach(() => { vi.clearAllMocks(); wire(db.execute as ReturnType<typeof vi.fn>); });

describe("clientPortalData — security boundary", () => {
  it("never leaks any internal field into the client-safe projection", async () => {
    const data = await clientPortalData("p1");
    const keys = [...allKeys(data)];
    for (const bad of INTERNAL) expect(keys, `leaked '${bad}'`).not.toContain(bad);
  });

  it("returns the safe fields a homeowner should see", async () => {
    const data = await clientPortalData("p1");
    expect(data?.name).toBe("Kingery Kitchen");
    expect(data?.clientName).toBe("Jane");
    expect(data?.changeOrders[0]).toEqual({ description: "Add a deck", amount: 5000, approvedDate: "2026-02-10" });
    expect(data?.nextInspection).toEqual({ type: "Electrical", date: "2099-01-01", result: "pending" });
    expect(data?.milestones[0]).toEqual({ date: "2026-02-05", summary: "Framing complete" });
    expect(data?.photos[0]).toEqual({ url: "https://img/1.jpg", caption: "Kitchen" });
  });
});

describe("payment schedule math", () => {
  it("derives 20% / draw / draw / 5% and flips paid flags by cumulative collected", async () => {
    const data = await clientPortalData("p1");
    const s = data!.schedule;
    expect(s.map((x) => x.amount)).toEqual([20000, 37500, 37500, 5000]); // 20% / two draws / 5% of 100k
    // $25k collected covers the deposit only
    expect(s[0].paid).toBe(true);
    expect(s[1].paid).toBe(false);
    expect(data!.collected).toBe(25000);
  });

  it("returns null for an unknown/revoked project", async () => {
    (db.execute as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [] });
    expect(await clientPortalData("nope")).toBeNull();
  });
});
