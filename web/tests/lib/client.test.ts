import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { post, patch } from "@/lib/client";

// The shared client writer. The X-MHP-Write header is a cheap CSRF guard (a cross-site form/img
// can't set a custom header without a preflight the server fails), so pin that it's always sent,
// and that a non-ok response throws rather than silently swallowing a failed write.
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
}

describe("client post/patch", () => {
  it("POSTs JSON with the X-MHP-Write CSRF header and returns the parsed body", async () => {
    fetchMock.mockResolvedValue(ok({ ok: true, id: 5 }));
    const res = await post<{ id: number }>("/api/x", { a: 1 });
    expect(res.id).toBe(5);
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/x");
    expect(init.method).toBe("POST");
    expect(init.headers["X-MHP-Write"]).toBe("1");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ a: 1 });
  });

  it("PATCH uses the PATCH method and the same write header", async () => {
    fetchMock.mockResolvedValue(ok({ ok: true }));
    await patch("/api/y", { b: 2 });
    expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");
    expect(fetchMock.mock.calls[0][1].headers["X-MHP-Write"]).toBe("1");
  });

  it("throws on a non-ok response (surfaces the server error text)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, text: async () => "bad field", json: async () => ({}) });
    await expect(post("/api/x", {})).rejects.toThrow("bad field");
  });

  it("throws the status code when the error body is empty", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => "", json: async () => ({}) });
    await expect(post("/api/x", {})).rejects.toThrow("500");
  });
});
