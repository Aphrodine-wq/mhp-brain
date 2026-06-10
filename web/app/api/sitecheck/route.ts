import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

// GET ?address= — pre-bid site check: geocode (Census, keyless) then FEMA NFHL flood
// zone (keyless ArcGIS). Flood zone A*/V* means flood insurance + elevation territory —
// you want to know before the bid, not after the slab.
export async function GET(req: Request) {
  if (!(await requireUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const address = new URL(req.url).searchParams.get("address")?.trim();
  if (!address) return NextResponse.json({ error: "missing address" }, { status: 400 });
  try {
    const geo = await (
      await fetch(
        `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`,
      )
    ).json();
    const match = geo.result?.addressMatches?.[0];
    if (!match) return NextResponse.json({ error: "address not found — try adding city and state" }, { status: 404 });
    const { x: lon, y: lat } = match.coordinates;

    const fema = await (
      await fetch(
        `https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query?geometry=${lon},${lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=FLD_ZONE,ZONE_SUBTY&returnGeometry=false&f=json`,
      )
    ).json();
    const zone = fema.features?.[0]?.attributes;
    const fldZone = zone?.FLD_ZONE ?? "X";
    const highRisk = /^(A|V)/.test(fldZone);
    return NextResponse.json({
      ok: true,
      matched: match.matchedAddress,
      lat, lon,
      floodZone: fldZone,
      subtype: zone?.ZONE_SUBTY ?? "",
      highRisk,
      note: highRisk
        ? "High-risk flood zone — flood insurance and likely elevated foundation. Price it in."
        : "Outside the high-risk flood zones.",
    });
  } catch {
    return NextResponse.json({ error: "geocoder/FEMA unreachable — try again" }, { status: 502 });
  }
}
