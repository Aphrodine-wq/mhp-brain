"use client";

import { useEffect, useState } from "react";

type Day = { name: string; temp: number; rain: number; forecast: string };

// Top-of-dashboard weather line. Auto-loads the NWS forecast (keyless, /api/weather) on mount and
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
  // First day in the window (today included) with a real rain chance — the one to plan around.
  const wet = days.find((d) => d.rain >= 40);

  return (
    <div className="wx-banner">
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
        <circle cx="9" cy="9" r="4.5" fill="#FBBC04" />
        <path d="M7 18a4.2 4.2 0 0 1 .4-8.4 5.4 5.4 0 0 1 10.4 1.5A3.5 3.5 0 0 1 17.5 18z" fill="#9bb7e6" stroke="#5b87c9" strokeWidth=".8" />
      </svg>
      <span>
        {location ? `${location} · ` : ""}{today.temp}° {today.forecast}
      </span>
      {wet ? (
        <span className="wx-flag">· Rain {wet.name} ({wet.rain}%) — hold the pour</span>
      ) : (
        <span style={{ color: "var(--muted)" }}>· Clear stretch — good to pour</span>
      )}
    </div>
  );
}
