import { NextResponse } from "next/server";
import { verifyIngestSignature, ingestPrices } from "@/lib/price-sensor";

// POST /api/pricing/ingest — machine entrance for the local price scraper. HMAC-signed
// (PRICING_INGEST_SECRET), no session: the scraper runs headless on James's Mac.
// Body: { items: [{ name | id, price, source? }] }; header x-pricing-signature.
export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get("x-pricing-signature") ?? "";
  if (!sig || !verifyIngestSignature(raw, sig)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }
  let items;
  try {
    items = JSON.parse(raw).items;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  if (!Array.isArray(items)) return NextResponse.json({ error: "items must be an array" }, { status: 400 });
  const updated = await ingestPrices(items.slice(0, 200));
  return NextResponse.json({ ok: true, updated });
}
