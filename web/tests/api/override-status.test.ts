import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ requireRole: vi.fn() }));
// The route does `e instanceof OverrideError`, so the mock must export the SAME class it imports.
vi.mock("@/lib/overrides", () => {
  class OverrideError extends Error {}
  return { OverrideError, writeOverride: vi.fn() };
});

import { POST } from "@/app/api/override/status/route";
import { requireRole } from "@/lib/auth";
import { writeOverride, OverrideError } from "@/lib/overrides";

const reqRole = requireRole as ReturnType<typeof vi.fn>;
const write = writeOverride as ReturnType<typeof vi.fn>;
const req = (body: unknown) =>
  new Request("http://t/api/override/status", {
    method: "POST",
    headers: { "content-type": "application/json", "X-MHP-Write": "1" },
    body: JSON.stringify(body),
  });

beforeEach(() => vi.clearAllMocks());

describe("POST /api/override/status", () => {
  it("403 when the caller lacks the editor role", async () => {
    reqRole.mockResolvedValue(null);
    const res = await POST(req({ id: "p1", status: "Active" }));
    expect(res.status).toBe(403);
    expect(write).not.toHaveBeenCalled();
  });

  it("400 on bad json", async () => {
    reqRole.mockResolvedValue({ name: "Boss" });
    const res = await POST(new Request("http://t/x", { method: "POST", body: "{not json" }));
    expect(res.status).toBe(400);
  });

  it("writes the override with the SESSION user as actor (never from the body) and returns ok", async () => {
    reqRole.mockResolvedValue({ name: "Rick", role: "ceo" });
    write.mockResolvedValue(undefined);
    const res = await POST(req({ id: "p1", status: "Active", name: "Smith Kitchen", actor: "ATTACKER" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(write).toHaveBeenCalledWith(expect.objectContaining({ entityId: "p1", field: "status", value: "Active", actor: "Rick" }));
  });

  it("maps an OverrideError (e.g. illegal status value) to 400", async () => {
    reqRole.mockResolvedValue({ name: "Rick" });
    write.mockRejectedValue(new OverrideError("bad value"));
    const res = await POST(req({ id: "p1", status: "Bogus" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("bad value");
  });
});
