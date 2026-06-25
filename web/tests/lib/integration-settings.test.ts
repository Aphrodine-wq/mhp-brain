import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ db: { execute: vi.fn() } }));

import { getSetting, setSetting, allSettings } from "@/lib/integration-settings";
import { db } from "@/lib/db";

const execute = db.execute as ReturnType<typeof vi.fn>;

// Route every call by SQL so the one-time CREATE TABLE (ensure()) never interferes with assertions.
function route(handler: (sql: string, args: unknown[]) => unknown) {
  execute.mockImplementation((q: string | { sql: string; args?: unknown[] }) => {
    const sql = typeof q === "string" ? q : q.sql;
    const args = typeof q === "string" ? [] : q.args ?? [];
    return Promise.resolve(handler(sql, args) ?? { rows: [] });
  });
}

beforeEach(() => vi.clearAllMocks());

describe("getSetting", () => {
  it("returns the stored value when present", async () => {
    route((sql) => (/SELECT value/i.test(sql) ? { rows: [{ value: "on" }] } : undefined));
    expect(await getSetting("alerts", "bid_guard", "off")).toBe("on");
  });

  it("returns the fallback when the row is missing or value is null", async () => {
    route((sql) => (/SELECT value/i.test(sql) ? { rows: [] } : undefined));
    expect(await getSetting("alerts", "bid_guard", "off")).toBe("off");
    route((sql) => (/SELECT value/i.test(sql) ? { rows: [{ value: null }] } : undefined));
    expect(await getSetting("alerts", "bid_guard", "off")).toBe("off");
  });
});

describe("setSetting", () => {
  it("upserts (INSERT ... ON CONFLICT DO UPDATE) and truncates the value to 200 chars", async () => {
    let captured: { sql: string; args: unknown[] } | null = null;
    route((sql, args) => {
      if (/INSERT INTO integration_settings/i.test(sql)) captured = { sql, args };
      return undefined;
    });
    await setSetting("teams", "delta", "x".repeat(250));
    expect(captured!.sql).toMatch(/ON CONFLICT\(provider, key\) DO UPDATE/i);
    expect((captured!.args[2] as string).length).toBe(200);
  });
});

describe("allSettings", () => {
  it("nests rows into { provider: { key: value } }", async () => {
    route((sql) =>
      /SELECT provider, key, value/i.test(sql)
        ? {
            rows: [
              { provider: "alerts", key: "bid_guard", value: "on" },
              { provider: "alerts", key: "payment_received", value: "off" },
              { provider: "teams", key: "delta", value: "abc" },
            ],
          }
        : undefined,
    );
    expect(await allSettings()).toEqual({
      alerts: { bid_guard: "on", payment_received: "off" },
      teams: { delta: "abc" },
    });
  });
});
