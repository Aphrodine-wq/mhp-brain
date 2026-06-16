import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "crypto";

vi.mock("@/lib/db", () => ({ db: { execute: vi.fn() } }));
vi.mock("@/lib/alerts", () => ({ sendAlert: vi.fn() }));

import { verifyIngestSignature, ingestPrices } from "@/lib/price-sensor";
import { db } from "@/lib/db";
import { sendAlert } from "@/lib/alerts";

const execute = db.execute as ReturnType<typeof vi.fn>;
const alert = sendAlert as ReturnType<typeof vi.fn>;

const sign = (body: string, secret: string) => createHmac("sha256", secret).update(body).digest("hex");

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  delete process.env.PRICING_INGEST_SECRET;
});

describe("verifyIngestSignature", () => {
  it("accepts a correctly-signed body", () => {
    process.env.PRICING_INGEST_SECRET = "s3cret";
    const body = '{"items":[]}';
    expect(verifyIngestSignature(body, sign(body, "s3cret"))).toBe(true);
  });

  it("rejects a wrong signature", () => {
    process.env.PRICING_INGEST_SECRET = "s3cret";
    expect(verifyIngestSignature('{"items":[]}', "deadbeef")).toBe(false);
  });

  it("rejects when the body was tampered with", () => {
    process.env.PRICING_INGEST_SECRET = "s3cret";
    const good = sign('{"items":[]}', "s3cret");
    expect(verifyIngestSignature('{"items":[1]}', good)).toBe(false);
  });

  it("rejects when no secret is configured (fails closed)", () => {
    delete process.env.PRICING_INGEST_SECRET;
    const body = '{"items":[]}';
    expect(verifyIngestSignature(body, sign(body, "anything"))).toBe(false);
  });

  it("rejects a signature of mismatched length without throwing", () => {
    process.env.PRICING_INGEST_SECRET = "s3cret";
    expect(verifyIngestSignature("body", "ab")).toBe(false);
  });
});

describe("ingestPrices", () => {
  it("skips non-finite and non-positive prices", async () => {
    const n = await ingestPrices([
      { name: "X", price: 0 },
      { name: "Y", price: -5 },
      { name: "Z", price: NaN },
    ]);
    expect(n).toBe(0);
    // ensure() runs CREATE TABLE; no per-item UPDATE should have fired
    const updates = execute.mock.calls.filter((c) => /UPDATE tracked_materials/i.test(typeof c[0] === "string" ? c[0] : c[0].sql));
    expect(updates.length).toBe(0);
    expect(alert).not.toHaveBeenCalled();
  });

  it("updates by id and counts each landed row", async () => {
    execute.mockImplementation(async (q) => {
      const sql = typeof q === "string" ? q : q.sql;
      if (/UPDATE tracked_materials/i.test(sql)) return { rows: [{ name: "2x4 Stud", old_price: null }] };
      return { rows: [] };
    });
    const n = await ingestPrices([{ id: "m1", price: 4.5 }]);
    expect(n).toBe(1);
    expect(alert).not.toHaveBeenCalled(); // no old price → no mover
  });

  it("alerts on a double-digit price move", async () => {
    execute.mockImplementation(async (q) => {
      const sql = typeof q === "string" ? q : q.sql;
      if (/UPDATE tracked_materials/i.test(sql)) return { rows: [{ name: "OSB Sheathing", old_price: 30 }] };
      return { rows: [] };
    });
    const n = await ingestPrices([{ name: "OSB Sheathing", price: 39 }]); // +30%
    expect(n).toBe(1);
    expect(alert).toHaveBeenCalledOnce();
    const payload = alert.mock.calls[0][0];
    expect(payload.urgent).toBe(true);
    expect(payload.lines[0]).toContain("OSB Sheathing");
    expect(payload.lines[0]).toContain("+30%");
  });

  it("does NOT alert on a sub-10% move", async () => {
    execute.mockImplementation(async (q) => {
      const sql = typeof q === "string" ? q : q.sql;
      if (/UPDATE tracked_materials/i.test(sql)) return { rows: [{ name: "Drywall", old_price: 100 }] };
      return { rows: [] };
    });
    await ingestPrices([{ name: "Drywall", price: 105 }]); // +5%
    expect(alert).not.toHaveBeenCalled();
  });

  it("reports a negative mover with a downward arrow sign", async () => {
    execute.mockImplementation(async (q) => {
      const sql = typeof q === "string" ? q : q.sql;
      if (/UPDATE tracked_materials/i.test(sql)) return { rows: [{ name: "Copper Wire", old_price: 200 }] };
      return { rows: [] };
    });
    await ingestPrices([{ name: "Copper Wire", price: 160 }]); // -20%
    const payload = alert.mock.calls[0][0];
    expect(payload.lines[0]).toContain("-20%");
  });

  it("does not count rows the UPDATE failed to match", async () => {
    execute.mockImplementation(async (q) => {
      const sql = typeof q === "string" ? q : q.sql;
      if (/UPDATE tracked_materials/i.test(sql)) return { rows: [] }; // no row matched the name
      return { rows: [] };
    });
    const n = await ingestPrices([{ name: "Unknown Material", price: 12 }]);
    expect(n).toBe(0);
  });
});
