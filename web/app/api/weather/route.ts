import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getSetting } from "@/lib/integration-settings";

// GET — 7-day NWS forecast for the configured job-market coordinates (default Oxford, MS).
// Keyless government API; the schedule-a-pour integration.
export async function GET() {
  if (!(await requireUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const lat = await getSetting("weather", "lat", "34.3665");
    const lon = await getSetting("weather", "lon", "-89.5192");
    const ua = { headers: { "User-Agent": "MHP-Brain (admin@northmshomepros.com)" } };
    const point = await (await fetch(`https://api.weather.gov/points/${lat},${lon}`, ua)).json();
    const fc = await (await fetch(point.properties.forecast, ua)).json();
    const periods = (fc.properties.periods as {
      name: string; temperature: number; probabilityOfPrecipitation?: { value: number | null }; shortForecast: string; isDaytime: boolean;
    }[]).filter((p) => p.isDaytime).slice(0, 7);
    // weather.gov hands back the nearest place name on the points lookup — use it so the banner
    // names the actual configured market instead of a hardcoded city that goes stale with lat/lon.
    const rl = point.properties?.relativeLocation?.properties;
    const location = rl?.city && rl?.state ? `${rl.city}, ${rl.state}` : "";
    return NextResponse.json({
      ok: true,
      location,
      days: periods.map((p) => ({
        name: p.name,
        temp: p.temperature,
        rain: p.probabilityOfPrecipitation?.value ?? 0,
        forecast: p.shortForecast,
      })),
    });
  } catch {
    return NextResponse.json({ error: "weather.gov unreachable" }, { status: 502 });
  }
}
