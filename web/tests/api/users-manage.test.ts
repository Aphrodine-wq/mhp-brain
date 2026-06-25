import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/operations", () => {
  class OpsError extends Error {}
  return {
    OpsError,
    USER_ROLES: ["admin", "ceo", "estimator", "sales", "materials", "editor", "viewer", "crew"],
    updateUserAdmin: vi.fn(),
  };
});

import { POST } from "@/app/api/users/manage/route";
import { requireRole } from "@/lib/auth";
import { updateUserAdmin, OpsError } from "@/lib/operations";

const reqRole = requireRole as ReturnType<typeof vi.fn>;
const update = updateUserAdmin as ReturnType<typeof vi.fn>;
const ADMIN = { id: 1, name: "Walt", role: "admin" };
const req = (body: unknown) =>
  new Request("http://t/api/users/manage", {
    method: "POST",
    headers: { "content-type": "application/json", "X-MHP-Write": "1" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  reqRole.mockResolvedValue(ADMIN); // default: an admin session
});

describe("POST /api/users/manage", () => {
  it("401 without an admin session", async () => {
    reqRole.mockResolvedValue(null);
    expect((await POST(req({ id: 5, role: "ceo" }))).status).toBe(401);
    expect(update).not.toHaveBeenCalled();
  });

  it("400 on a missing id", async () => {
    expect((await POST(req({ role: "ceo" }))).status).toBe(400);
  });

  it("400 on an invalid role", async () => {
    expect((await POST(req({ id: 5, role: "wizard" }))).status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("400 on an invalid active value", async () => {
    expect((await POST(req({ id: 5, active: 7 }))).status).toBe(400);
  });

  it("400 when nothing to update", async () => {
    expect((await POST(req({ id: 5 }))).status).toBe(400);
  });

  it("blocks an admin from demoting their OWN account (self-lockout guard)", async () => {
    const res = await POST(req({ id: ADMIN.id, role: "viewer" }));
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("blocks an admin from deactivating their OWN account", async () => {
    const res = await POST(req({ id: ADMIN.id, active: 0 }));
    expect(res.status).toBe(400);
  });

  it("activates another user and passes the session admin as the actor", async () => {
    update.mockResolvedValue(undefined);
    const res = await POST(req({ id: 5, active: 1 }));
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(5, { active: 1 }, "Walt");
  });

  it("maps an OpsError (e.g. user not found) to 400", async () => {
    update.mockRejectedValue(new OpsError("user 5 not found"));
    const res = await POST(req({ id: 5, role: "ceo" }));
    expect(res.status).toBe(400);
  });
});
