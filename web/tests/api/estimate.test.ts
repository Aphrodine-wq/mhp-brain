import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/scope-ai", () => ({ aiScope: vi.fn() }));
vi.mock("@/lib/vision", () => ({ photosToScope: vi.fn().mockResolvedValue("") }));
vi.mock("@/lib/pricing", () => ({ buildLines: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/parse-job", () => ({ parseJobText: vi.fn().mockReturnValue({ descriptions: ["Parsed Line"], detected: { sqft: null, lft: null }, notes: [] }) }));
vi.mock("@/lib/assemblies", () => ({ expandAssembly: vi.fn(), ASSEMBLIES: {} }));

import { POST } from "@/app/api/estimate/route";
import { requireUser } from "@/lib/auth";
import { aiScope } from "@/lib/scope-ai";
import { photosToScope } from "@/lib/vision";
import { buildLines } from "@/lib/pricing";
import { parseJobText } from "@/lib/parse-job";

const post = (body: unknown) =>
  POST(new Request("http://t/api/estimate", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));

beforeEach(() => {
  vi.clearAllMocks();
  (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue({ email: "u@x.com" });
  (photosToScope as ReturnType<typeof vi.fn>).mockResolvedValue("");
  (buildLines as ReturnType<typeof vi.fn>).mockResolvedValue([]);
});

describe("POST /api/estimate", () => {
  it("401s when unauthenticated", async () => {
    (requireUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    expect((await post({ description: "x" })).status).toBe(401);
  });

  it("falls back to the deterministic parser when ConstructionAI is not wired", async () => {
    (aiScope as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await post({ description: "kitchen remodel" });
    expect(parseJobText).toHaveBeenCalled();
    expect(buildLines).toHaveBeenCalledWith(["Parsed Line"], expect.anything());
  });

  it("uses the ConstructionAI scope when available (parser not called)", async () => {
    (aiScope as ReturnType<typeof vi.fn>).mockResolvedValue({ descriptions: ["AI Footings"], qtyByCanon: undefined });
    await post({ description: "pour footings" });
    expect(parseJobText).not.toHaveBeenCalled();
    expect(buildLines).toHaveBeenCalledWith(["AI Footings"], expect.anything(), undefined);
  });

  it("folds vision scope from uploaded photos into the build input", async () => {
    (aiScope as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (photosToScope as ReturnType<typeof vi.fn>).mockResolvedValue("VISION SCOPE TEXT");
    await post({ description: "see photos", docs: [{ name: "a.png", mime: "image/png", data: "b64" }] });
    expect(photosToScope).toHaveBeenCalledWith([{ mime: "image/png", data: "b64" }]);
    const arg = (parseJobText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(arg).toContain("VISION SCOPE TEXT");
  });

  it("ignores photos when no vision key is set (photosToScope returns empty)", async () => {
    (aiScope as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await post({ description: "just text", docs: [{ name: "a.png", mime: "image/png", data: "b64" }] });
    const arg = (parseJobText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(arg).toContain("just text");
  });
});
