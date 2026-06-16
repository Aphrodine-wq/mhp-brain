import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/integration-settings", () => ({ setSetting: vi.fn().mockResolvedValue(undefined) }));

import { POST } from "@/app/api/integration-settings/route";
import { requireRole } from "@/lib/auth";
import { setSetting } from "@/lib/integration-settings";

const post = (body: unknown, raw?: string) =>
  POST(new Request("http://t/api/integration-settings", {
    method: "POST",
    body: raw ?? JSON.stringify(body),
    headers: { "content-type": "application/json" },
  }));

beforeEach(() => {
  vi.clearAllMocks();
  (requireRole as ReturnType<typeof vi.fn>).mockResolvedValue({ name: "Owner", email: "o@x.com" });
});

describe("POST /api/integration-settings", () => {
  it("401s when not CEO", async () => {
    (requireRole as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await post({ provider: "alerts", key: "payment_received", value: "on" });
    expect(res.status).toBe(401);
    expect(setSetting).not.toHaveBeenCalled();
  });

  it("400s on bad json", async () => {
    const res = await post(undefined, "{not json");
    expect(res.status).toBe(400);
  });

  it("400s when provider or key is missing", async () => {
    expect((await post({ key: "x", value: "on" })).status).toBe(400);
    expect((await post({ provider: "alerts", value: "on" })).status).toBe(400);
  });

  it("persists a valid setting", async () => {
    const res = await post({ provider: "alerts", key: "payment_received", value: "on" });
    expect(res.status).toBe(200);
    expect(setSetting).toHaveBeenCalledWith("alerts", "payment_received", "on");
  });
});
