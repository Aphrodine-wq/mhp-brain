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

  return (
    <div className="wx-card">
      <div className="wx-today">
        <div className="wx-icon" aria-hidden>
          <svg viewBox="0 0 24 24" width="26" height="26">
            <circle cx="9" cy="9" r="4.5" fill="#FBBC04" />
            <path d="M7 18a4.2 4.2 0 0 1 .4-8.4 5.4 5.4 0 0 1 10.4 1.5A3.5 3.5 0 0 1 17.5 18z" fill="#9bb7e6" stroke="#5b87c9" strokeWidth=".8" />
          </svg>
        </div>
        <div>
          <div className="wx-temp">{today.temp}°</div>
          {location && <div className="wx-city">{location}</div>}
        </div>
      </div>
      <div className="wx-days">
        {days.slice(1, 6).map((d) => (
          <div className={`wx-day${d.rain >= 40 ? " wet" : ""}`} key={d.name}>
            <div className="wx-day-name">{d.name}</div>
            <div className="wx-day-temp">{d.temp}°</div>
            <div className="wx-day-rain">{d.rain}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}
