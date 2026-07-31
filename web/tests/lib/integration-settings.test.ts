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
  it("upserts (INSERT ... ON CONFLICT DO UPDATE) and truncates the value to 2000 chars", async () => {
    let captured: { sql: string; args: unknown[] } | null = null;
    route((sql, args) => {
      if (/INSERT INTO integration_settings/i.test(sql)) captured = { sql, args };
      return undefined;
    });
    await setSetting("teams", "delta", "x".repeat(2500));
    expect(captured!.sql).toMatch(/ON CONFLICT\(provider, key\) DO UPDATE/i);
    expect((captured!.args[2] as string).length).toBe(2000);
  });

  it("stores a deep link whole — the old 200-char cap silently broke it", async () => {
    // The MHP Teams team URL is 206 characters. Under the previous cap it was stored with the
    // tail of its tenantId sliced off, producing a link that looked fine and did not work.
    const teamsUrl =
      "https://teams.cloud.microsoft/l/team/19%3AOMIfRTu149DJbeUHuid_R52uUG1PnbecxhqYoVhc8SI1%40thread.tacv2" +
      "/conversations?groupId=b6dc7e75-a441-420f-87f5-8eb2b120e7fa&tenantId=d78c0123-03f2-43b3-8fec-7a4af4929185";
    let captured: { sql: string; args: unknown[] } | null = null;
    route((sql, args) => {
      if (/INSERT INTO integration_settings/i.test(sql)) captured = { sql, args };
      return undefined;
    });
    await setSetting("teams", "team_url", teamsUrl);
    expect(captured!.args[2]).toBe(teamsUrl);
    expect((captured!.args[2] as string)).toContain("tenantId=d78c0123-03f2-43b3-8fec-7a4af4929185");
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
