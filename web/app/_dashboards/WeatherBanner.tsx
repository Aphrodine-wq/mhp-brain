"use client";

import { useEffect, useState } from "react";

type Day = { name: string; temp: number; rain: number; forecast: string };

// Top-of-dashboard weather card. Auto-loads the NWS forecast (keyless, /api/weather) on mount and
// flags the next rain day so the crew knows before scheduling a pour. A nicety — stays silent on
// loading or error rather than cluttering the dashboard.
export default function WeatherBanner() {
  const [days, setDays] = useState<Day[] | null>(null);
  const [location, setLocation] = useState("");

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const d = await (await fetch("/api/weather")).json();
        if (live && d.ok && d.days?.length) {
          setDays(d.days);
          setLocation(d.location ?? "");
        }
      } catch {
        /* silent — the banner just doesn't render */
      }
    })();
    return () => { live = false; };
  }, []);

  if (!days || !days.length) return null;

  const today = days[0];

  // Renders inline inside the dashboard status strip rather than as its own card — it is
  // ambient context, the same as the active-project count sitting beside it.
  return (
    <div className="wx-inline">
      <div className="wx-today">
        <div>
          <div className="wx-temp">{today.temp}°</div>
          {location && <div className="wx-city">{location}</div>}
        </div>
      </div>
      <div className="wx-days">
        {/* Percentages are gone from the face of the card — day and temp is what gets read at a
            glance. A wet day still tints amber, so a pour-blocking forecast is not lost; the
            exact chance rides in the tooltip. */}
        {days.slice(1, 6).map((d) => (
          <div
            className={`wx-day${d.rain >= 40 ? " wet" : ""}`}
            key={d.name}
            title={`${d.name}: ${d.temp}°, ${d.rain}% chance of rain — ${d.forecast}`}
          >
            <div className="wx-day-name">{d.name}</div>
            <div className="wx-day-temp">{d.temp}°</div>
          </div>
        ))}
      </div>
    </div>
  );
}
