import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/share", () => ({
  createShareLink: vi.fn().mockResolvedValue("raw-token-abc"),
  revokeShareLink: vi.fn().mockResolvedValue(undefined),
}));

import { POST, DELETE } from "@/app/api/projects/[id]/share/route";
import { requireRole } from "@/lib/auth";
import { createShareLink, revokeShareLink } from "@/lib/share";

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const req = () => new Request("http://t/api/projects/p1/share", { method: "POST" });

beforeEach(() => {
  vi.clearAllMocks();
  (requireRole as ReturnType<typeof vi.fn>).mockResolvedValue({ name: "Tester", email: "t@x.com" });
});

describe("share route", () => {
  it("POST 401s when not an editor", async () => {
    (requireRole as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(req(), params("p1"));
    expect(res.status).toBe(401);
    expect(createShareLink).not.toHaveBeenCalled();
  });

  it("POST mints a link and returns its /c/ path", async () => {
    const res = await POST(req(), params("p1"));
    const d = await res.json();
    expect(createShareLink).toHaveBeenCalledWith("p1", "Tester");
    expect(d.path).toBe("/c/raw-token-abc");
  });

  it("DELETE revokes the active link", async () => {
    const res = await DELETE(req(), params("p1"));
    expect(res.status).toBe(200);
    expect(revokeShareLink).toHaveBeenCalledWith("p1", "Tester");
  });

  it("DELETE 401s when not an editor", async () => {
    (requireRole as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await DELETE(req(), params("p1"));
    expect(res.status).toBe(401);
    expect(revokeShareLink).not.toHaveBeenCalled();
  });
});
